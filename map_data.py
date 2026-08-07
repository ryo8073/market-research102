"""都道府県別の集計データ生成（地図UI用）。

全国CSVキャッシュから47都道府県分のLQ/シフトシェア/ギャップ等を
一括計算し、plotly choropleth 用の DataFrame を返す。

注: 人口データは2025年国勢調査 人口速報集計 (2026-05-29公表) を使用。
    "人口"=2025年実測、"5年間の人口増減率"=2020→2025の実測モメンタム。
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from calculator import (
    economic_base_multiplier,
    lq_table,
    population_employment_ratio,
    shift_share_table,
    total_basic_employment,
    gap_analysis_table,
)
from data.census_cache import (
    DS_EMPLOYMENT_MAJOR,
    DS_EMPLOYMENT_MAJOR_2016,
    DS_POPULATION,
    DS_RETAIL_SALES,
    get_area_employment,
    get_area_population,
    get_area_retail_sales,
    get_national_employment,
    load_cached_dataset,
)
from data.codes import PREFECTURES
from data_sources import MarketDataAccessor

# 人口キー（2025年国勢調査 人口速報集計。category_name と一致）
_POP_KEY = "人口"
_POP_HH_KEY = "世帯数"
_POP_CHANGE_KEY = "5年間の人口増減率"
_HH_CHANGE_KEY = "5年間の世帯増減率"


def _load_datasets(cache_dir: Path) -> dict[str, pd.DataFrame | None]:
    """必要なCSVを一括ロード。"""
    return {
        "emp_2021": load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name),
        "emp_2016": load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR_2016.csv_name),
        "pop": load_cached_dataset(cache_dir, DS_POPULATION.csv_name),
        "retail": load_cached_dataset(cache_dir, DS_RETAIL_SALES.csv_name),
    }


def _get_cache_dir() -> Path:
    from config import get_settings
    return get_settings().cache_dir


def _default_cache_dir_str() -> str:
    """キャッシュディレクトリのパス文字列を返す（st.cache_data のキーに使用）。"""
    return str(_get_cache_dir())


# ---------------------------------------------------------------------------
# 1. LQ サマリ（産業集積マップ用）
# ---------------------------------------------------------------------------

@st.cache_data(ttl=3600, show_spinner="LQサマリを計算中...")
def compute_prefecture_lq_summary(cache_dir_str: str | None = None) -> pd.DataFrame:
    """47都道府県のLQサマリを一括計算。

    Returns DataFrame: pref_code, pref_name, total_emp, basic_emp,
                       basic_ratio, num_basic, max_lq, max_lq_industry
    """
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()
    df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
    if df_emp is None:
        return pd.DataFrame()

    national_emp = get_national_employment(df_emp)
    if not national_emp:
        return pd.DataFrame()

    rows = []
    for pc in range(1, 48):
        area_code = f"{pc:02d}000"
        local_emp = get_area_employment(df_emp, area_code)
        if not local_emp:
            continue
        df_lq = lq_table(local_emp, national_emp)
        basic_total = total_basic_employment(df_lq)
        total_emp = float(df_lq["local_emp"].sum())
        basic_industries = df_lq[df_lq["lq"] > 1.0]
        top = df_lq.iloc[0] if not df_lq.empty else None

        rows.append({
            "pref_code": pc,
            "pref_name": PREFECTURES.get(pc, ""),
            "total_emp": int(total_emp),
            "basic_emp": int(basic_total),
            "basic_ratio": basic_total / total_emp * 100 if total_emp > 0 else 0,
            "num_basic": len(basic_industries),
            "max_lq": float(top["lq"]) if top is not None else 0,
            "max_lq_industry": str(top["industry"]) if top is not None else "",
        })

    return pd.DataFrame(rows)


@st.cache_data(ttl=3600, show_spinner="産業別LQを計算中...")
def compute_prefecture_industry_lq(
    industry_name: str, cache_dir_str: str | None = None,
) -> pd.DataFrame:
    """特定産業について47都道府県のLQ値を計算。

    Returns DataFrame: pref_code, pref_name, lq, local_emp, basic_emp
    """
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()
    df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
    if df_emp is None:
        return pd.DataFrame()

    national_emp = get_national_employment(df_emp)
    if not national_emp:
        return pd.DataFrame()

    rows = []
    for pc in range(1, 48):
        area_code = f"{pc:02d}000"
        local_emp = get_area_employment(df_emp, area_code)
        if not local_emp:
            continue
        df_lq = lq_table(local_emp, national_emp)
        row = df_lq[df_lq["industry"] == industry_name]
        if row.empty:
            continue
        r = row.iloc[0]
        rows.append({
            "pref_code": pc,
            "pref_name": PREFECTURES.get(pc, ""),
            "lq": float(r["lq"]),
            "local_emp": float(r["local_emp"]),
            "basic_emp": float(r["basic_emp_estimate"]),
        })

    return pd.DataFrame(rows)


@st.cache_data(ttl=3600)
def get_industry_list(cache_dir_str: str | None = None) -> list[str]:
    """キャッシュから産業名リストを取得。"""
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()
    df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
    if df_emp is None:
        return []
    national_emp = get_national_employment(df_emp)
    return sorted(national_emp.keys())


# ---------------------------------------------------------------------------
# 2. シフトシェア RS マップ用
# ---------------------------------------------------------------------------

@st.cache_data(ttl=3600, show_spinner="シフトシェアを計算中...")
def compute_prefecture_shift_share(cache_dir_str: str | None = None) -> pd.DataFrame:
    """47都道府県のシフトシェアRS合計を計算。

    Returns DataFrame: pref_code, pref_name, total_rs, total_actual_change,
                       top_rs_industry, top_rs_value
    """
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()

    datasets = _load_datasets(cache_dir)
    df_2016 = datasets["emp_2016"]
    df_2021 = datasets["emp_2021"]
    if df_2016 is None or df_2021 is None:
        return pd.DataFrame()

    national_t1 = get_area_employment(df_2021, "00000")
    if not national_t1:
        return pd.DataFrame()

    # 2016年全国データ: 47都道府県合計で算出（00000が存在しないため）
    normalizer = MarketDataAccessor._normalize_2016_industry_name
    national_t0: dict[str, float] = {}
    for pc in range(1, 48):
        raw = get_area_employment(df_2016, f"{pc:02d}000")
        for name, val in raw.items():
            clean = normalizer(name)
            if clean:
                national_t0[clean] = national_t0.get(clean, 0.0) + val

    rows = []
    for pc in range(1, 48):
        area_code = f"{pc:02d}000"

        # 2016年ローカル（正規化）
        raw_l0 = get_area_employment(df_2016, area_code)
        local_t0: dict[str, float] = {}
        for name, val in raw_l0.items():
            clean = normalizer(name)
            if clean:
                local_t0[clean] = local_t0.get(clean, 0.0) + val

        local_t1 = get_area_employment(df_2021, area_code)
        if not local_t0 or not local_t1:
            continue

        common = set(local_t0) & set(local_t1) & set(national_t0) & set(national_t1)
        if len(common) < 3:
            continue

        l0 = {k: local_t0[k] for k in common}
        l1 = {k: local_t1[k] for k in common}
        n0 = {k: national_t0[k] for k in common}
        n1 = {k: national_t1[k] for k in common}

        df_ss = shift_share_table(l0, l1, n0, n1)
        total_rs = float(df_ss["regional_shift"].sum())
        total_change = float(df_ss["actual_change"].sum())

        top_idx = df_ss["regional_shift"].abs().idxmax()
        top_row = df_ss.loc[top_idx]

        rows.append({
            "pref_code": pc,
            "pref_name": PREFECTURES.get(pc, ""),
            "total_rs": total_rs,
            "total_actual_change": total_change,
            "top_rs_industry": str(top_row["industry"]),
            "top_rs_value": float(top_row["regional_shift"]),
        })

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. 小売ギャップマップ用
# ---------------------------------------------------------------------------

@st.cache_data(ttl=3600, show_spinner="小売ギャップを計算中...")
def compute_prefecture_retail_gap(cache_dir_str: str | None = None) -> pd.DataFrame:
    """47都道府県の小売ギャップ集計。

    Returns DataFrame: pref_code, pref_name, total_demand, total_supply,
                       aggregate_factor, num_leakage, num_surplus

    注: 需要は人口(2015年組替) × 全国平均1人あたり小売支出額(2021年)で按分推計。
    """
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()

    datasets = _load_datasets(cache_dir)
    df_retail = datasets["retail"]
    df_pop = datasets["pop"]
    if df_retail is None or df_pop is None:
        return pd.DataFrame()

    national_supply = get_area_retail_sales(df_retail, "00000")
    national_pop_data = get_area_population(df_pop, "00000")
    nat_population = national_pop_data.get(_POP_KEY, 0)
    if nat_population <= 0 or not national_supply:
        return pd.DataFrame()

    rows = []
    for pc in range(1, 48):
        area_code = f"{pc:02d}000"
        supply = get_area_retail_sales(df_retail, area_code)
        pop_data = get_area_population(df_pop, area_code)
        population = pop_data.get(_POP_KEY, 0)
        if not supply or population <= 0:
            continue

        sectors = []
        for sector_name, sales in supply.items():
            nat_sales = national_supply.get(sector_name, 0)
            if nat_sales > 0:
                per_capita = nat_sales / nat_population
                demand = population * per_capita
                sectors.append({"sector": sector_name, "demand": demand, "supply": sales})

        if not sectors:
            continue

        df_gap = gap_analysis_table(sectors)
        total_demand = float(df_gap["demand"].sum())
        total_supply = float(df_gap["supply"].sum())
        denom = total_demand + total_supply
        agg_factor = (total_demand - total_supply) / denom * 100 if denom > 0 else 0

        rows.append({
            "pref_code": pc,
            "pref_name": PREFECTURES.get(pc, ""),
            "total_demand": total_demand,
            "total_supply": total_supply,
            "aggregate_factor": agg_factor,
            "num_leakage": len(df_gap[df_gap["factor"] >= 10]),
            "num_surplus": len(df_gap[df_gap["factor"] <= -10]),
        })

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 4. 都道府県比較ダッシュボード用
# ---------------------------------------------------------------------------

@st.cache_data(ttl=3600, show_spinner="都道府県比較データを計算中...")
def compute_prefecture_comparison(cache_dir_str: str | None = None) -> pd.DataFrame:
    """47都道府県の主要指標を一括集計。

    Returns DataFrame: pref_code, pref_name, population, total_emp,
                       basic_emp, ebm, per, basic_ratio
    """
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()

    datasets = _load_datasets(cache_dir)
    df_emp = datasets["emp_2021"]
    df_pop = datasets["pop"]
    if df_emp is None or df_pop is None:
        return pd.DataFrame()

    national_emp = get_national_employment(df_emp)
    if not national_emp:
        return pd.DataFrame()

    rows = []
    for pc in range(1, 48):
        area_code = f"{pc:02d}000"
        local_emp = get_area_employment(df_emp, area_code)
        pop_data = get_area_population(df_pop, area_code)

        if not local_emp or not pop_data:
            continue

        df_lq = lq_table(local_emp, national_emp)
        basic_total = total_basic_employment(df_lq)
        total_emp = float(df_lq["local_emp"].sum())
        population = pop_data.get(_POP_KEY, 0)
        pop_change_pct = pop_data.get(_POP_CHANGE_KEY, 0)

        if total_emp <= 0 or population <= 0:
            continue

        ebm = economic_base_multiplier(total_emp, basic_total)
        per = population_employment_ratio(population, total_emp)

        rows.append({
            "pref_code": pc,
            "pref_name": PREFECTURES.get(pc, ""),
            "population": int(population),
            "pop_change_pct": round(float(pop_change_pct), 2),
            "total_emp": int(total_emp),
            "basic_emp": int(basic_total),
            "ebm": round(ebm, 2),
            "per": round(per, 2),
            "basic_ratio": round(basic_total / total_emp * 100, 1),
        })

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 5. 県内市区町村レベル分析
# ---------------------------------------------------------------------------

@st.cache_data(ttl=3600, show_spinner="市区町村LQを計算中...")
def compute_municipality_lq(
    pref_code: int, cache_dir_str: str | None = None,
) -> pd.DataFrame:
    """県内の市区町村別LQサマリを計算。

    Returns DataFrame: area_code, area_name, total_emp, basic_emp,
                       basic_ratio, num_basic, max_lq, max_lq_industry
    """
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()
    df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
    if df_emp is None:
        return pd.DataFrame()

    national_emp = get_national_employment(df_emp)
    if not national_emp:
        return pd.DataFrame()

    from data.census_cache import list_areas_by_prefecture
    areas = list_areas_by_prefecture(df_emp, pref_code)

    rows = []
    for area_code, area_name in areas:
        local_emp = get_area_employment(df_emp, area_code)
        if not local_emp:
            continue
        df_lq = lq_table(local_emp, national_emp)
        basic_total = total_basic_employment(df_lq)
        total_emp_val = float(df_lq["local_emp"].sum())
        basic_industries = df_lq[df_lq["lq"] > 1.0]
        top = df_lq.iloc[0] if not df_lq.empty else None

        rows.append({
            "area_code": area_code,
            "area_name": area_name,
            "total_emp": int(total_emp_val),
            "basic_emp": int(basic_total),
            "basic_ratio": basic_total / total_emp_val * 100 if total_emp_val > 0 else 0,
            "num_basic": len(basic_industries),
            "max_lq": float(top["lq"]) if top is not None else 0,
            "max_lq_industry": str(top["industry"]) if top is not None else "",
        })

    return pd.DataFrame(rows)


@st.cache_data(ttl=3600, show_spinner="産業別LQを計算中...")
def compute_municipality_industry_lq(
    pref_code: int, industry_name: str, cache_dir_str: str | None = None,
) -> pd.DataFrame:
    """県内の市区町村別に特定産業のLQ値を計算。

    Returns DataFrame: area_code, area_name, lq, local_emp, basic_emp
    """
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()
    df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
    if df_emp is None:
        return pd.DataFrame()

    national_emp = get_national_employment(df_emp)
    if not national_emp:
        return pd.DataFrame()

    from data.census_cache import list_areas_by_prefecture
    areas = list_areas_by_prefecture(df_emp, pref_code)

    rows = []
    for area_code, area_name in areas:
        local_emp = get_area_employment(df_emp, area_code)
        if not local_emp:
            continue
        df_lq = lq_table(local_emp, national_emp)
        row = df_lq[df_lq["industry"] == industry_name]
        if row.empty:
            continue
        r = row.iloc[0]
        rows.append({
            "area_code": area_code,
            "area_name": area_name,
            "lq": float(r["lq"]),
            "local_emp": float(r["local_emp"]),
            "basic_emp": float(r["basic_emp_estimate"]),
        })

    return pd.DataFrame(rows)


@st.cache_data(ttl=3600, show_spinner="産業中分類LQを計算中...")
def compute_industry_detail_lq(
    pref_code: int, city_code: int, cache_dir_str: str | None = None,
) -> pd.DataFrame:
    """産業中分類レベルのLQテーブルを計算（ドリルダウン用）。

    Returns DataFrame: industry, local_emp, national_emp, lq, basic_emp_estimate
    """
    from data.census_cache import (
        DS_EMPLOYMENT_MID, get_area_employment_mid, load_cached_dataset as _load,
    )
    cache_dir = Path(cache_dir_str) if cache_dir_str else _get_cache_dir()
    df_mid = _load(cache_dir, DS_EMPLOYMENT_MID.csv_name)
    if df_mid is None:
        return pd.DataFrame()

    if city_code and city_code % 1000 != 0:
        area_code = f"{pref_code:02d}{city_code % 1000:03d}"
    else:
        area_code = f"{pref_code:02d}000"
    local_emp = get_area_employment_mid(df_mid, area_code)
    national_emp = get_area_employment_mid(df_mid, "00000")

    if not local_emp or not national_emp:
        return pd.DataFrame()

    return lq_table(local_emp, national_emp)


# ---------------------------------------------------------------------------
# National ranking helper
# ---------------------------------------------------------------------------

@st.cache_data(ttl=3600, show_spinner=False)
def get_prefecture_rankings(cache_dir_str: str | None = None) -> dict:
    """Return ranking dicts for key metrics across 47 prefectures.

    Returns dict with keys: ebm_rank, per_rank, basic_ratio_rank,
    population_rank, total_emp_rank.
    Each value is a dict mapping pref_code -> rank (1 = highest).
    Also returns emp_change dict (pref_code -> 2016->2021 total emp change).
    """
    df = compute_prefecture_comparison(cache_dir_str)
    if df.empty:
        return {}

    result = {}
    for col in ["ebm", "per", "basic_ratio", "population", "total_emp"]:
        if col in df.columns:
            ranked = df.sort_values(col, ascending=False).reset_index(drop=True)
            result[f"{col}_rank"] = {
                int(row["pref_code"]): i + 1
                for i, row in ranked.iterrows()
            }

    # Employment change (2016->2021) from shift-share data
    try:
        df_ss = compute_prefecture_shift_share(cache_dir_str)
        if not df_ss.empty:
            result["emp_change"] = {
                int(row["pref_code"]): int(row["total_actual_change"])
                for _, row in df_ss.iterrows()
            }
    except Exception:
        pass

    return result
