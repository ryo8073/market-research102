"""MapLibre用オーバーレイGeoJSON生成。

処理済みCSVデータからフロントエンド用の軽量GeoJSONを生成。
ポイントデータ（駅、地価）はそのまま、ポリゴンデータは簡略化。

Usage:
  python scripts/generate_overlays.py
  python scripts/generate_overlays.py --pref 13
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from data.nlni.downloader import load_cached_csv

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "ci102-nextjs" / "public" / "data" / "nlni"


def _save_geojson(features: list[dict], pref_code: int, layer_id: str):
    """GeoJSON FeatureCollectionを保存。"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = {"type": "FeatureCollection", "features": features}
    path = OUTPUT_DIR / f"{layer_id}_{pref_code:02d}.geojson"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = path.stat().st_size / 1024
    logger.info(f"  {path.name}: {len(features)} features, {size_kb:.0f} KB")


def generate_railways(pref_codes: list[int]):
    """鉄道駅のGeoJSONを生成。"""
    df = load_cached_csv("railways_stations.csv")
    if df is None or df.empty:
        logger.warning("  railways_stations.csv not found")
        return

    for pc in pref_codes:
        pc_str = f"{pc:02d}"
        pref_df = df[df["pref_code"] == pc_str]
        if pref_df.empty:
            continue

        features = []
        for _, row in pref_df.iterrows():
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(float(row["lon"]), 5), round(float(row["lat"]), 5)],
                },
                "properties": {
                    "name": row.get("station_name", ""),
                    "line": row.get("line_name", ""),
                    "riders": int(row.get("daily_riders", 0)),
                },
            })
        _save_geojson(features, pc, "railways")


def generate_land_prices(pref_codes: list[int]):
    """地価公示のGeoJSONを生成。"""
    df = load_cached_csv("land_prices.csv")
    if df is None or df.empty:
        logger.warning("  land_prices.csv not found")
        return

    for pc in pref_codes:
        pc_str = f"{pc:02d}"
        pref_df = df[df["pref_code"] == pc_str]
        if pref_df.empty:
            continue

        features = []
        for _, row in pref_df.iterrows():
            price = row.get("price_per_m2")
            if pd.isna(price):
                continue
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [round(float(row["lon"]), 5), round(float(row["lat"]), 5)],
                },
                "properties": {
                    "price": int(float(price)),
                    "use": str(row.get("current_use", "")),
                    "zone": str(row.get("zoning", "")),
                    "station": str(row.get("nearest_station", "")),
                },
            })
        _save_geojson(features, pc, "land_prices")


def generate_placeholder_polygons(pref_codes: list[int]):
    """ポリゴン系レイヤーのプレースホルダー生成。

    実際のポリゴンデータはShapefileから直接変換する必要があるが、
    現時点ではCSV集約データのみ。将来的にgenerate_overlays.pyを拡張して
    Shapefileから直接GeoJSONを生成する。
    """
    # flood, zoning, did, location_opt は集約CSVから
    # ポリゴン形状はShapefileから再抽出が必要
    # 現時点ではポイントデータのみGeoJSON化
    logger.info("  Polygon overlays require Shapefile re-processing (future enhancement)")


def main():
    parser = argparse.ArgumentParser(description="オーバーレイGeoJSON生成")
    parser.add_argument("--pref", "-p", type=int, nargs="+",
                        help="都道府県コード")
    args = parser.parse_args()

    pref_codes = args.pref or list(range(1, 48))

    logger.info("=== Generating overlay GeoJSON ===")
    generate_railways(pref_codes)
    generate_land_prices(pref_codes)
    generate_placeholder_polygons(pref_codes)
    logger.info("=== Done ===")


if __name__ == "__main__":
    main()
