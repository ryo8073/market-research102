"""RESAS（地域経済分析システム）API クライアント。

CI102 の経済基盤分析(EBA)・LQ 計算の最重要データソース。
エンドポイント仕様: https://opendata.resas-portal.go.jp/docs/api/v1/

Pre-mortem リスク #1 緩和:
  RESAS の産業別特化係数 API はデータ年が 2012/2016 に限定。
  最新データが必要な場合は e-Stat 経由で自主計算する。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from api.base import APIKeyMissingError, CachedAPIClient
from config import RESAS_BASE_URL


class RESASClient(CachedAPIClient):
    """RESAS API ラッパー。"""

    def __init__(
        self,
        api_key: str,
        cache_dir: Path | None = None,
        cache_ttl: int = 86400,
    ) -> None:
        if not api_key:
            raise APIKeyMissingError(
                "RESAS_API_KEY が設定されていません。"
                "https://opendata.resas-portal.go.jp/ で取得してください。"
            )
        super().__init__(
            base_url=RESAS_BASE_URL,
            default_headers={"X-API-KEY": api_key},
            cache_dir=cache_dir,
            cache_ttl=cache_ttl,
        )

    def _get_result(self, endpoint: str, params: dict[str, Any] | None = None) -> Any:
        """RESAS 共通: レスポンスから result を抽出。"""
        resp = self.get(endpoint, params)
        if resp.get("message"):
            from api.base import APIError
            raise APIError(400, f"RESAS error: {resp['message']}")
        return resp.get("result")

    # ----- 基本マスタ -----

    def get_prefectures(self) -> list[dict]:
        """都道府県一覧を取得。"""
        result = self._get_result("api/v1/prefectures")
        return result if isinstance(result, list) else []

    def get_cities(self, pref_code: int) -> list[dict]:
        """市区町村一覧を取得。

        Returns: [{"prefCode": 13, "cityCode": "13101", "cityName": "千代田区", "bigCityFlag": "2"}, ...]
        """
        result = self._get_result("api/v1/cities", {"prefCode": pref_code})
        return result if isinstance(result, list) else []

    # ----- 産業分析（LQ の核心） -----

    def get_industry_power_for_industry(
        self,
        pref_code: int,
        city_code: str,
        simc_code: str = "-",
    ) -> list[dict]:
        """産業別特化係数を取得。

        Parameters
        ----------
        pref_code : 都道府県コード (1-47)
        city_code : 市区町村コード ("13101" 等) または "-" (県全体)
        simc_code : 産業中分類コード または "-" (全産業)

        Returns
        -------
        list[dict]:
            各要素は {"simcCode": "06", "simcName": "総合工事業",
                      "value": 0.97, "employee": 1.23, "labor": 0.51}
            employee が従業者数ベースの LQ。
        """
        params = {
            "prefCode": pref_code,
            "cityCode": city_code,
            "simcCode": simc_code,
        }
        result = self._get_result("api/v1/industry/power/forIndustry", params)
        if result is None:
            return []
        # result は dict で data キーにリストが入っている場合がある
        if isinstance(result, dict):
            return result.get("data", [])
        return result if isinstance(result, list) else []

    def get_industry_power_for_area(
        self,
        pref_code: int,
        city_code: str,
        simc_code: str,
    ) -> list[dict]:
        """地域別特化係数（特定産業の全市区町村比較）を取得。"""
        params = {
            "prefCode": pref_code,
            "cityCode": city_code,
            "simcCode": simc_code,
        }
        result = self._get_result("api/v1/industry/power/forArea", params)
        if result is None:
            return []
        if isinstance(result, dict):
            return result.get("data", [])
        return result if isinstance(result, list) else []

    # ----- 人口データ -----

    def get_population(
        self,
        pref_code: int,
        city_code: str,
    ) -> dict:
        """人口構成データを取得。

        Returns: {"boundaryYear": 2020, "data": [{"label": "総人口", "data": [{"year": 2020, "value": 1234567}, ...]}, ...]}
        """
        params = {
            "prefCode": pref_code,
            "cityCode": city_code,
            "addArea": "",
        }
        result = self._get_result("api/v1/population/composition/perYear", params)
        return result if isinstance(result, dict) else {}

    # ----- 産業構造 -----

    def get_industry_composition(
        self,
        pref_code: int,
        city_code: str,
    ) -> list[dict]:
        """産業構成（従業者数）を取得。"""
        params = {
            "prefCode": pref_code,
            "cityCode": city_code,
            "sicCode": "-",
            "simcCode": "-",
        }
        result = self._get_result(
            "api/v1/industry/structure/industrialComposition", params
        )
        if result is None:
            return []
        if isinstance(result, dict):
            return result.get("data", [])
        return result if isinstance(result, list) else []


def create_resas_client(
    api_key: str,
    cache_dir: Path | None = None,
    cache_ttl: int = 86400,
) -> RESASClient:
    """RESAS クライアントのファクトリ関数。"""
    return RESASClient(api_key=api_key, cache_dir=cache_dir, cache_ttl=cache_ttl)
