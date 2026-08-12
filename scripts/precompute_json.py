"""Pre-compute all CI102 metrics for 47 prefectures + municipalities into JSON.

Outputs:
  ci102-nextjs/public/data/prefectures.json   — All prefecture-level metrics
  ci102-nextjs/public/data/municipalities/{prefCode}.json — Per-prefecture municipality data

Usage:
  python scripts/precompute_json.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

import map_data
from calculator import (
    economic_base_multiplier,
    gap_analysis_table,
    investment_suitability_score,
    leakage_surplus_factor,
    lq_table,
    population_employment_ratio,
    shift_share_table,
    total_basic_employment,
    estimate_daytime_population,
)
from data.codes import PREFECTURES, METROPOLITAN_AREAS
from data_sources import MarketDataAccessor

# NLNI processors (optional — if data not downloaded, gracefully skip)
try:
    from data.nlni.downloader import load_cached_csv
    NLNI_AVAILABLE = True
except ImportError:
    NLNI_AVAILABLE = False


def _safe_int(val, default: int = 0) -> int:
    """NaN/None/非数値を安全にintに変換。JSON serialization対策。"""
    if val is None:
        return default
    try:
        import math
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (ValueError, TypeError):
        return default


def _safe_float(val, default: float = 0.0, decimals: int = 1) -> float:
    """NaN/None/非数値を安全にfloatに変換。"""
    if val is None:
        return default
    try:
        import math
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return round(f, decimals)
    except (ValueError, TypeError):
        return default


_POP_MOMENTUM_CACHE: dict = {}


def _pop_momentum_block(area_code: str) -> dict | None:
    """2025年国勢調査速報から人口モメンタム(census2025)ブロックを構築する。

    既存の pop_change_pct(NLNI将来推計) とは別軸の『実測2020→2025』指標。
    投資家が最初に確認する需要側の直近トレンド。
    """
    from data.census_cache import (
        load_cached_dataset, DS_POPULATION, get_area_population_momentum,
    )
    from scorecard import classify_population_momentum
    cache_dir = Path(__file__).resolve().parent.parent / "data" / "cache"
    if "df" not in _POP_MOMENTUM_CACHE:
        df0 = load_cached_dataset(cache_dir, DS_POPULATION.csv_name)
        _POP_MOMENTUM_CACHE["df"] = df0
        natm = get_area_population_momentum(df0, "00000") if df0 is not None else {}
        _POP_MOMENTUM_CACHE["nat"] = round(float(natm.get("pop_change_pct", -2.45)), 2)
    df = _POP_MOMENTUM_CACHE["df"]
    if df is None:
        return None
    m = get_area_population_momentum(df, area_code)
    if not m or "population" not in m:
        return None
    nat = _POP_MOMENTUM_CACHE["nat"]
    pc = round(float(m.get("pop_change_pct", 0.0)), 2)
    return {
        "population": int(m.get("population", 0)),
        "population_2020": int(m.get("population_2020", 0)),
        "households": int(m.get("households", 0)),
        "pop_change_pct": pc,
        "hh_change_pct": round(float(m.get("hh_change_pct", 0.0)), 2),
        "national_pop_change_pct": nat,
        "momentum_gap": round(pc - nat, 2),
        "momentum_class": classify_population_momentum(pc, nat),
        "density": round(float(m.get("density", 0.0)), 1),
        "source": "総務省 令和7年国勢調査 人口速報集計 (2026-05公表)",
    }


def _get_median_unit_price(accessor: MarketDataAccessor, pref_code: int) -> float | None:
    """Fetch MLIT median unit price (yen/m2) for a prefecture."""
    mlit = accessor.mlit
    if mlit is None or not getattr(mlit, "available", False):
        return None
    for year, quarter in [(2024, 3), (2024, 2), (2024, 1), (2023, 4)]:
        try:
            df = mlit.transaction_prices(year=year, quarter=quarter, pref_code=pref_code)
            if df is not None and not df.empty:
                prices = pd.to_numeric(df.get("UnitPrice", pd.Series(dtype=float)), errors="coerce")
                valid = prices[prices > 0]
                if not valid.empty:
                    return float(valid.median())
        except Exception:
            continue
    return None

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "ci102-nextjs" / "public" / "data"
MUNI_DIR = OUTPUT_DIR / "municipalities"


def compute_prefecture_full(accessor: MarketDataAccessor, pref_code: int) -> dict | None:
    """Compute all metrics for a single prefecture."""
    try:
        local_emp, national_emp, _ = accessor.industry_employment(pref_code, 0)
        if not local_emp:
            return None

        df_lq = lq_table(local_emp, national_emp)
        basic = total_basic_employment(df_lq)
        total_emp = float(df_lq["local_emp"].sum())
        if total_emp <= 0:
            return None

        basics = accessor.city_basics(pref_code, 0)
        ebm = economic_base_multiplier(total_emp, basic)
        per = population_employment_ratio(basics["population"], basics["total_employment"])
        basic_ratio = basic / total_emp * 100

        # Top LQ industries
        top_lq = (
            df_lq[df_lq["lq"] > 1.0]
            .nlargest(5, "lq")
            [["industry", "lq", "basic_emp_estimate"]]
            .to_dict("records")
        )

        # Shift-share (大分類17業種)
        rs_total = 0.0
        actual_emp_change = 0.0
        top_rs_industry = ""
        top_rs_value = 0.0
        ss_records = []
        try:
            l0, l1, n0, n1, _ = accessor.shift_share_inputs(pref_code, 0)
            import pandas as pd
            df_ss = shift_share_table(l0, l1, n0, n1)
            if not df_ss.empty:
                rs_total = float(df_ss["regional_shift"].sum())
                actual_emp_change = float(df_ss["actual_change"].sum())
                best = df_ss.loc[df_ss["regional_shift"].idxmax()]
                top_rs_industry = str(best["industry"])
                top_rs_value = float(best["regional_shift"])
                ss_records = df_ss.to_dict("records")
        except Exception:
            pass

        # Shift-share 中分類95業種 (2016 H28 → 2021 R3 民営事業所)
        rs_total_mid = 0.0
        actual_emp_change_mid = 0.0
        top_rs_industry_mid = ""
        top_rs_value_mid = 0.0
        ss_records_mid = []
        try:
            l0m, l1m, n0m, n1m, _ = accessor.shift_share_inputs_mid(pref_code, 0)
            if l0m and l1m:
                df_ss_mid = shift_share_table(l0m, l1m, n0m, n1m)
                if not df_ss_mid.empty:
                    rs_total_mid = float(df_ss_mid["regional_shift"].sum())
                    actual_emp_change_mid = float(df_ss_mid["actual_change"].sum())
                    best_mid = df_ss_mid.loc[df_ss_mid["regional_shift"].idxmax()]
                    top_rs_industry_mid = str(best_mid["industry"])
                    top_rs_value_mid = float(best_mid["regional_shift"])
                    # 中分類は95業種と多いので、上位20+下位20のみ保存（容量節約）
                    df_sorted = df_ss_mid.sort_values("regional_shift", ascending=False)
                    top20 = df_sorted.head(20).to_dict("records")
                    bottom20 = df_sorted.tail(20).to_dict("records")
                    seen = set()
                    ss_records_mid = []
                    for r in top20 + bottom20:
                        key = r["industry"]
                        if key not in seen:
                            ss_records_mid.append(r)
                            seen.add(key)
        except Exception:
            pass

        # Retail gap
        agg_gap = 0.0
        n_leak = 0
        n_surplus = 0
        gap_records = []
        try:
            sectors, _ = accessor.retail_sectors(pref_code, 0)
            df_gap = gap_analysis_table(sectors)
            if not df_gap.empty:
                td = df_gap["demand"].sum()
                ts = df_gap["supply"].sum()
                if (td + ts) > 0:
                    agg_gap = (td - ts) / (td + ts) * 100
                n_leak = int((df_gap["factor"] >= 10).sum())
                n_surplus = int((df_gap["factor"] <= -10).sum())
                gap_records = df_gap.to_dict("records")
        except Exception:
            pass

        # Investment suitability score
        score = investment_suitability_score(ebm, basic_ratio, rs_total, agg_gap, total_emp)

        # Daytime population
        daytime = estimate_daytime_population(basics["population"], basic)

        # MLIT median unit price
        median_price = _get_median_unit_price(accessor, pref_code)

        # LQ full table for charts
        lq_records = df_lq.to_dict("records")

        # --- Mid-classification (95業種) recompute ---
        # 業種粒度を細かくして基盤雇用過小評価を補正
        ebm_mid = None
        basic_ratio_mid = None
        basic_emp_mid = None
        n_basic_mid = None
        top_lq_mid = []
        lq_table_mid_records = []  # 全95業種のLQテーブル（EBMタブ用）
        # 農林業センサス補完版（家族農家含む）
        ebm_mid_extended = None
        basic_ratio_mid_extended = None
        agri_eco_workers = None
        agri_extended_workers = None
        try:
            from data.census_cache import (
                DS_EMPLOYMENT_MID, load_cached_dataset,
                get_area_employment_mid, load_agri_census, get_area_agri_workers,
            )
            cache_dir = Path(__file__).resolve().parent.parent / "data" / "cache"
            df_mid = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MID.csv_name)
            if df_mid is not None:
                area_code = f"{pref_code:02d}000"
                local_mid = get_area_employment_mid(df_mid, area_code)
                national_mid = get_area_employment_mid(df_mid, "00000")
                if local_mid and national_mid:
                    df_lq_mid = lq_table(local_mid, national_mid)
                    bm = total_basic_employment(df_lq_mid)
                    tm = float(df_lq_mid["local_emp"].sum())
                    if tm > 0 and bm > 0:
                        ebm_mid = round(tm / bm, 2)
                        basic_ratio_mid = round(bm / tm * 100, 1)
                        basic_emp_mid = round(bm, 0)
                        n_basic_mid = int((df_lq_mid["lq"] > 1.0).sum())
                        top_lq_mid = (
                            df_lq_mid[df_lq_mid["lq"] > 1.0]
                            .nlargest(10, "basic_emp_estimate")
                            [["industry", "lq", "basic_emp_estimate"]]
                            .to_dict("records")
                        )
                        # 全95業種のLQテーブル（EBMタブ用）
                        lq_table_mid_records = (
                            df_lq_mid[["industry", "local_emp", "national_emp", "lq", "basic_emp_estimate"]]
                            .to_dict("records")
                        )

                # 農林業センサス2020拡張版（個人経営の家族農家を含む）
                agri_df = load_agri_census(cache_dir)
                if agri_df is not None:
                    agri_info = get_area_agri_workers(agri_df, area_code)
                    if agri_info:
                        agri_eco_workers = int(agri_info["eco_only"])
                        agri_extended_workers = int(agri_info["extended"])
                        local_ext = get_area_employment_mid(
                            df_mid, area_code,
                            extend_agriculture=True, agri_df=agri_df,
                        )
                        national_ext = get_area_employment_mid(
                            df_mid, "00000",
                            extend_agriculture=True, agri_df=agri_df,
                        )
                        if local_ext and national_ext:
                            df_lq_ext = lq_table(local_ext, national_ext)
                            b_ext = total_basic_employment(df_lq_ext)
                            t_ext = float(df_lq_ext["local_emp"].sum())
                            if t_ext > 0 and b_ext > 0:
                                ebm_mid_extended = round(t_ext / b_ext, 2)
                                basic_ratio_mid_extended = round(b_ext / t_ext * 100, 1)
        except Exception:
            pass

        # --- 中分類版・+農林業版の投資スコアと基盤TOP10を事前計算 ---
        # 分類粒度トグルでKPI/スコアを即座に切り替えるため、3バージョンすべてを格納
        score_mid = None
        score_extended = None
        top_lq_extended = []
        basic_emp_extended = None
        n_basic_industries_extended = None
        try:
            from data.census_cache import (
                DS_EMPLOYMENT_MID, load_cached_dataset,
                get_area_employment_mid, load_agri_census,
            )
            cache_dir = Path(__file__).resolve().parent.parent / "data" / "cache"
            df_mid = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MID.csv_name)
            agri_df_v = load_agri_census(cache_dir)
            if df_mid is not None:
                area_code = f"{pref_code:02d}000"
                # 中分類版スコア
                if ebm_mid and basic_ratio_mid is not None:
                    # 総雇用は中分類版（民営事業所のみ）
                    nat_mid = get_area_employment_mid(df_mid, "00000")
                    local_mid_e = get_area_employment_mid(df_mid, area_code)
                    if local_mid_e and nat_mid:
                        total_mid_e = sum(local_mid_e.values())
                        score_mid = investment_suitability_score(
                            ebm_mid, basic_ratio_mid, rs_total, agg_gap, total_mid_e
                        )

                # +農林業補完版スコアと基盤TOP10
                if agri_df_v is not None and ebm_mid_extended is not None:
                    local_ext = get_area_employment_mid(
                        df_mid, area_code,
                        extend_agriculture=True, agri_df=agri_df_v,
                    )
                    national_ext = get_area_employment_mid(
                        df_mid, "00000",
                        extend_agriculture=True, agri_df=agri_df_v,
                    )
                    if local_ext and national_ext:
                        df_lq_ext = lq_table(local_ext, national_ext)
                        b_ext = total_basic_employment(df_lq_ext)
                        t_ext = float(df_lq_ext["local_emp"].sum())
                        basic_emp_extended = round(b_ext, 0)
                        n_basic_industries_extended = int((df_lq_ext["lq"] > 1.0).sum())
                        top_lq_extended = (
                            df_lq_ext[df_lq_ext["lq"] > 1.0]
                            .nlargest(10, "basic_emp_estimate")
                            [["industry", "lq", "basic_emp_estimate"]]
                            .to_dict("records")
                        )
                        if ebm_mid_extended and basic_ratio_mid_extended:
                            score_extended = investment_suitability_score(
                                ebm_mid_extended, basic_ratio_mid_extended,
                                rs_total, agg_gap, t_ext
                            )
        except Exception:
            pass

        # --- Commute distortion detection ---
        pop_basic = float(basics.get("population", 0))
        emp_to_pop = (total_emp / pop_basic) if pop_basic > 0 else 0.0
        if per > 0 and per < 1.2:
            commute_distortion = "inflow"
        elif ebm > 8.0 and basic_ratio < 12.0:
            commute_distortion = "outflow"
        else:
            commute_distortion = "balanced"

        # --- EBM structural decomposition (educational) ---
        # 基盤雇用比率 = LQ>1.0 業種シェア × 平均(1-1/LQ)係数
        basic_df = df_lq[df_lq["lq"] > 1.0]
        if not basic_df.empty and total_emp > 0:
            lq_above1_share = float(basic_df["local_emp"].sum()) / total_emp * 100
            local_emp_sum = float(basic_df["local_emp"].sum())
            avg_excess_coef = (
                float(basic_df["basic_emp_estimate"].sum()) / local_emp_sum
                if local_emp_sum > 0 else 0.0
            )
        else:
            lq_above1_share = 0.0
            avg_excess_coef = 0.0

        return {
            "pref_code": pref_code,
            "pref_name": PREFECTURES.get(pref_code, ""),
            "population": basics["population"],
            "households": basics["households"],
            "census2025": _pop_momentum_block(f"{pref_code:02d}000"),
            "total_employment": basics["total_employment"],
            "persons_per_household": basics["persons_per_household"],
            "ebm": round(ebm, 2),
            "per": round(per, 2),
            "basic_emp": round(basic, 0),
            "basic_ratio": round(basic_ratio, 1),
            "top_lq_industries": top_lq,
            "rs_total": round(rs_total, 0),
            "actual_emp_change": round(actual_emp_change, 0),
            "top_rs_industry": top_rs_industry,
            "top_rs_value": round(top_rs_value, 0),
            # 中分類95業種シフトシェア
            "rs_total_mid": round(rs_total_mid, 0),
            "actual_emp_change_mid": round(actual_emp_change_mid, 0),
            "top_rs_industry_mid": top_rs_industry_mid,
            "top_rs_value_mid": round(top_rs_value_mid, 0),
            "shift_share_table_mid": ss_records_mid,
            "aggregate_gap_factor": round(agg_gap, 1),
            "num_leakage_sectors": n_leak,
            "num_surplus_sectors": n_surplus,
            "suitability_score": score,
            "daytime_population": round(daytime, 0),
            "median_unit_price": round(median_price, 0) if median_price else None,
            "lq_table": lq_records,
            "shift_share_table": ss_records,
            "gap_table": gap_records,
            # 中分類95業種版（業種粒度補正）
            "ebm_mid": ebm_mid,
            "basic_ratio_mid": basic_ratio_mid,
            "basic_emp_mid": basic_emp_mid,
            "n_basic_industries_mid": n_basic_mid,
            "top_lq_industries_mid": top_lq_mid,
            "lq_table_mid": lq_table_mid_records,  # 全95業種LQテーブル
            "suitability_score_mid": score_mid,
            # 農林業センサス2020 補完版（家族農家含む）
            "ebm_mid_extended": ebm_mid_extended,
            "basic_ratio_mid_extended": basic_ratio_mid_extended,
            "basic_emp_mid_extended": basic_emp_extended,
            "n_basic_industries_extended": n_basic_industries_extended,
            "top_lq_industries_extended": top_lq_extended,
            "suitability_score_extended": score_extended,
            "agri_eco_workers": agri_eco_workers,
            "agri_extended_workers": agri_extended_workers,
            # 通勤歪み判定
            "commute_distortion": commute_distortion,
            "emp_to_pop_ratio": round(emp_to_pop, 3),
            # EBM構造分解（教育的解説用）
            "lq_above1_share": round(lq_above1_share, 1),
            "avg_excess_coef": round(avg_excess_coef, 3),
        }
    except Exception as e:
        print(f"  Error for pref {pref_code}: {e}")
        return None


def compute_metro_areas(accessor: MarketDataAccessor) -> dict:
    """都市圏（MSA相当）の集計指標を計算。"""
    import math
    results = {}
    for key, info in METROPOLITAN_AREAS.items():
        try:
            prefs = info["prefectures"]
            basics = accessor.metro_basics(prefs)
            local_emp, national_emp, _ = accessor.metro_industry_employment(prefs)
            df_lq = lq_table(local_emp, national_emp)
            basic = total_basic_employment(df_lq)
            total_emp = float(df_lq["local_emp"].sum())
            if total_emp <= 0:
                continue
            ebm = total_emp / basic if basic > 0 else 0
            per = population_employment_ratio(basics["population"], basics["total_employment"])
            basic_ratio = basic / total_emp * 100

            # 多角化指標
            shares = [float(v) / total_emp for v in df_lq["local_emp"] if v > 0]
            hhi = sum(s * s for s in shares) * 10000
            effective_n = 1 / sum(s * s for s in shares) if shares else 0
            shannon = -sum(s * math.log(s) for s in shares if s > 0)
            n_basic_industries = int((df_lq["lq"] > 1.0).sum())
            top5_share = float(df_lq.nlargest(5, "local_emp")["local_emp"].sum()) / total_emp * 100
            max_lq = float(df_lq["lq"].max())

            # Top LQ
            top_lq = (
                df_lq[df_lq["lq"] > 1.0]
                .nlargest(10, "basic_emp_estimate")
                [["industry", "lq", "basic_emp_estimate"]]
                .to_dict("records")
            )

            # Shift-share for the metro (大分類)
            rs_total = 0.0
            top_rs_industry = ""
            top_rs_value = 0.0
            try:
                l0, l1, n0, n1, _ = accessor.metro_shift_share_inputs(prefs)
                if l0 and l1:
                    df_ss = shift_share_table(l0, l1, n0, n1)
                    if not df_ss.empty:
                        rs_total = float(df_ss["regional_shift"].sum())
                        best = df_ss.loc[df_ss["regional_shift"].idxmax()]
                        top_rs_industry = str(best["industry"])
                        top_rs_value = float(best["regional_shift"])
            except Exception:
                pass

            # Shift-share for the metro (中分類95業種)
            rs_total_mid = 0.0
            top_rs_industry_mid = ""
            top_rs_value_mid = 0.0
            try:
                l0m, l1m, n0m, n1m, _ = accessor.metro_shift_share_inputs_mid(prefs)
                if l0m and l1m:
                    df_ss_mid = shift_share_table(l0m, l1m, n0m, n1m)
                    if not df_ss_mid.empty:
                        rs_total_mid = float(df_ss_mid["regional_shift"].sum())
                        best_mid = df_ss_mid.loc[df_ss_mid["regional_shift"].idxmax()]
                        top_rs_industry_mid = str(best_mid["industry"])
                        top_rs_value_mid = float(best_mid["regional_shift"])
            except Exception:
                pass

            # Retail gap
            agg_gap = 0.0
            try:
                sectors, _ = accessor.metro_retail_sectors(prefs)
                df_gap = gap_analysis_table(sectors)
                if not df_gap.empty:
                    td = df_gap["demand"].sum()
                    ts = df_gap["supply"].sum()
                    if (td + ts) > 0:
                        agg_gap = (td - ts) / (td + ts) * 100
            except Exception:
                pass

            results[key] = {
                "key": key,
                "name": info["name"],
                "prefectures": prefs,
                "pref_names": [PREFECTURES.get(pc, "") for pc in prefs],
                "core_pref": info["core_pref"],
                "note": info["note"],
                "population": basics["population"],
                "households": basics["households"],
                "total_employment": int(total_emp),
                "ebm": round(ebm, 2),
                "per": round(per, 2),
                "basic_emp": round(basic, 0),
                "basic_ratio": round(basic_ratio, 1),
                "top_lq_industries": top_lq,
                "rs_total": round(rs_total, 0),
                "top_rs_industry": top_rs_industry,
                "top_rs_value": round(top_rs_value, 0),
                "rs_total_mid": round(rs_total_mid, 0),
                "top_rs_industry_mid": top_rs_industry_mid,
                "top_rs_value_mid": round(top_rs_value_mid, 0),
                "aggregate_gap_factor": round(agg_gap, 1),
                # 多角化指標
                "n_basic_industries": n_basic_industries,
                "hhi": round(hhi, 0),
                "effective_n_industries": round(effective_n, 2),
                "shannon_entropy": round(shannon, 3),
                "top5_share": round(top5_share, 1),
                "max_lq": round(max_lq, 2),
            }
        except Exception as e:
            print(f"  Metro {key} error: {e}")
    return results


def _load_housing_vacancy() -> pd.DataFrame | None:
    """Load housing vacancy census 2023 CSV."""
    csv_path = Path(__file__).resolve().parent.parent / "data" / "cache" / "census_housing_vacancy_2023.csv"
    if csv_path.exists():
        try:
            df = pd.read_csv(csv_path, dtype={"area_code": str})
            df["area_code"] = df["area_code"].str.zfill(5)
            print(f"  Housing vacancy 2023 loaded: {len(df)} areas")
            return df
        except Exception as e:
            print(f"  Housing vacancy load error: {e}")
    return None


def _safe_housing_int(val) -> int:
    """NaN-safe int conversion for housing data."""
    import math
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return 0
    return int(val)


def _safe_housing_float(val) -> float:
    """NaN-safe float conversion for housing data."""
    import math
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return 0.0
    return round(float(val), 1)


def _enrich_municipality_with_housing(rec: dict, housing_df: pd.DataFrame | None):
    """Add housing vacancy metrics to a municipality record."""
    if housing_df is None:
        return
    muni_code = rec.get("area_code", "")
    row = housing_df[housing_df["area_code"] == muni_code]
    if row.empty:
        return
    r = row.iloc[0]
    rec["housing"] = {
        "total_dwellings": _safe_housing_int(r.get("total_dwellings", 0)),
        "owned": _safe_housing_int(r.get("owned", 0)),
        "rental": _safe_housing_int(r.get("rental", 0)),
        "owned_pct": _safe_housing_float(r.get("owned_pct", 0)),
        "rental_pct": _safe_housing_float(r.get("rental_pct", 0)),
        "vacancy_total": _safe_housing_int(r.get("vacancy_total", 0)),
        "vacancy_rental": _safe_housing_int(r.get("vacancy_rental", 0)),
        "vacancy_sales": _safe_housing_int(r.get("vacancy_sales", 0)),
        "vacancy_rate_pct": _safe_housing_float(r.get("vacancy_rate_pct", 0)),
        "rental_vacancy_rate_pct": _safe_housing_float(r.get("rental_vacancy_rate_pct", 0)),
        "source": "総務省 令和5年住宅・土地統計調査(2023)",
    }


def _load_nlni_data() -> dict[str, pd.DataFrame]:
    """Load all available NLNI processed CSVs. Returns {name: DataFrame}."""
    if not NLNI_AVAILABLE:
        return {}

    datasets = {}
    csv_names = [
        ("railways", "railways_stations.csv"),
        ("land_prices", "land_prices.csv"),
        ("flood", "flood_risk_by_muni.csv"),
        ("zoning", "zoning_by_muni.csv"),
        ("did", "did_by_muni.csv"),
        ("medical", "facilities_medical.csv"),
        ("commercial", "facilities_commercial.csv"),
        ("bus", "bus_coverage_by_muni.csv"),
        ("pop_proj", "mesh_pop_projection.csv"),
        ("location_opt", "location_optimization.csv"),
        ("roads", "roads_by_muni.csv"),
        ("driving", "driving_distances.csv"),
    ]

    for name, csv_name in csv_names:
        df = load_cached_csv(csv_name)
        if df is not None and not df.empty:
            datasets[name] = df
            print(f"  NLNI loaded: {name} ({len(df)} rows)")

    return datasets


def _enrich_prefecture_with_nlni(result: dict, pref_code: int, nlni: dict[str, pd.DataFrame]):
    """Add NLNI aggregate metrics to prefecture result dict."""
    pc_str = f"{pref_code:02d}"

    # Railways: station count + total ridership
    if "railways" in nlni:
        df = nlni["railways"]
        pref_df = df[df["pref_code"] == pc_str]
        result["num_stations"] = int(len(pref_df))
        riders_col = "daily_riders" if "daily_riders" in pref_df.columns else None
        result["total_daily_riders"] = int(pref_df[riders_col].sum()) if riders_col else 0

    # Land prices
    if "land_prices" in nlni:
        df = nlni["land_prices"]
        pref_df = df[df["pref_code"] == pc_str]
        if not pref_df.empty and "price_per_m2" in pref_df.columns:
            valid = pd.to_numeric(pref_df["price_per_m2"], errors="coerce").dropna()
            if not valid.empty:
                result["land_price_median_l01"] = round(float(valid.median()), 0)

    # Flood risk: average across municipalities
    if "flood" in nlni:
        df = nlni["flood"]
        pref_df = df[df["pref_code"] == pc_str]
        if not pref_df.empty:
            result["flood_risk_avg_pct"] = round(float(pref_df["flood_area_pct"].mean()), 1)

    # DID
    if "did" in nlni:
        df = nlni["did"]
        pref_df = df[df["pref_code"] == pc_str]
        if not pref_df.empty:
            result["did_total_area_ha"] = round(float(pref_df["did_area_ha"].sum()), 1)
            result["did_total_population"] = int(pref_df["did_population"].sum())

    # Medical & Commercial facilities
    for key, field in [("medical", "num_medical"), ("commercial", "num_commercial")]:
        if key in nlni:
            df = nlni[key]
            pref_df = df[df["pref_code"] == pc_str]
            result[field] = int(len(pref_df))

    # Bus coverage
    if "bus" in nlni:
        df = nlni["bus"]
        pref_df = df[df["pref_code"] == pc_str]
        if not pref_df.empty:
            result["total_bus_stops"] = int(pref_df["num_bus_stops"].sum())

    # Population projection
    if "pop_proj" in nlni:
        df = nlni["pop_proj"]
        pref_munis = df[df["pref_code"] == pc_str]
        if not pref_munis.empty:
            proj = {}
            for year in [2020, 2025, 2030, 2035, 2040, 2045, 2050, 2055, 2060, 2065, 2070]:
                year_df = pref_munis[pref_munis["year"] == year]
                if not year_df.empty:
                    proj[str(year)] = int(year_df["population"].sum())
            result["pop_projection"] = proj
            # pop_change_pct: 20-year outlook (2020→2040) for investment decisions
            # Also compute 10-year (2020→2030) for short-term perspective
            base_pop = proj.get("2020", 0)
            if base_pop > 0:
                if "2040" in proj:
                    change_20y = (proj["2040"] - base_pop) / base_pop * 100
                    result["pop_change_pct"] = round(change_20y, 1)
                if "2030" in proj:
                    change_10y = (proj["2030"] - base_pop) / base_pop * 100
                    result["pop_change_10y_pct"] = round(change_10y, 1)

    # Location optimization plan count
    if "location_opt" in nlni:
        df = nlni["location_opt"]
        pref_df = df[df["pref_code"] == pc_str]
        if not pref_df.empty:
            result["has_location_plan_count"] = int(pref_df["muni_code"].nunique())

    # Roads
    if "roads" in nlni:
        df = nlni["roads"]
        pref_df = df[df["pref_code"] == pc_str]
        if not pref_df.empty:
            result["total_road_segments"] = int(pref_df["total_road_segments"].sum())

    # --- Enhanced Investment Score (integrates NLNI spatial data) ---
    # Original score is economic-only. This adds risk/access/population.
    base_score = result.get("suitability_score", {}).get("total_score", 50)
    # Risk adjustment: -0 to -15 points for flood risk
    flood_pct = result.get("flood_risk_avg_pct", 0) or 0
    risk_penalty = min(15, flood_pct * 0.5)
    # Access bonus: 0 to +10 for transit density
    pop = result.get("population", 1) or 1
    riders = result.get("total_daily_riders", 0) or 0
    transit_density = riders / pop * 100
    access_bonus = min(10, transit_density * 0.1)
    # Population trend: -10 to +5
    pop_change = result.get("pop_change_pct", 0) or 0
    pop_adj = max(-10, min(5, pop_change * 0.5))

    enhanced = round(max(0, min(100, base_score - risk_penalty + access_bonus + pop_adj)), 1)
    result["enhanced_score"] = enhanced
    result["score_adjustments"] = {
        "base": round(base_score, 1),
        "risk_penalty": round(-risk_penalty, 1),
        "access_bonus": round(access_bonus, 1),
        "pop_adjustment": round(pop_adj, 1),
    }


def _enrich_municipality_with_nlni(rec: dict, pref_code: int, nlni: dict[str, pd.DataFrame]):
    """Add NLNI metrics to a single municipality record."""
    muni_code = rec.get("area_code", "")
    pc_str = f"{pref_code:02d}"

    # Railways
    if "railways" in nlni:
        df = nlni["railways"]
        muni_df = df[df["muni_code"] == muni_code]
        rec["num_stations"] = int(len(muni_df))
        if "daily_riders" in muni_df.columns:
            rec["daily_riders"] = int(muni_df["daily_riders"].sum())

    # Land prices
    if "land_prices" in nlni:
        df = nlni["land_prices"]
        muni_df = df[df["muni_code"] == muni_code]
        if not muni_df.empty and "price_per_m2" in muni_df.columns:
            valid = pd.to_numeric(muni_df["price_per_m2"], errors="coerce").dropna()
            if not valid.empty:
                rec["land_price_median"] = round(float(valid.median()), 0)

    # Flood risk
    if "flood" in nlni:
        df = nlni["flood"]
        muni_df = df[df["muni_code"] == muni_code]
        if not muni_df.empty:
            rec["flood_risk_pct"] = float(muni_df["flood_area_pct"].iloc[0])
            rec["max_flood_depth"] = int(muni_df["max_depth_class"].iloc[0])

    # DID
    if "did" in nlni:
        df = nlni["did"]
        muni_df = df[df["muni_code"] == muni_code]
        if not muni_df.empty:
            rec["did_area_ha"] = round(float(muni_df["did_area_ha"].sum()), 1)
            rec["did_population"] = int(muni_df["did_population"].sum())

    # Facilities
    for key, field in [("medical", "num_medical"), ("commercial", "num_commercial")]:
        if key in nlni:
            df = nlni[key]
            muni_df = df[df["muni_code"] == muni_code]
            rec[field] = int(len(muni_df))

    # Bus
    if "bus" in nlni:
        df = nlni["bus"]
        muni_df = df[df["muni_code"] == muni_code]
        if not muni_df.empty:
            rec["num_bus_stops"] = int(muni_df["num_bus_stops"].iloc[0])

    # Population projection
    if "pop_proj" in nlni:
        df = nlni["pop_proj"]
        muni_df = df[df["muni_code"] == muni_code]
        if not muni_df.empty:
            for year in [2030, 2050]:
                year_df = muni_df[muni_df["year"] == year]
                if not year_df.empty:
                    rec[f"pop_{year}"] = int(year_df["population"].sum())

    # Location optimization
    if "location_opt" in nlni:
        df = nlni["location_opt"]
        muni_df = df[df["muni_code"] == muni_code]
        rec["has_location_plan"] = bool(len(muni_df) > 0)
        # 区域種別ごとのフラグと区域数
        if not muni_df.empty and "area_type" in muni_df.columns:
            zones = muni_df["area_type"].tolist()
            rec["has_residential_zone"] = any("居住誘導" in z or "居住調整" in z for z in zones)
            rec["has_function_zone"] = any("都市機能誘導" in z for z in zones)
            # 各区域種別の合計区域数
            num_zone_col = "num_zones" if "num_zones" in muni_df.columns else None
            if num_zone_col:
                rec["location_zones_summary"] = (
                    muni_df.groupby("area_type")[num_zone_col].sum().to_dict()
                )

    # Zoning dominant
    if "zoning" in nlni:
        df = nlni["zoning"]
        muni_df = df[df["muni_code"] == muni_code]
        if not muni_df.empty and "zone_name" in muni_df.columns:
            dominant = muni_df["zone_name"].value_counts().index[0]
            rec["zoning_dominant"] = dominant

    # Driving distances (OSRM-based)
    if "driving" in nlni:
        df = nlni["driving"]
        muni_df = df[df["muni_code"].astype(str) == str(muni_code)]
        if not muni_df.empty:
            row = muni_df.iloc[0]
            rec["nearest_station_km"] = _safe_float(row.get("nearest_station_km"), 1)
            rec["nearest_station_min"] = _safe_float(row.get("nearest_station_min"), 1)
            rec["nearest_station_name"] = str(row.get("nearest_station_name", ""))
            rec["nearest_medical_km"] = _safe_float(row.get("nearest_medical_km"), 1)
            rec["nearest_medical_min"] = _safe_float(row.get("nearest_medical_min"), 1)
            rec["nearest_commercial_km"] = _safe_float(row.get("nearest_commercial_km"), 1)
            rec["nearest_commercial_min"] = _safe_float(row.get("nearest_commercial_min"), 1)
            rec["car_dependency_score"] = _safe_int(row.get("car_dependency_score"))


def _classify_municipality(
    emp_data: dict[str, float],
    total_emp: float,
    persons_per_hh: float,
) -> str:
    """Classify a single municipality into a segment (inline, no streamlit dep)."""
    if total_emp <= 0:
        return "均衡型"

    primary = sum(emp_data.get(k, 0) for k in [
        "農業，林業", "漁業", "鉱業，採石業，砂利採取業",
    ])
    secondary = sum(emp_data.get(k, 0) for k in ["製造業", "建設業"])
    tertiary_service = sum(emp_data.get(k, 0) for k in [
        "情報通信業", "金融業，保険業", "不動産業，物品賃貸業",
        "学術研究，専門・技術サービス業",
    ])
    retail_tourism = sum(emp_data.get(k, 0) for k in [
        "卸売業，小売業", "宿泊業，飲食サービス業", "生活関連サービス業，娯楽業",
    ])
    public_edu_med = sum(emp_data.get(k, 0) for k in [
        "公務（他に分類されるものを除く）", "教育，学習支援業", "医療，福祉",
    ])

    primary_ratio = primary / total_emp
    manufacturing = secondary / total_emp
    service_ratio = tertiary_service / total_emp
    retail_ratio = retail_tourism / total_emp
    public_ratio = public_edu_med / total_emp

    if service_ratio > 0.20:
        return "都市サービス集積型"
    if manufacturing > 0.25:
        return "工業基盤型"
    if retail_ratio > 0.30:
        return "商業・観光型"
    if public_ratio > 0.35:
        return "公務・教育型"
    if primary_ratio > 0.10 or persons_per_hh < 2.0:
        return "高齢縮小型"
    return "均衡型"


def compute_municipalities(accessor: MarketDataAccessor, pref_code: int) -> list[dict]:
    """Compute LQ summary + segment + 中分類版 + 農林業補完版 for all municipalities."""
    try:
        df = map_data.compute_municipality_lq(pref_code)
        if df is None or df.empty:
            return []

        records = df.to_dict("records")

        # Load census cache for segmentation classification
        from data.census_cache import (
            load_cached_dataset, DS_EMPLOYMENT_MAJOR, DS_EMPLOYMENT_MID, DS_POPULATION,
            get_area_employment, get_area_employment_mid, get_area_population,
            load_agri_census, get_area_agri_workers,
        )
        cache_dir = Path(__file__).resolve().parent.parent / "data" / "cache"
        df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
        df_pop = load_cached_dataset(cache_dir, DS_POPULATION.csv_name)
        df_mid = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MID.csv_name)
        df_agri = load_agri_census(cache_dir)

        # 全国の中分類雇用（一度だけロード）
        national_mid = get_area_employment_mid(df_mid, "00000") if df_mid is not None else None
        national_mid_ext = (
            get_area_employment_mid(df_mid, "00000", extend_agriculture=True, agri_df=df_agri)
            if df_mid is not None and df_agri is not None
            else None
        )

        for rec in records:
            area_code = rec["area_code"]
            segment = "均衡型"  # default

            if df_emp is not None:
                emp_data = get_area_employment(df_emp, area_code)
                if emp_data:
                    total_emp = sum(emp_data.values())
                    # Get persons_per_household from population data
                    persons_per_hh = 2.0  # default
                    if df_pop is not None:
                        pop_data = get_area_population(df_pop, area_code)
                        if pop_data:
                            population = pop_data.get("人口", 0)
                            households = pop_data.get("世帯数", 0)
                            if households > 0:
                                persons_per_hh = population / households

                    segment = _classify_municipality(emp_data, total_emp, persons_per_hh)

            rec["segment"] = segment
            rec["census2025"] = _pop_momentum_block(area_code)

            # 中分類版・+農林業版の計算（市区町村レベル）
            if df_mid is not None and national_mid:
                try:
                    local_mid = get_area_employment_mid(df_mid, area_code)
                    if local_mid:
                        df_lq_mid = lq_table(local_mid, national_mid)
                        b_mid = total_basic_employment(df_lq_mid)
                        t_mid = float(df_lq_mid["local_emp"].sum())
                        if t_mid > 0 and b_mid > 0:
                            rec["ebm_mid"] = round(t_mid / b_mid, 2)
                            rec["basic_ratio_mid"] = round(b_mid / t_mid * 100, 1)
                            rec["basic_emp_mid"] = round(b_mid, 0)
                            rec["n_basic_industries_mid"] = int((df_lq_mid["lq"] > 1.0).sum())
                            rec["top_lq_industries_mid"] = (
                                df_lq_mid[df_lq_mid["lq"] > 1.0]
                                .nlargest(10, "basic_emp_estimate")
                                [["industry", "lq", "basic_emp_estimate"]]
                                .to_dict("records")
                            )
                            # 全95業種LQテーブル（EBMタブ用）
                            rec["lq_table_mid"] = (
                                df_lq_mid[["industry", "local_emp", "national_emp", "lq", "basic_emp_estimate"]]
                                .to_dict("records")
                            )

                    # +農林業補完版
                    if df_agri is not None and national_mid_ext:
                        local_ext = get_area_employment_mid(
                            df_mid, area_code,
                            extend_agriculture=True, agri_df=df_agri,
                        )
                        if local_ext:
                            df_lq_ext = lq_table(local_ext, national_mid_ext)
                            b_ext = total_basic_employment(df_lq_ext)
                            t_ext = float(df_lq_ext["local_emp"].sum())
                            if t_ext > 0 and b_ext > 0:
                                rec["ebm_mid_extended"] = round(t_ext / b_ext, 2)
                                rec["basic_ratio_mid_extended"] = round(b_ext / t_ext * 100, 1)
                                rec["basic_emp_mid_extended"] = round(b_ext, 0)
                                rec["n_basic_industries_extended"] = int((df_lq_ext["lq"] > 1.0).sum())
                                rec["top_lq_industries_extended"] = (
                                    df_lq_ext[df_lq_ext["lq"] > 1.0]
                                    .nlargest(10, "basic_emp_estimate")
                                    [["industry", "lq", "basic_emp_estimate"]]
                                    .to_dict("records")
                                )

                        # 農業従業者の経済センサス値 / 補完値
                        agri_info = get_area_agri_workers(df_agri, area_code)
                        if agri_info:
                            rec["agri_eco_workers"] = int(agri_info["eco_only"])
                            rec["agri_extended_workers"] = int(agri_info["extended"])
                except Exception:
                    pass

        return records
    except Exception:
        pass
    return []


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(MUNI_DIR, exist_ok=True)

    accessor = MarketDataAccessor()

    # Load housing vacancy data (optional)
    print("Loading housing vacancy data...")
    housing_df = _load_housing_vacancy()

    # Load NLNI data (optional — if not downloaded, skip gracefully)
    print("Loading NLNI spatial data...")
    nlni = _load_nlni_data()
    if nlni:
        print(f"  {len(nlni)} NLNI datasets available")
    else:
        print("  No NLNI data found (run scripts/download_nlni.py first)")

    all_prefs = {}

    print("\nComputing prefecture data...")
    for pc in range(1, 48):
        name = PREFECTURES.get(pc, "")
        print(f"  [{pc:02d}/47] {name}...", end=" ")
        result = compute_prefecture_full(accessor, pc)
        if result:
            # Enrich with NLNI data
            if nlni:
                _enrich_prefecture_with_nlni(result, pc, nlni)
            all_prefs[str(pc)] = result
            print("OK")
        else:
            print("SKIP (no data)")

    # Write prefectures.json
    out_path = OUTPUT_DIR / "prefectures.json"
    # --- 中分類詳細（EBMタブ専用）を分離して初期ロードを軽量化 ---
    # NOTE: この分離はパイプラインに組み込まれている（手動後処理にしない）。
    #       再実行のたびに prefectures.json（軽量）と prefectures_detail_mid.json（遅延）を
    #       両方とも正しく再生成し、二重化・スタール化を防ぐ。
    #       参照: src/lib/use-prefecture-data.ts usePrefDetailMid()
    MID_DETAIL_KEYS = ("lq_table_mid", "shift_share_table_mid")
    detail_mid = {}
    for pc, rec in all_prefs.items():
        moved = {k: rec.pop(k) for k in MID_DETAIL_KEYS if k in rec}
        if moved:
            detail_mid[pc] = moved

    if detail_mid:
        detail_path = OUTPUT_DIR / "prefectures_detail_mid.json"
        with open(detail_path, "w", encoding="utf-8") as f:
            json.dump(detail_mid, f, ensure_ascii=False, separators=(",", ":"))
        detail_kb = detail_path.stat().st_size / 1024
        print(
            f"\nWrote {detail_path} ({detail_kb:.1f} KB, {len(detail_mid)} prefectures — 遅延ロード)"
        )

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_prefs, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"Wrote {out_path} ({size_mb:.1f} MB, {len(all_prefs)} prefectures)")

    # Write metro_summary.json (都市圏MSA相当)
    print("\nComputing metropolitan area summary...")
    metro_data = compute_metro_areas(accessor)
    if metro_data:
        metro_path = OUTPUT_DIR / "metro_summary.json"
        with open(metro_path, "w", encoding="utf-8") as f:
            json.dump(metro_data, f, ensure_ascii=False, separators=(",", ":"))
        size_kb = metro_path.stat().st_size / 1024
        print(f"  Wrote {metro_path} ({size_kb:.1f} KB, {len(metro_data)} metros)")

    # Write municipality data per prefecture
    print("\nComputing municipality data...")
    for pc in range(1, 48):
        name = PREFECTURES.get(pc, "")
        print(f"  [{pc:02d}/47] {name}...", end=" ")
        munis = compute_municipalities(accessor, pc)
        if munis:
            # Enrich each municipality with housing + NLNI data
            for rec in munis:
                _enrich_municipality_with_housing(rec, housing_df)
            if nlni:
                for rec in munis:
                    _enrich_municipality_with_nlni(rec, pc, nlni)
            muni_path = MUNI_DIR / f"{pc}.json"
            with open(muni_path, "w", encoding="utf-8") as f:
                json.dump(munis, f, ensure_ascii=False, separators=(",", ":"))
            print(f"OK ({len(munis)} municipalities)")
        else:
            print("SKIP")

    print("\nDone.")


if __name__ == "__main__":
    main()
