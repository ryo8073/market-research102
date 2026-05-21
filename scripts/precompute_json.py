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
            "lq_table": lq_records,
            "shift_share_table": ss_records,
            "gap_table": gap_records,
        }
    except Exception as e:
        print(f"  Error for pref {pref_code}: {e}")
        return None


def compute_municipalities(accessor: MarketDataAccessor, pref_code: int) -> list[dict]:
    """Compute LQ summary for all municipalities in a prefecture."""
    try:
        df = map_data.compute_municipality_lq(pref_code)
        if df is not None and not df.empty:
            return df.to_dict("records")
    except Exception:
        pass
    return []


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(MUNI_DIR, exist_ok=True)

    accessor = MarketDataAccessor()
    all_prefs = {}

    print("Computing prefecture data...")
    for pc in range(1, 48):
        name = PREFECTURES.get(pc, "")
        print(f"  [{pc:02d}/47] {name}...", end=" ")
        result = compute_prefecture_full(accessor, pc)
        if result:
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
            muni_path = MUNI_DIR / f"{pc}.json"
            with open(muni_path, "w", encoding="utf-8") as f:
                json.dump(munis, f, ensure_ascii=False, separators=(",", ":"))
            print(f"OK ({len(munis)} municipalities)")
        else:
            print("SKIP")

    print("\nDone.")


if __name__ == "__main__":
    main()
