"""日本の公的オープンデータ API クライアント層。

設計方針:
- 各 API を抽象クラス DataSource の実装として提供
- API キー未設定の場合は sample_data からのフォールバックを許容
- ネットワーク失敗時もアプリが落ちないように try/except でラップ
- レスポンスは pandas DataFrame に統一して返す

実装している API:
  - RESAS API（産業別特化係数）
  - e-Stat API（経済センサス・家計調査）
  - 不動産情報ライブラリ API（取引価格情報）
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional

import pandas as pd
import requests

import sample_data


def _get_api_key(name: str) -> Optional[str]:
    """環境変数から API キーを取得。.env も読み込む。"""
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    return os.environ.get(name) or None


# ---------------------------------------------------------------------------
# RESAS API
# ---------------------------------------------------------------------------

@dataclass
class ResasClient:
    """地域経済分析システム RESAS API クライアント。

    https://opendata.resas-portal.go.jp/docs/api/v1/index.html
    """

    api_key: Optional[str] = None
    base_url: str = "https://opendata.resas-portal.go.jp/api/v1"
    timeout: int = 15

    def __post_init__(self):
        if self.api_key is None:
            self.api_key = _get_api_key("RESAS_API_KEY")

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def industry_specialization(
        self,
        year: int,
        pref_code: int,
        city_code: int,
        sic_code: str = "-",
    ) -> Optional[pd.DataFrame]:
        """産業別特化係数を取得。

        ロードマップ参照: GET /industry/power/forIndustry
        Returns DataFrame columns: simcCode, simcName, value, employee, labor
        """
        if not self.available:
            return None
        try:
            r = requests.get(
                f"{self.base_url}/industry/power/forIndustry",
                params={
                    "year": year,
                    "prefCode": pref_code,
                    "cityCode": city_code,
                    "sicCode": sic_code,
                },
                headers={"X-API-KEY": self.api_key},
                timeout=self.timeout,
            )
            r.raise_for_status()
            payload = r.json()
            data = (payload.get("result") or {}).get("data") or []
            if not data:
                return None
            return pd.DataFrame(data)
        except requests.RequestException:
            return None


# ---------------------------------------------------------------------------
# e-Stat API
# ---------------------------------------------------------------------------

@dataclass
class EStatClient:
    """e-Stat（政府統計の総合窓口） API クライアント。

    https://www.e-stat.go.jp/api/
    """

    app_id: Optional[str] = None
    base_url: str = "https://api.e-stat.go.jp/rest/3.0/app/json"
    timeout: int = 20

    def __post_init__(self):
        if self.app_id is None:
            self.app_id = _get_api_key("ESTAT_APP_ID")

    @property
    def available(self) -> bool:
        return bool(self.app_id)

    def stats_data(self, stats_data_id: str, **kwargs) -> Optional[dict]:
        """getStatsData エンドポイントの汎用呼び出し。

        統計表 ID を指定して JSON で取得する。詳細パラメータは kwargs で渡す。
        """
        if not self.available:
            return None
        try:
            params = {"appId": self.app_id, "statsDataId": stats_data_id, **kwargs}
            r = requests.get(f"{self.base_url}/getStatsData", params=params, timeout=self.timeout)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            return None


# ---------------------------------------------------------------------------
# 国土交通省 不動産情報ライブラリ API
# ---------------------------------------------------------------------------

@dataclass
class MlitReinfolibClient:
    """不動産情報ライブラリ API クライアント。

    https://www.reinfolib.mlit.go.jp/help/apiManual/
    取引価格情報（XIT001）等を取得。
    """

    api_key: Optional[str] = None
    base_url: str = "https://www.reinfolib.mlit.go.jp/ex-api/external"
    timeout: int = 20

    def __post_init__(self):
        if self.api_key is None:
            self.api_key = _get_api_key("MLIT_API_KEY")

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def transaction_prices(
        self,
        year: int,
        quarter: int,
        pref_code: int,
        city_code: Optional[int] = None,
    ) -> Optional[pd.DataFrame]:
        """取引価格情報（XIT001）を取得。

        Returns DataFrame with columns from MLIT response:
        Type, Region, MunicipalityCode, Prefecture, Municipality, DistrictName,
        TradePrice, PricePerUnit, FloorPlan, Area, UnitPrice, etc.
        """
        if not self.available:
            return None
        try:
            params = {
                "year": year,
                "quarter": quarter,
                "area": pref_code,
            }
            if city_code is not None:
                params["city"] = city_code
            r = requests.get(
                f"{self.base_url}/XIT001",
                params=params,
                headers={"Ocp-Apim-Subscription-Key": self.api_key},
                timeout=self.timeout,
            )
            r.raise_for_status()
            payload = r.json()
            data = payload.get("data") or []
            if not data:
                return None
            return pd.DataFrame(data)
        except requests.RequestException:
            return None


# ---------------------------------------------------------------------------
# Unified data accessor — API → fallback to sample data
# ---------------------------------------------------------------------------

class MarketDataAccessor:
    """API 連携と sample_data フォールバックを統一的に扱うアクセサ。

    RESAS API 終了（2025/3/24）に伴い、e-Stat API を主データソースとする。
    e-Stat 経済センサスから産業別従業者数を直接取得し、LQ を自主計算する。
    未設定または取得失敗時は sample_data にフォールバック。
    """

    def __init__(self):
        self.resas = ResasClient()
        self.estat = EStatClient()
        self.mlit = MlitReinfolibClient()
        # 新 API 層のクライアント
        self._estat_v2 = None
        self._census_df: pd.DataFrame | None = None  # 全国キャッシュ
        self._census_table_id: str | None = None
        self._init_v2_clients()

    def _init_v2_clients(self):
        """新 API 層のクライアントを初期化（キーが設定されている場合）。"""
        try:
            from config import get_settings
            settings = get_settings()
            if settings.has_estat_key:
                from api.estat import create_estat_client
                self._estat_v2 = create_estat_client(
                    app_id=settings.estat_app_id,
                    cache_dir=settings.cache_dir,
                )
        except Exception:
            pass

    def _ensure_census_table(self) -> str | None:
        """経済センサスの統計表 ID をキャッシュ付きで取得。"""
        if self._census_table_id:
            return self._census_table_id
        if self._estat_v2 is None:
            return None
        try:
            table_id = self._estat_v2.find_census_table(survey_years="2021")
            if table_id:
                self._census_table_id = table_id
                return table_id
        except Exception:
            pass
        return None

    def industry_employment(
        self,
        pref_code: int,
        city_code: int,
    ) -> tuple[Mapping[str, float], Mapping[str, float], str]:
        """地域・全国の産業別従業者数を返す。

        Returns (local, national, data_source_label) のタプル。
        e-Stat 経済センサスから直接取得 → 失敗時 sample_data フォールバック。
        """
        # 1. キャッシュ済み全国データから即座に取得（最速）
        census_df = self._ensure_census_cache()
        if census_df is not None:
            try:
                from data.census_cache import get_area_employment, get_national_employment
                area_code = self._build_area_code(pref_code, city_code)
                local_emp = get_area_employment(census_df, area_code)
                national_emp = get_national_employment(census_df)
                if local_emp and national_emp:
                    return (
                        local_emp,
                        national_emp,
                        "e-Stat 経済センサス活動調査 2021（キャッシュ）",
                    )
            except Exception:
                pass

        # 2. API直接取得（キャッシュ未構築時）
        if self._estat_v2 is not None:
            try:
                local_emp, national_emp = self._fetch_employment_from_estat(pref_code, city_code)
                if local_emp and national_emp:
                    return (
                        local_emp,
                        national_emp,
                        "e-Stat 経済センサス活動調査 2021（API直接）",
                    )
            except Exception:
                pass

        # 3. フォールバック: sample_data
        return (
            sample_data.TAKAMATSU_EMP_BY_INDUSTRY,
            sample_data.NATIONAL_EMP_BY_INDUSTRY,
            "sample_data (フォールバック)",
        )

    def _ensure_census_cache(self) -> pd.DataFrame | None:
        """全国キャッシュを読み込み or ダウンロード。"""
        if self._census_df is not None:
            return self._census_df
        try:
            from config import get_settings
            from data.census_cache import load_cached_employment, download_all_employment
            settings = get_settings()
            # まずローカルキャッシュを試行
            df = load_cached_employment(settings.cache_dir)
            if df is not None:
                self._census_df = df
                return df
            # なければダウンロード
            if self._estat_v2 is not None:
                df = download_all_employment(self._estat_v2, settings.cache_dir)
                if not df.empty:
                    self._census_df = df
                    return df
        except Exception:
            pass
        return None

    @staticmethod
    def _build_area_code(pref_code: int, city_code: int) -> str:
        """市区町村コードを5桁地域コードに変換。"""
        if not city_code or city_code == 0:
            return f"{pref_code:02d}000"
        city_str = str(city_code)
        if len(city_str) == 5:
            return city_str
        return f"{pref_code:02d}{city_code % 1000:03d}"

    def get_census_municipalities(self, pref_code: int) -> list[tuple[str, str]]:
        """キャッシュから都道府県内の市区町村リストを返す（UIセレクタ用）。"""
        census_df = self._ensure_census_cache()
        if census_df is None:
            return []
        from data.census_cache import list_areas_by_prefecture
        return list_areas_by_prefecture(census_df, pref_code)

    # 経済センサスの統計表ID・パラメータ定数
    _CENSUS_TABLE_ID = "0003449718"  # 産業大分類別・全事業所・従業者数（全国/都道府県/市区町村）
    _TAB_EMPLOYEES = "113-2021"      # 従業者数_男女計
    _CAT02_TOTAL = "0"               # 経営組織: 総数
    _SKIP_CATEGORIES = {"AS", "AR", "AB", "CR"}  # 集約カテゴリ（スキップ）

    def _fetch_employment_from_estat(
        self, pref_code: int, city_code: int
    ) -> tuple[Mapping[str, float], Mapping[str, float]]:
        """e-Stat 経済センサスから産業大分類別従業者数を取得。

        産業コード（A-T）を日本語名に変換して返す。
        """
        from data.industry_map import JSIC_MAJOR_DIVISIONS

        def _parse_employment(area_code: str) -> dict[str, float]:
            values = self._estat_v2.get_stats_data(
                self._CENSUS_TABLE_ID,
                cd_area=area_code,
                limit=100000,
            )
            result: dict[str, float] = {}
            for v in values:
                if v.get("@tab") != self._TAB_EMPLOYEES:
                    continue
                if v.get("@cat02") != self._CAT02_TOTAL:
                    continue
                cat01 = v.get("@cat01", "")
                if cat01 in self._SKIP_CATEGORIES:
                    continue
                val_str = str(v.get("$", ""))
                if val_str in ("-", "", "…", "x"):
                    continue
                try:
                    val = float(val_str.replace(",", ""))
                except ValueError:
                    continue
                # 産業コード → 日本語名
                name = JSIC_MAJOR_DIVISIONS.get(cat01, cat01)
                result[name] = val
            return result

        # 地域コード構築
        if city_code and city_code > 0:
            local_area = f"{pref_code:02d}{city_code % 1000:03d}" if city_code > 99999 else str(city_code)
            # 5桁形式に正規化 (例: 37201)
            if len(local_area) < 5:
                local_area = f"{pref_code:02d}{city_code:03d}"
        else:
            local_area = f"{pref_code:02d}000"

        local_emp = _parse_employment(local_area)
        national_emp = _parse_employment("00000")
        return local_emp, national_emp

    @staticmethod
    def _normalize_2016_industry_name(name: str) -> str:
        """2016年経済センサスの産業名を2021年形式に正規化。

        2016年は "D建設業" 形式、2021年は "建設業" 形式。
        また G1/G2, O1/O2 等の細分を親カテゴリに集約する。
        """
        # 細分カテゴリは親に集約（スキップして親で合算）
        skip_prefixes = ("G1", "G2", "O1", "O2", "Q1", "Q2", "R1", "R2")
        if any(name.startswith(p) for p in skip_prefixes):
            return ""  # 空文字→集約時にスキップ
        # 先頭のJSICコード文字（ASCII英字）を除去: "D建設業" → "建設業"
        if len(name) > 1 and name[0].isascii() and name[0].isalpha():
            return name[1:]
        return name

    def shift_share_inputs(
        self, pref_code: int, city_code: int
    ) -> tuple[
        Mapping[str, float],
        Mapping[str, float],
        Mapping[str, float],
        Mapping[str, float],
        str,
    ]:
        """シフトシェア分析用の 2016→2021 雇用データを返す。

        Returns (local_t0, local_t1, national_t0, national_t1, source_label)
        """
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_EMPLOYMENT_MAJOR, DS_EMPLOYMENT_MAJOR_2016,
                get_area_employment,
            )
            settings = get_settings()
            area_code = self._build_area_code(pref_code, city_code)

            df_2016 = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MAJOR_2016.csv_name)
            df_2021 = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)

            if df_2016 is not None and df_2021 is not None:
                # 2016年データを正規化
                def _get_normalized_2016(df, area):
                    raw = get_area_employment(df, area)
                    normalized: dict[str, float] = {}
                    for name, val in raw.items():
                        clean = self._normalize_2016_industry_name(name)
                        if clean:
                            normalized[clean] = normalized.get(clean, 0.0) + val
                    return normalized

                local_t0 = _get_normalized_2016(df_2016, area_code)

                # 2016年テーブルには全国(00000)がない → 47都道府県合計で算出
                national_t0: dict[str, float] = {}
                for pc in range(1, 48):
                    pref_data = _get_normalized_2016(df_2016, f"{pc:02d}000")
                    for ind, val in pref_data.items():
                        national_t0[ind] = national_t0.get(ind, 0.0) + val

                local_t1 = get_area_employment(df_2021, area_code)
                national_t1 = get_area_employment(df_2021, "00000")

                # 共通産業のみ使用
                common = set(local_t0.keys()) & set(local_t1.keys()) & set(national_t1.keys())
                if national_t0:
                    common &= set(national_t0.keys())

                if len(common) >= 5:
                    return (
                        {k: local_t0[k] for k in common},
                        {k: local_t1[k] for k in common},
                        {k: national_t0[k] for k in common} if national_t0 else {},
                        {k: national_t1[k] for k in common},
                        "e-Stat 経済センサス 2016→2021",
                    )
        except Exception:
            pass

        # フォールバック
        return (
            sample_data.TAKAMATSU_EMP_T0,
            sample_data.TAKAMATSU_EMP_T1,
            sample_data.NATIONAL_EMP_T0,
            sample_data.NATIONAL_EMP_T1,
            "sample_data (2014→2021 近似)",
        )

    def retail_sectors(self, pref_code: int, city_code: int):
        """小売ギャップ分析用のセクターデータを返す。

        Supply: 経済センサス小売販売額キャッシュ
        Demand: 人口 × 全国平均1人あたり小売支出額（推計）
        """
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_RETAIL_SALES, DS_POPULATION,
                get_area_retail_sales, get_area_population,
            )
            settings = get_settings()
            area_code = self._build_area_code(pref_code, city_code)

            df_retail = load_cached_dataset(settings.cache_dir, DS_RETAIL_SALES.csv_name)
            df_pop = load_cached_dataset(settings.cache_dir, DS_POPULATION.csv_name)

            if df_retail is not None and df_pop is not None:
                supply = get_area_retail_sales(df_retail, area_code)
                pop_data = get_area_population(df_pop, area_code)

                # 人口から需要推計（全国平均の1人あたり消費支出で按分）
                population = pop_data.get("2015年（平成27年）の人口（組替）", 0)

                if supply and population > 0:
                    # 全国の小売販売総額と人口から1人あたり販売額を推計
                    national_supply = get_area_retail_sales(df_retail, "00000")
                    national_pop = get_area_population(df_pop, "00000")
                    nat_population = national_pop.get("2015年（平成27年）の人口（組替）", 0)

                    if nat_population > 0 and national_supply:
                        sectors = []
                        for sector_name, sales in supply.items():
                            nat_sales = national_supply.get(sector_name, 0)
                            if nat_sales > 0:
                                # 需要 = 地域人口 × (全国販売額/全国人口)
                                per_capita = nat_sales / nat_population
                                demand = population * per_capita
                                sectors.append({
                                    "sector": sector_name,
                                    "demand": demand,
                                    "supply": sales,
                                })
                        if sectors:
                            return sectors, "e-Stat 経済センサス 2021（小売販売額 + 人口按分需要推計）"
        except Exception:
            pass

        return sample_data.TAKAMATSU_RETAIL_SECTORS, "sample_data"

    def city_basics(self, pref_code: int, city_code: int) -> dict:
        """対象都市の人口・世帯・総雇用などの基本指標を返す。"""
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_POPULATION, DS_EMPLOYMENT_MAJOR,
                get_area_population, get_area_employment,
            )
            settings = get_settings()
            area_code = self._build_area_code(pref_code, city_code)

            df_pop = load_cached_dataset(settings.cache_dir, DS_POPULATION.csv_name)
            df_emp = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)

            if df_pop is not None and df_emp is not None:
                pop_data = get_area_population(df_pop, area_code)
                emp_data = get_area_employment(df_emp, area_code)

                # 国勢調査2020テーブル: 「2015年の人口(組替)」は2020年境界に
                # 組替えた2015年時点の人口（2020年人口ではない点に注意）
                # 「世帯数」は2020年の世帯数
                population = pop_data.get("2015年（平成27年）の人口（組替）", 0)
                households = pop_data.get("世帯数", 0)

                total_emp = sum(emp_data.values()) if emp_data else 0
                pph = population / households if households > 0 else 2.21

                if population > 0 and total_emp > 0:
                    return {
                        "population": int(population),
                        "households": int(households),
                        "total_employment": int(total_emp),
                        "persons_per_household": round(pph, 2),
                    }
        except Exception:
            pass

        return sample_data.TAKAMATSU

    def api_status(self) -> dict:
        """各 API の接続状況を返す（UIサイドバー表示用）。"""
        return {
            "RESAS API": self.resas.available,
            "e-Stat API": self.estat.available,
            "不動産情報ライブラリ API": self.mlit.available,
        }
