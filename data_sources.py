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
# RESAS API は 2025/3/24 にサービス終了。クラスを削除済み。
# 旧コードは _archive/resas.py に保存。


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
    """不動産情報ライブラリ API クライアント（キャッシュ付き）。

    https://www.reinfolib.mlit.go.jp/help/apiManual/
    取引価格情報（XIT001）等を取得。

    過去四半期のデータは不変のため CSV キャッシュに保存し、
    同一クエリの再リクエストを防止する。直近四半期のみ
    TTL（デフォルト7日）で再取得する。
    """

    api_key: Optional[str] = None
    base_url: str = "https://www.reinfolib.mlit.go.jp/ex-api/external"
    timeout: int = 20
    cache_dir: Optional[str] = None
    cache_ttl_days: int = 7  # 直近四半期キャッシュの有効期間

    def __post_init__(self):
        if self.api_key is None:
            self.api_key = _get_api_key("MLIT_API_KEY")
        if self.cache_dir is None:
            try:
                from config import get_settings
                self.cache_dir = str(get_settings().cache_dir)
            except Exception:
                pass

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _cache_path(
        self, year: int, quarter: int, pref_code: int, city_code: Optional[int],
    ) -> Optional[str]:
        """キャッシュファイルのパスを返す。"""
        if not self.cache_dir:
            return None
        city_part = f"_{city_code}" if city_code else "_all"
        name = f"mlit_{pref_code:02d}{city_part}_{year}_q{quarter}.csv"
        return os.path.join(self.cache_dir, name)

    def _is_current_quarter(self, year: int, quarter: int) -> bool:
        """指定された年・四半期が直近（データ更新される可能性がある）かを判定。"""
        from datetime import date
        today = date.today()
        current_q = (today.month - 1) // 3 + 1
        current_y = today.year
        # 直近2四半期は更新される可能性がある
        if year == current_y and quarter >= current_q:
            return True
        if year == current_y - 1 and quarter == 4 and current_q == 1:
            return True
        return False

    def _read_cache(
        self, year: int, quarter: int, pref_code: int, city_code: Optional[int],
    ) -> Optional[pd.DataFrame]:
        """キャッシュから読み込み。TTL超過なら None。"""
        import time
        path = self._cache_path(year, quarter, pref_code, city_code)
        if not path or not os.path.exists(path):
            return None
        # 直近四半期はTTLチェック
        if self._is_current_quarter(year, quarter):
            age_days = (time.time() - os.path.getmtime(path)) / 86400
            if age_days > self.cache_ttl_days:
                return None
        try:
            df = pd.read_csv(path, dtype=str)
            return df if not df.empty else None
        except Exception:
            return None

    def _write_cache(
        self, df: pd.DataFrame,
        year: int, quarter: int, pref_code: int, city_code: Optional[int],
    ) -> None:
        """キャッシュに書き込み。"""
        path = self._cache_path(year, quarter, pref_code, city_code)
        if not path:
            return
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            df.to_csv(path, index=False, encoding="utf-8-sig")
        except Exception:
            pass

    def transaction_prices(
        self,
        year: int,
        quarter: int,
        pref_code: int,
        city_code: Optional[int] = None,
    ) -> Optional[pd.DataFrame]:
        """取引価格情報（XIT001）を取得（キャッシュ優先）。

        Returns DataFrame with columns from MLIT response:
        Type, Region, MunicipalityCode, Prefecture, Municipality, DistrictName,
        TradePrice, PricePerUnit, FloorPlan, Area, UnitPrice, etc.
        """
        if not self.available:
            return None

        # 1. キャッシュから読み込み
        cached = self._read_cache(year, quarter, pref_code, city_code)
        if cached is not None:
            return cached

        # 2. API リクエスト
        try:
            params = {
                "year": year,
                "quarter": quarter,
                "area": f"{pref_code:02d}",
            }
            if city_code is not None:
                params["city"] = f"{city_code:05d}"
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
            df = pd.DataFrame(data)

            # 3. キャッシュに保存
            self._write_cache(df, year, quarter, pref_code, city_code)
            return df
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
        self.resas = None  # RESAS API 廃止 (2025/3/24)
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

    def shift_share_inputs_mid(
        self, pref_code: int, city_code: int
    ) -> tuple[
        Mapping[str, float],
        Mapping[str, float],
        Mapping[str, float],
        Mapping[str, float],
        str,
    ]:
        """中分類95業種のシフトシェア入力を返す (2016→2021)。

        2016年データ: e-Stat 0003218646 (H28 中分類民営事業所、scripts/download_mid_2016.py で正規化済み)
        2021年データ: e-Stat 0004005684 (R3 中分類民営事業所)

        両方とも民営事業所のみで、業種コードは JSIC 13次改定 (Rev 13) で完全一致。
        category_code (2桁) を共通キーとして使う。
        """
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_EMPLOYMENT_MID, CSV_EMPLOYMENT_MID_2016,
            )
            settings = get_settings()
            area_code = self._build_area_code(pref_code, city_code)

            df_2016 = load_cached_dataset(settings.cache_dir, CSV_EMPLOYMENT_MID_2016)
            df_2021 = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MID.csv_name)

            if df_2016 is not None and df_2021 is not None:
                local_t0 = self._mid_employment(df_2016, area_code)
                local_t1 = self._mid_employment(df_2021, area_code)
                national_t0 = self._mid_employment(df_2016, "00000")
                national_t1 = self._mid_employment(df_2021, "00000")

                common = set(local_t0) & set(local_t1) & set(national_t0) & set(national_t1)
                if len(common) >= 10:
                    return (
                        {k: local_t0[k] for k in common},
                        {k: local_t1[k] for k in common},
                        {k: national_t0[k] for k in common},
                        {k: national_t1[k] for k in common},
                        "e-Stat 経済センサス 2016→2021（中分類95業種）",
                    )
        except Exception:
            pass

        return ({}, {}, {}, {}, "中分類データなし")

    def metro_shift_share_inputs_mid(self, pref_codes: list[int]):
        """都市圏の中分類シフトシェア入力（複数県合算）。"""
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_EMPLOYMENT_MID, CSV_EMPLOYMENT_MID_2016,
            )
            settings = get_settings()
            df_2016 = load_cached_dataset(settings.cache_dir, CSV_EMPLOYMENT_MID_2016)
            df_2021 = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MID.csv_name)

            if df_2016 is not None and df_2021 is not None:
                local_t0: dict[str, float] = {}
                local_t1: dict[str, float] = {}
                for pc in pref_codes:
                    area_code = f"{pc:02d}000"
                    for ind, val in self._mid_employment(df_2016, area_code).items():
                        local_t0[ind] = local_t0.get(ind, 0.0) + val
                    for ind, val in self._mid_employment(df_2021, area_code).items():
                        local_t1[ind] = local_t1.get(ind, 0.0) + val

                national_t0 = self._mid_employment(df_2016, "00000")
                national_t1 = self._mid_employment(df_2021, "00000")

                common = set(local_t0) & set(local_t1) & set(national_t0) & set(national_t1)
                if len(common) >= 10:
                    return (
                        {k: local_t0[k] for k in common},
                        {k: local_t1[k] for k in common},
                        {k: national_t0[k] for k in common},
                        {k: national_t1[k] for k in common},
                        f"e-Stat 経済センサス 2016→2021（{len(pref_codes)}県合算: 中分類95業種）",
                    )
        except Exception:
            pass

        return ({}, {}, {}, {}, "中分類データなし")

    @staticmethod
    def _mid_employment(df, area_code: str) -> dict[str, float]:
        """中分類雇用 DataFrame から特定地域の {category_name: employees} を返す。

        category_code (2桁) ではなく category_name を共通キーとして使う理由:
        2016/2021 で同じコードでも名称が微妙に異なる場合があり、業種名で
        一致確認した方が安全。実際に download_mid_2016.py で名称を 2021 形式に
        揃えているため一致するはず。
        """
        sub = df[df["area_code"] == area_code]
        if sub.empty:
            return {}
        return dict(zip(sub["category_name"], sub["employees"]))

    def retail_sectors(self, pref_code: int, city_code: int):
        """小売ギャップ分析用のセクターデータを返す。

        Supply: 経済センサス小売販売額キャッシュ（単位: 百万円）
        Demand: 人口 × 全国平均1人あたり小売支出額（推計、単位: 百万円）

        構造的な歪み（解釈に注意）:
          1. 観光地・商業中心地 → 需要過小推計（一時人口・周辺市民の購買を計上しない）
          2. ベッドタウン → 一見漏損だが実態は域外消費
          3. 中分類6種で粒度が粗く、教科書NAICS 4桁レベルより細分が見えない
          4. 1人あたり消費を全国均一と仮定（地域所得差を反映しない）
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
                population = pop_data.get("人口", 0)

                if supply and population > 0:
                    # 全国の小売販売総額と人口から1人あたり販売額を推計
                    national_supply = get_area_retail_sales(df_retail, "00000")
                    national_pop = get_area_population(df_pop, "00000")
                    nat_population = national_pop.get("人口", 0)

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

                # 国勢調査2025年 人口速報集計 (2026-05-29公表)。
                # "人口"=2025年実測人口、"世帯数"=2025年世帯数。
                # 5年間増減率は2020→2025の実測モメンタム（需要側先行指標）。
                population = pop_data.get("人口", 0)
                households = pop_data.get("世帯数", 0)
                pop_change_pct = pop_data.get("5年間の人口増減率", 0)
                hh_change_pct = pop_data.get("5年間の世帯増減率", 0)

                total_emp = sum(emp_data.values()) if emp_data else 0
                pph = population / households if households > 0 else 2.21

                if population > 0 and total_emp > 0:
                    return {
                        "population": int(population),
                        "households": int(households),
                        "pop_change_pct": round(float(pop_change_pct), 2),
                        "hh_change_pct": round(float(hh_change_pct), 2),
                        "total_employment": int(total_emp),
                        "persons_per_household": round(pph, 2),
                    }
        except Exception:
            pass

        return sample_data.TAKAMATSU

    def api_status(self) -> dict:
        """各 API の接続状況を返す（UIサイドバー表示用）。"""
        return {
            "e-Stat API": self.estat.available,
            "不動産情報ライブラリ API": self.mlit.available,
        }

    # ---------------------------------------------------------------------------
    # 都市圏（MSA相当）集計
    # ---------------------------------------------------------------------------

    def metro_industry_employment(
        self, pref_codes: list[int]
    ) -> tuple[Mapping[str, float], Mapping[str, float], str]:
        """複数都道府県を合算した産業別従業者数を返す。

        CI102のMSA前提に近づけるための都市圏集計版。
        各県の県全体（pref_code+'000'）データを合算する。

        Returns (local, national, data_source_label) のタプル。
        """
        census_df = self._ensure_census_cache()
        if census_df is not None:
            try:
                from data.census_cache import get_area_employment, get_national_employment
                combined: dict[str, float] = {}
                for pc in pref_codes:
                    pref_emp = get_area_employment(census_df, f"{pc:02d}000")
                    for ind, val in pref_emp.items():
                        combined[ind] = combined.get(ind, 0.0) + val
                national_emp = get_national_employment(census_df)
                if combined and national_emp:
                    return (
                        combined, national_emp,
                        f"e-Stat 経済センサス 2021（{len(pref_codes)}県合算: 都市圏）",
                    )
            except Exception:
                pass
        return (
            sample_data.TAKAMATSU_EMP_BY_INDUSTRY,
            sample_data.NATIONAL_EMP_BY_INDUSTRY,
            "sample_data (フォールバック)",
        )

    def metro_basics(self, pref_codes: list[int]) -> dict:
        """都市圏全体の人口・世帯・総雇用などを集計。"""
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_POPULATION, DS_EMPLOYMENT_MAJOR,
                get_area_population, get_area_employment,
            )
            settings = get_settings()
            df_pop = load_cached_dataset(settings.cache_dir, DS_POPULATION.csv_name)
            df_emp = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)

            if df_pop is None or df_emp is None:
                return sample_data.TAKAMATSU

            total_pop = 0.0
            total_hh = 0.0
            total_emp = 0.0
            total_pop_2020 = 0.0
            total_hh_2020 = 0.0
            for pc in pref_codes:
                area_code = f"{pc:02d}000"
                pop_data = get_area_population(df_pop, area_code)
                emp_data = get_area_employment(df_emp, area_code)
                total_pop += pop_data.get("人口", 0)
                total_hh += pop_data.get("世帯数", 0)
                total_pop_2020 += pop_data.get("2020年（令和2年）の人口（組替）", 0)
                total_hh_2020 += pop_data.get("2020年（令和2年）の世帯数（組替）", 0)
                total_emp += sum(emp_data.values()) if emp_data else 0

            pph = total_pop / total_hh if total_hh > 0 else 2.21
            pop_change_pct = ((total_pop - total_pop_2020) / total_pop_2020 * 100
                              ) if total_pop_2020 > 0 else 0.0
            hh_change_pct = ((total_hh - total_hh_2020) / total_hh_2020 * 100
                             ) if total_hh_2020 > 0 else 0.0
            if total_pop > 0 and total_emp > 0:
                return {
                    "population": int(total_pop),
                    "households": int(total_hh),
                    "pop_change_pct": round(pop_change_pct, 2),
                    "hh_change_pct": round(hh_change_pct, 2),
                    "total_employment": int(total_emp),
                    "persons_per_household": round(pph, 2),
                }
        except Exception:
            pass
        return sample_data.TAKAMATSU

    def metro_retail_sectors(self, pref_codes: list[int]):
        """都市圏全体の小売ギャップ分析セクター。"""
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_RETAIL_SALES, DS_POPULATION,
                get_area_retail_sales, get_area_population,
            )
            settings = get_settings()
            df_retail = load_cached_dataset(settings.cache_dir, DS_RETAIL_SALES.csv_name)
            df_pop = load_cached_dataset(settings.cache_dir, DS_POPULATION.csv_name)
            if df_retail is None or df_pop is None:
                return sample_data.TAKAMATSU_RETAIL_SECTORS, "sample_data"

            # 都市圏の小売販売額を集計
            combined_supply: dict[str, float] = {}
            combined_pop = 0.0
            for pc in pref_codes:
                area_code = f"{pc:02d}000"
                sup = get_area_retail_sales(df_retail, area_code)  # 既にフィルタ済み（小売中分類のみ）
                pop_data = get_area_population(df_pop, area_code)
                combined_pop += pop_data.get("人口", 0)
                for k, v in sup.items():
                    combined_supply[k] = combined_supply.get(k, 0.0) + v

            if not combined_supply or combined_pop <= 0:
                return sample_data.TAKAMATSU_RETAIL_SECTORS, "sample_data"

            national_supply = get_area_retail_sales(df_retail, "00000")
            national_pop = get_area_population(df_pop, "00000")
            nat_population = national_pop.get("人口", 0)
            if nat_population <= 0:
                return sample_data.TAKAMATSU_RETAIL_SECTORS, "sample_data"

            sectors = []
            for sector_name, sales in combined_supply.items():
                nat_sales = national_supply.get(sector_name, 0)
                if nat_sales > 0:
                    per_capita = nat_sales / nat_population
                    demand = combined_pop * per_capita
                    sectors.append({"sector": sector_name, "demand": demand, "supply": sales})

            return sectors, f"e-Stat 経済センサス 2021（{len(pref_codes)}県合算: 都市圏ギャップ）"
        except Exception:
            return sample_data.TAKAMATSU_RETAIL_SECTORS, "sample_data"

    def metro_shift_share_inputs(self, pref_codes: list[int]):
        """都市圏全体のシフトシェア入力。

        Returns (local_t0, local_t1, national_t0, national_t1, source_label)
        """
        try:
            from config import get_settings
            from data.census_cache import (
                load_cached_dataset, DS_EMPLOYMENT_MAJOR, DS_EMPLOYMENT_MAJOR_2016,
                get_area_employment,
            )
            settings = get_settings()
            df_2016 = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MAJOR_2016.csv_name)
            df_2021 = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)

            if df_2016 is not None and df_2021 is not None:
                def _get_normalized_2016(df, area):
                    raw = get_area_employment(df, area)
                    normalized: dict[str, float] = {}
                    for name, val in raw.items():
                        clean = self._normalize_2016_industry_name(name)
                        if clean:
                            normalized[clean] = normalized.get(clean, 0.0) + val
                    return normalized

                # 都市圏の合算
                local_t0: dict[str, float] = {}
                local_t1: dict[str, float] = {}
                for pc in pref_codes:
                    area_code = f"{pc:02d}000"
                    for ind, val in _get_normalized_2016(df_2016, area_code).items():
                        local_t0[ind] = local_t0.get(ind, 0.0) + val
                    for ind, val in get_area_employment(df_2021, area_code).items():
                        local_t1[ind] = local_t1.get(ind, 0.0) + val

                # 全国
                national_t0: dict[str, float] = {}
                for pc in range(1, 48):
                    for ind, val in _get_normalized_2016(df_2016, f"{pc:02d}000").items():
                        national_t0[ind] = national_t0.get(ind, 0.0) + val
                national_t1 = get_area_employment(df_2021, "00000")

                common = set(local_t0) & set(local_t1) & set(national_t0) & set(national_t1)
                if len(common) >= 5:
                    return (
                        {k: local_t0[k] for k in common},
                        {k: local_t1[k] for k in common},
                        {k: national_t0[k] for k in common},
                        {k: national_t1[k] for k in common},
                        f"e-Stat 経済センサス 2016→2021（{len(pref_codes)}県合算: 都市圏）",
                    )
        except Exception:
            pass

        return (
            sample_data.TAKAMATSU_EMP_T0, sample_data.TAKAMATSU_EMP_T1,
            sample_data.NATIONAL_EMP_T0, sample_data.NATIONAL_EMP_T1,
            "sample_data (フォールバック)",
        )
