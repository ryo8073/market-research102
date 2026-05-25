"""洪水浸水想定区域プロセッサ (A31)。

浸水想定区域ポリゴンを市区町村境界と重ね合わせ、
各市区町村の浸水リスク割合を算出。

出力CSV: flood_risk_by_muni.csv
  pref_code, muni_code, flood_area_pct, max_depth_class, num_risk_zones
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd
from shapely.geometry import shape

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)
from data.nlni.spatial import load_municipality_boundaries

logger = logging.getLogger(__name__)

OUTPUT_CSV = "flood_risk_by_muni.csv"


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分の洪水浸水想定区域を処理。"""
    raw_dir = RAW_DIR / "A31" / f"{pref_code:02d}"
    if not raw_dir.exists():
        return pd.DataFrame()

    try:
        records = read_shapefile_records(raw_dir, encoding="cp932")
    except Exception as e:
        logger.error(f"  Error reading A31 for pref {pref_code:02d}: {e}")
        return pd.DataFrame()

    if not records:
        return pd.DataFrame()

    # 市区町村境界を取得
    boundaries = load_municipality_boundaries(pref_code)
    if not boundaries:
        return pd.DataFrame()

    # 浸水ポリゴンをshapely化
    flood_geoms = []
    for rec in records:
        if "_points" not in rec:
            continue
        try:
            parts = rec.get("_parts", [0])
            points = rec["_points"]
            if len(parts) == 1:
                coords = [(p[0], p[1]) for p in points]
                geom = shape({"type": "Polygon", "coordinates": [coords]})
            else:
                rings = []
                for i, start in enumerate(parts):
                    end = parts[i + 1] if i + 1 < len(parts) else len(points)
                    ring = [(p[0], p[1]) for p in points[start:end]]
                    rings.append(ring)
                geom = shape({"type": "Polygon", "coordinates": rings})

            if geom.is_valid:
                depth_class = rec.get("A31_001", rec.get("A31b_001", 0))
                try:
                    depth_class = int(float(depth_class))
                except (ValueError, TypeError):
                    depth_class = 1
                flood_geoms.append({"geom": geom, "depth": depth_class})
        except Exception:
            continue

    if not flood_geoms:
        return pd.DataFrame()

    # 各市区町村と浸水ポリゴンの交差面積を計算
    rows = []
    for boundary in boundaries:
        muni_code = boundary["properties"].get("N03_007", "")
        muni_name = boundary["properties"].get("N03_004", "")
        muni_geom = boundary["geometry"]

        if not muni_code or not muni_geom.is_valid:
            continue

        muni_area = muni_geom.area
        if muni_area <= 0:
            continue

        total_flood_area = 0.0
        max_depth = 0
        num_zones = 0

        for fg in flood_geoms:
            try:
                if muni_geom.intersects(fg["geom"]):
                    intersection = muni_geom.intersection(fg["geom"])
                    total_flood_area += intersection.area
                    max_depth = max(max_depth, fg["depth"])
                    num_zones += 1
            except Exception:
                continue

        flood_pct = min(100.0, (total_flood_area / muni_area) * 100)

        rows.append({
            "pref_code": f"{pref_code:02d}",
            "muni_code": muni_code,
            "flood_area_pct": round(flood_pct, 1),
            "max_depth_class": max_depth,
            "num_risk_zones": num_zones,
        })

    return pd.DataFrame(rows) if rows else pd.DataFrame()


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県の洪水浸水想定区域を処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing A31 pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
