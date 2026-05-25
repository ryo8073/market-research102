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
from data.codes import PREFECTURES
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

        # Shift-share
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

        return {
            "pref_code": pref_code,
            "pref_name": PREFECTURES.get(pref_code, ""),
            "population": basics["population"],
            "households": basics["households"],
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
            "aggregate_gap_factor": round(agg_gap, 1),
            "num_leakage_sectors": n_leak,
            "num_surplus_sectors": n_surplus,
            "suitability_score": score,
            "daytime_population": round(daytime, 0),
            "median_unit_price": round(median_price, 0) if median_price else None,
            "lq_table": lq_records,
            "shift_share_table": ss_records,
            "gap_table": gap_records,
        }
    except Exception as e:
        print(f"  Error for pref {pref_code}: {e}")
        return None


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
            if len(proj) >= 2:
                earliest = min(int(k) for k in proj.keys())
                latest = max(int(k) for k in proj.keys())
                if proj[str(earliest)] > 0:
                    change = (proj[str(latest)] - proj[str(earliest)]) / proj[str(earliest)] * 100
                    result["pop_change_pct"] = round(change, 1)

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
    """Compute LQ summary + segment for all municipalities in a prefecture."""
    try:
        df = map_data.compute_municipality_lq(pref_code)
        if df is None or df.empty:
            return []

        records = df.to_dict("records")

        # Load census cache for segmentation classification
        from data.census_cache import (
            load_cached_dataset, DS_EMPLOYMENT_MAJOR, DS_POPULATION,
            get_area_employment, get_area_population,
        )
        cache_dir = Path(__file__).resolve().parent.parent / "data" / "cache"
        df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
        df_pop = load_cached_dataset(cache_dir, DS_POPULATION.csv_name)

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
                            population = pop_data.get("2015年（平成27年）の人口（組替）", 0)
                            households = pop_data.get("世帯数", 0)
                            if households > 0:
                                persons_per_hh = population / households

                    segment = _classify_municipality(emp_data, total_emp, persons_per_hh)

            rec["segment"] = segment

        return records
    except Exception:
        pass
    return []


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(MUNI_DIR, exist_ok=True)

    accessor = MarketDataAccessor()

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
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_prefs, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"\nWrote {out_path} ({size_mb:.1f} MB, {len(all_prefs)} prefectures)")

    # Write municipality data per prefecture
    print("\nComputing municipality data...")
    for pc in range(1, 48):
        name = PREFECTURES.get(pc, "")
        print(f"  [{pc:02d}/47] {name}...", end=" ")
        munis = compute_municipalities(accessor, pc)
        if munis:
            # Enrich each municipality with NLNI data
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
