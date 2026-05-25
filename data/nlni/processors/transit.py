"""バス路線/バス停プロセッサ (N07/P11)。

バス停ポイントデータを市区町村別に集計。

出力CSV: bus_coverage_by_muni.csv
  pref_code, muni_code, num_bus_stops, num_bus_routes
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)
from data.nlni.spatial import aggregate_points_by_municipality

logger = logging.getLogger(__name__)

OUTPUT_CSV = "bus_coverage_by_muni.csv"


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分のバスデータを処理。"""
    # バス停 (P11)
    bus_stop_dir = RAW_DIR / "P11" / f"{pref_code:02d}"
    num_stops_by_muni: dict[str, int] = {}

    if bus_stop_dir.exists():
        try:
            # Try shapefile first, then GML XML
            try:
                records = read_shapefile_records(bus_stop_dir, encoding="cp932")
            except FileNotFoundError:
                # GML XML fallback
                from data.nlni.downloader import read_gml_points
                xml_files = list(bus_stop_dir.rglob("*.xml"))
                xml_files = [f for f in xml_files if "META" not in f.name]
                if xml_files:
                    records = read_gml_points(xml_files[0], "BusStop")
                else:
                    records = []
            point_records = [r for r in records if "_lon" in r and "_lat" in r]
            if point_records:
                by_muni = aggregate_points_by_municipality(point_records, pref_code)
                num_stops_by_muni = {mc: len(recs) for mc, recs in by_muni.items()}
        except Exception as e:
            logger.warning(f"  Error reading P11 for pref {pref_code:02d}: {e}")

    # バス路線 (N07) — 路線数をカウント
    bus_route_dir = RAW_DIR / "N07" / f"{pref_code:02d}"
    num_routes = 0
    if bus_route_dir.exists():
        try:
            records = read_shapefile_records(bus_route_dir, encoding="cp932")
            num_routes = len(records)
        except Exception:
            pass

    if not num_stops_by_muni:
        return pd.DataFrame()

    rows = []
    for muni_code, count in num_stops_by_muni.items():
        rows.append({
            "pref_code": f"{pref_code:02d}",
            "muni_code": muni_code,
            "num_bus_stops": count,
            "num_bus_routes": num_routes,  # 県全体の路線数
        })

    return pd.DataFrame(rows)


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県のバスデータを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing bus data pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
