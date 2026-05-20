"""e-Stat（政府統計の総合窓口）API クライアント。

RESAS API 終了（2025/3/24）に伴い、本モジュールが LQ 計算の
**唯一のデータソース**。経済センサス活動調査の産業別従業者数を
直接取得し、calculator.py で LQ を自主計算する。

API 仕様: https://www.e-stat.go.jp/api/api-info/e-stat-manual3-0

データフロー:
  1. search_stats() で経済センサスの statsDataId を特定
  2. get_employment_by_industry() で地域/全国の従業者数を取得
  3. data/transforms.py 経由で calculator.lq_table() に渡す
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pandas as pd

from api.base import APIError, APIKeyMissingError, CachedAPIClient
from config import ESTAT_BASE_URL

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 政府統計コード（statsCode）
# ---------------------------------------------------------------------------
STATS_CODE_ECONOMIC_CENSUS = "00200553"  # 経済センサス‐活動調査
STATS_CODE_POPULATION_CENSUS = "00200521"  # 国勢調査
STATS_CODE_HOUSEHOLD_SURVEY = "00200561"  # 家計調査

# ---------------------------------------------------------------------------
# 経済センサス検索キーワード
# getStatsList の searchWord で使用
# ---------------------------------------------------------------------------
CENSUS_SEARCH_EMPLOYMENT = "産業大分類 従業者数 都道府県 市区町村"
CENSUS_SEARCH_POPULATION = "人口 男女 都道府県 市区町村"


class EStatClient(CachedAPIClient):
    """e-Stat API v3 ラッパー。"""

    def __init__(
        self,
        app_id: str,
        cache_dir: Path | None = None,
        cache_ttl: int = 86400,
    ) -> None:
        if not app_id:
            raise APIKeyMissingError(
                "ESTAT_APP_ID が設定されていません。"
                "https://www.e-stat.go.jp/api/ で取得してください。"
            )
        super().__init__(
            base_url=ESTAT_BASE_URL,
            default_params={"appId": app_id},
            cache_dir=cache_dir,
            cache_ttl=cache_ttl,
        )

    # ----- 統計表検索 -----

    def search_stats(
        self,
        search_word: str,
        survey_years: str | None = None,
        limit: int = 10,
    ) -> list[dict]:
        """統計表を検索する。

        Parameters
        ----------
        search_word : 検索キーワード
        survey_years : 調査年（例: "2021"）
        limit : 最大件数

        Returns
        -------
        list[dict]: 統計表リスト
        """
        params: dict[str, Any] = {
            "lang": "J",
            "searchWord": search_word,
            "limit": limit,
        }
        if survey_years:
            params["surveyYears"] = survey_years
        resp = self.get("app/json/getStatsList", params)
        try:
            table_inf = resp["GET_STATS_LIST"]["DATALIST_INF"]["TABLE_INF"]
            if isinstance(table_inf, dict):
                return [table_inf]
            return table_inf if isinstance(table_inf, list) else []
        except (KeyError, TypeError):
            return []

    # ----- 統計データ取得 -----

    def get_stats_data(
        self,
        stats_data_id: str,
        cd_area: str | None = None,
        cd_cat01: str | None = None,
        limit: int = 100000,
        start_position: int = 1,
    ) -> list[dict]:
        """統計データを取得する。

        Parameters
        ----------
        stats_data_id : 統計表 ID
        cd_area : 地域コード（5桁）でフィルタ
        cd_cat01 : カテゴリ01 コードでフィルタ
        limit : 取得件数上限
        start_position : 取得開始位置

        Returns
        -------
        list[dict]: VALUE オブジェクトのリスト
        """
        params: dict[str, Any] = {
            "lang": "J",
            "statsDataId": stats_data_id,
            "limit": limit,
            "startPosition": start_position,
        }
        if cd_area:
            params["cdArea"] = cd_area
        if cd_cat01:
            params["cdCat01"] = cd_cat01

        resp = self.get("app/json/getStatsData", params)
        try:
            values = resp["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
            if isinstance(values, dict):
                return [values]
            return values if isinstance(values, list) else []
        except (KeyError, TypeError):
            return []

    def get_stats_data_as_df(
        self,
        stats_data_id: str,
        cd_area: str | None = None,
        cd_cat01: str | None = None,
    ) -> pd.DataFrame:
        """統計データを DataFrame で返す。

        ページネーション対応: NEXT_KEY がある限り追加取得する。
        """
        all_values: list[dict] = []
        start = 1
        page_size = 100000

        while True:
            values = self.get_stats_data(
                stats_data_id,
                cd_area=cd_area,
                cd_cat01=cd_cat01,
                limit=page_size,
                start_position=start,
            )
            all_values.extend(values)
            if len(values) < page_size:
                break
            start += page_size

        if not all_values:
            return pd.DataFrame()
        return pd.DataFrame(all_values)

    # ----- 高レベル便利メソッド -----

    def get_employment_by_industry(
        self,
        stats_data_id: str,
        area_code: str,
    ) -> dict[str, float]:
        """特定地域の産業別従業者数を取得。

        Parameters
        ----------
        stats_data_id : 経済センサスの統計表ID
        area_code : 5桁地域コード

        Returns
        -------
        dict[str, float]: {産業分類名: 従業者数}
        """
        df = self.get_stats_data_as_df(stats_data_id, cd_area=area_code)
        if df.empty:
            logger.warning("e-Stat: データが取得できませんでした (area=%s)", area_code)
            return {}

        result: dict[str, float] = {}
        for _, row in df.iterrows():
            # e-Stat VALUE の構造: @cat01 = 産業分類, $ = 値
            industry_name = str(row.get("@cat01", ""))
            value_str = str(row.get("$", "0"))
            try:
                value = float(value_str.replace(",", ""))
            except ValueError:
                value = 0.0
            if industry_name and value > 0:
                result[industry_name] = result.get(industry_name, 0.0) + value

        return result

    # ----- 経済センサス特化メソッド（LQ計算の核心） -----

    def find_census_table(
        self,
        search_word: str = CENSUS_SEARCH_EMPLOYMENT,
        stats_code: str = STATS_CODE_ECONOMIC_CENSUS,
        survey_years: str | None = None,
    ) -> str | None:
        """経済センサスの統計表 ID を自動検索する。

        Parameters
        ----------
        search_word : 検索キーワード
        stats_code : 政府統計コード
        survey_years : 調査年（例: "2021"）

        Returns
        -------
        str or None: 最初にマッチした statsDataId
        """
        params: dict[str, Any] = {
            "lang": "J",
            "statsCode": stats_code,
            "searchWord": search_word,
            "limit": 20,
        }
        if survey_years:
            params["surveyYears"] = survey_years

        resp = self.get("app/json/getStatsList", params)
        try:
            datalist = resp["GET_STATS_LIST"]["DATALIST_INF"]
            table_inf = datalist.get("TABLE_INF", [])
            if isinstance(table_inf, dict):
                table_inf = [table_inf]
            if not table_inf:
                return None
            # 最初の統計表の ID を返す
            first = table_inf[0]
            stats_id = first.get("@id")
            title = ""
            title_obj = first.get("TITLE", "")
            if isinstance(title_obj, dict):
                title = title_obj.get("$", "")
            elif isinstance(title_obj, str):
                title = title_obj
            logger.info("経済センサス統計表を検出: id=%s, title=%s", stats_id, title)
            return stats_id
        except (KeyError, TypeError, IndexError):
            logger.warning("経済センサス統計表が見つかりませんでした")
            return None

    def list_census_tables(
        self,
        stats_code: str = STATS_CODE_ECONOMIC_CENSUS,
        search_word: str = "",
        survey_years: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, str]]:
        """経済センサスの統計表一覧を返す（テーブル選択UI用）。

        Returns
        -------
        list[dict]: [{"id": "0003459335", "title": "産業大分類別...", "survey_date": "202106"}, ...]
        """
        params: dict[str, Any] = {
            "lang": "J",
            "statsCode": stats_code,
            "limit": limit,
        }
        if search_word:
            params["searchWord"] = search_word
        if survey_years:
            params["surveyYears"] = survey_years

        resp = self.get("app/json/getStatsList", params)
        try:
            datalist = resp["GET_STATS_LIST"]["DATALIST_INF"]
            table_inf = datalist.get("TABLE_INF", [])
            if isinstance(table_inf, dict):
                table_inf = [table_inf]
        except (KeyError, TypeError):
            return []

        results = []
        for t in table_inf:
            title_obj = t.get("TITLE", "")
            if isinstance(title_obj, dict):
                title = title_obj.get("$", "")
            elif isinstance(title_obj, str):
                title = title_obj
            else:
                title = str(title_obj)

            results.append({
                "id": t.get("@id", ""),
                "title": title,
                "survey_date": t.get("SURVEY_DATE", ""),
                "stats_name": str(t.get("STAT_NAME", {}).get("$", ""))
                if isinstance(t.get("STAT_NAME"), dict) else "",
            })
        return results

    def get_prefectures_list(self) -> list[dict[str, str]]:
        """e-Stat の地域コード体系から都道府県一覧を返す。

        RESAS API 終了後の代替。静的データ（data/codes.py）で十分だが、
        市区町村一覧はこのメソッドで動的取得する。
        """
        # e-Stat には直接の都道府県一覧 API がないため、
        # data/codes.py の PREFECTURES を使用するのが推奨。
        # このメソッドは将来の拡張用スタブ。
        from data.codes import PREFECTURES
        return [
            {"code": f"{code:02d}000", "name": name}
            for code, name in PREFECTURES.items()
        ]

    def get_municipalities(
        self,
        pref_code: int,
        stats_data_id: str | None = None,
    ) -> list[dict[str, str]]:
        """特定都道府県の市区町村一覧を返す。

        経済センサスのメタ情報から地域コードを抽出する方法。
        stats_data_id が指定されていればそこから取得。
        """
        if not stats_data_id:
            return []

        params: dict[str, Any] = {
            "lang": "J",
            "statsDataId": stats_data_id,
            "lvArea": "3",  # 市区町村レベル
        }

        resp = self.get("app/json/getMetaInfo", params)
        try:
            class_inf = resp["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
            for obj in class_inf:
                if obj.get("@id") == "area":
                    class_list = obj.get("CLASS", [])
                    if isinstance(class_list, dict):
                        class_list = [class_list]
                    municipalities = []
                    pref_prefix = f"{pref_code:02d}"
                    for c in class_list:
                        code = c.get("@code", "")
                        name = c.get("@name", "")
                        if code.startswith(pref_prefix) and code != f"{pref_prefix}000":
                            municipalities.append({"code": code, "name": name})
                    return municipalities
        except (KeyError, TypeError):
            pass
        return []


def create_estat_client(
    app_id: str,
    cache_dir: Path | None = None,
    cache_ttl: int = 86400,
) -> EStatClient:
    """e-Stat クライアントのファクトリ関数。"""
    return EStatClient(app_id=app_id, cache_dir=cache_dir, cache_ttl=cache_ttl)
