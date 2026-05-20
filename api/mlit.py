"""国土交通省 不動産情報ライブラリ API クライアント。

不動産取引価格情報（XIT001）を取得し、経済指標と不動産価格の
相関分析に使用する。

API 仕様: https://www.reinfolib.mlit.go.jp/ex-api/
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pandas as pd

from api.base import APIKeyMissingError, CachedAPIClient
from config import MLIT_BASE_URL

logger = logging.getLogger(__name__)

# 物件種別コード
PROPERTY_TYPES: dict[int, str] = {
    1: "宅地（土地）",
    2: "宅地（土地と建物）",
    3: "中古マンション等",
    4: "農地",
    5: "林地",
}

# 取引時期フォーマット: YYYYQ (Q=1-4)
# 例: 20231 = 2023年第1四半期


class MLITClient(CachedAPIClient):
    """国交省 不動産情報ライブラリ API ラッパー。"""

    def __init__(
        self,
        api_key: str,
        cache_dir: Path | None = None,
        cache_ttl: int = 86400,
    ) -> None:
        if not api_key:
            raise APIKeyMissingError(
                "MLIT_API_KEY が設定されていません。"
                "https://www.reinfolib.mlit.go.jp/ex-api/ で取得してください。"
            )
        super().__init__(
            base_url=MLIT_BASE_URL,
            default_headers={"Ocp-Apim-Subscription-Key": api_key},
            cache_dir=cache_dir,
            cache_ttl=cache_ttl,
        )

    def get_transactions(
        self,
        pref_code: int,
        from_period: str,
        to_period: str,
        city_code: str | None = None,
        property_type: int | None = None,
    ) -> pd.DataFrame:
        """不動産取引価格情報を取得。

        Parameters
        ----------
        pref_code : 都道府県コード
        from_period : 開始期間 (YYYYQ 形式, e.g. "20231")
        to_period : 終了期間 (YYYYQ 形式, e.g. "20234")
        city_code : 市区町村コード（省略時は県全体）
        property_type : 物件種別コード（1-5, 省略時は全種別）

        Returns
        -------
        pd.DataFrame: 取引データ
        """
        params: dict[str, Any] = {
            "year": from_period,
            "quarter": "",
            "area": f"{pref_code:02d}",
            "from": from_period,
            "to": to_period,
        }
        if city_code:
            params["area"] = city_code
        if property_type:
            params["propertyType"] = property_type

        resp = self.get("XIT001", params)
        data = resp.get("data", [])
        if not data:
            logger.warning(
                "MLIT: 取引データが取得できませんでした (pref=%d, period=%s-%s)",
                pref_code, from_period, to_period,
            )
            return pd.DataFrame()

        df = pd.DataFrame(data)
        return self._clean_transaction_df(df)

    def _clean_transaction_df(self, df: pd.DataFrame) -> pd.DataFrame:
        """取引データの型変換・クリーニング。"""
        if df.empty:
            return df

        # 主要カラムの型変換（存在する場合のみ）
        numeric_cols = [
            "TradePrice", "PricePerUnit", "Area", "UnitPrice",
            "BuildingYear", "FloorPlan",
        ]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # m2 単価の計算（存在しない場合）
        if "TradePrice" in df.columns and "Area" in df.columns:
            mask = (df["Area"] > 0) & df["TradePrice"].notna()
            df.loc[mask, "price_per_m2"] = df.loc[mask, "TradePrice"] / df.loc[mask, "Area"]

        return df


def create_mlit_client(
    api_key: str,
    cache_dir: Path | None = None,
    cache_ttl: int = 86400,
) -> MLITClient:
    """MLIT クライアントのファクトリ関数。"""
    return MLITClient(api_key=api_key, cache_dir=cache_dir, cache_ttl=cache_ttl)
