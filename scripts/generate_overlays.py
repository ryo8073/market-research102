"""MapLibre用オーバーレイGeoJSON生成。

処理済みCSVデータ + raw Shapefileからフロントエンド用の軽量GeoJSONを生成。
ポイントデータ（駅、地価）はCSVから、ポリゴンデータはShapefileから変換。

Usage:
  python scripts/generate_overlays.py
  python scripts/generate_overlays.py --pref 13
"""
from __future__ import annotations

import argparse
import io
import json
import logging
import sys
from pathlib import Path

# Windows console encoding fix
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from data.nlni.downloader import load_cached_csv

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "ci102-nextjs" / "public" / "data" / "nlni"
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "nlni" / "raw"


def _save_geojson(features: list[dict], pref_code: int, layer_id: str):
    """GeoJSON FeatureCollectionを保存。"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = {"type": "FeatureCollection", "features": features}
    path = OUTPUT_DIR / f"{layer_id}_{pref_code:02d}.geojson"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = path.stat().st_size / 1024
    logger.info(f"  {path.name}: {len(features)} features, {size_kb:.0f} KB")


# --------------------------------------------------------------------------
# Shapefile → GeoJSON conversion (using pyshp)
# --------------------------------------------------------------------------

def _read_shapefile_as_geojson(shp_path: Path, simplify: bool = True) -> list[dict]:
    """Read a Shapefile and return GeoJSON features.

    Uses pyshp (shapefile) which is already a project dependency.
    Optionally simplifies coordinates by rounding to reduce file size.
    """
    try:
        import shapefile
    except ImportError:
        logger.error("pyshp not installed. Run: pip install pyshp")
        return []

    try:
        stem = str(shp_path).replace(".shp", "")
        # Try cp932 first (most NLNI Shapefiles), then utf-8
        try:
            sf = shapefile.Reader(stem, encoding="cp932")
        except Exception:
            sf = shapefile.Reader(stem, encoding="utf-8")
    except Exception as e:
        logger.warning(f"  Cannot read {shp_path.name}: {e}")
        return []

    features = []
    field_names = [f[0] for f in sf.fields[1:]]  # Skip DeletionFlag

    try:
        records = list(sf.iterShapeRecords())
    except (UnicodeDecodeError, Exception) as e:
        # Retry with utf-8 encoding if cp932 fails mid-stream
        try:
            stem = str(shp_path).replace(".shp", "")
            sf = shapefile.Reader(stem, encoding="utf-8")
            field_names = [f[0] for f in sf.fields[1:]]
            records = list(sf.iterShapeRecords())
        except Exception:
            logger.warning(f"  Encoding error in {shp_path.name}, skipping: {e}")
            return []

    for shape_rec in records:
        geom = shape_rec.shape.__geo_interface__
        props = dict(zip(field_names, shape_rec.record))

        # Simplify: round coordinates to 4 decimal places (~11m precision)
        if simplify:
            geom = _round_coordinates(geom, decimals=4)

        # Clean properties: convert to JSON-safe types
        clean_props = {}
        for k, v in props.items():
            if isinstance(v, bytes):
                try:
                    v = v.decode("cp932")
                except Exception:
                    v = str(v)
            clean_props[k] = v

        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": clean_props,
        })

    return features


def _round_coordinates(geom: dict, decimals: int = 4) -> dict:
    """Round all coordinates in a GeoJSON geometry to reduce file size."""
    def _round_coords(coords):
        if isinstance(coords[0], (list, tuple)):
            return [_round_coords(c) for c in coords]
        return [round(c, decimals) for c in coords]

    return {
        "type": geom["type"],
        "coordinates": _round_coords(geom["coordinates"]),
    }


def _find_shapefiles(dataset_dir: Path, pref_code: int) -> list[Path]:
    """Find all .shp files for a given prefecture (recursive search)."""
    pref_dir = dataset_dir / f"{pref_code:02d}"
    if not pref_dir.exists():
        return []
    return sorted(pref_dir.rglob("*.shp"))


# --------------------------------------------------------------------------
# Point layers (from CSV)
# --------------------------------------------------------------------------

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
            try:
                lon, lat = float(row["lon"]), float(row["lat"])
            except (ValueError, TypeError):
                continue
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
                "properties": {
                    "name": str(row.get("station_name", "")),
                    "line": str(row.get("line_name", "")),
                    "riders": int(row.get("daily_riders", 0) or 0),
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
            try:
                lon, lat = float(row["lon"]), float(row["lat"])
            except (ValueError, TypeError):
                continue
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
                "properties": {
                    "price": int(float(price)),
                    "use": str(row.get("current_use", "")),
                    "zone": str(row.get("zoning", "")),
                    "station": str(row.get("nearest_station", "")),
                },
            })
        _save_geojson(features, pc, "land_prices")


# --------------------------------------------------------------------------
# Polygon layers (from Shapefile)
# --------------------------------------------------------------------------

def generate_flood(pref_codes: list[int]):
    """洪水浸水想定区域のGeoJSONを生成 (A31)。"""
    dataset_dir = RAW_DIR / "A31"
    if not dataset_dir.exists():
        logger.warning("  A31 (flood) raw data not found")
        return

    for pc in pref_codes:
        shp_files = _find_shapefiles(dataset_dir, pc)
        if not shp_files:
            continue
        all_features = []
        for shp in shp_files:
            all_features.extend(_read_shapefile_as_geojson(shp))
        if not all_features:
            continue

        slim_features = []
        for f in all_features:
            slim_features.append({
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "depth": f["properties"].get("A31_001", f["properties"].get("A31b_001", "")),
                },
            })
        _save_geojson(slim_features, pc, "flood")


def generate_did(pref_codes: list[int]):
    """人口集中地区(DID)のGeoJSONを生成 (A16)。"""
    dataset_dir = RAW_DIR / "A16"
    if not dataset_dir.exists():
        logger.warning("  A16 (DID) raw data not found")
        return

    for pc in pref_codes:
        shp_files = _find_shapefiles(dataset_dir, pc)
        if not shp_files:
            continue
        all_features = []
        for shp in shp_files:
            all_features.extend(_read_shapefile_as_geojson(shp))
        if not all_features:
            continue

        slim_features = []
        for f in all_features:
            slim_features.append({
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "name": f["properties"].get("A16_003", f["properties"].get("A16_002", "")),
                    "pop": f["properties"].get("A16_004", ""),
                },
            })
        _save_geojson(slim_features, pc, "did")


def generate_zoning(pref_codes: list[int]):
    """用途地域のGeoJSONを生成 (A29)。"""
    dataset_dir = RAW_DIR / "A29"
    if not dataset_dir.exists():
        logger.warning("  A29 (zoning) raw data not found")
        return

    for pc in pref_codes:
        shp_files = _find_shapefiles(dataset_dir, pc)
        if not shp_files:
            continue
        all_features = []
        for shp in shp_files:
            all_features.extend(_read_shapefile_as_geojson(shp))
        if not all_features:
            continue

        slim_features = []
        for f in all_features:
            slim_features.append({
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "zone": f["properties"].get("A29_004", f["properties"].get("A29_003", "")),
                },
            })
        _save_geojson(slim_features, pc, "zoning")


def generate_location_opt(pref_codes: list[int]):
    """立地適正化計画のGeoJSONを生成 (A50)。"""
    dataset_dir = RAW_DIR / "A50"
    if not dataset_dir.exists():
        logger.warning("  A50 (location_opt) raw data not found")
        return

    for pc in pref_codes:
        shp_files = _find_shapefiles(dataset_dir, pc)
        if not shp_files:
            continue
        all_features = []
        for shp in shp_files:
            all_features.extend(_read_shapefile_as_geojson(shp))
        if not all_features:
            continue

        slim_features = []
        for f in all_features:
            slim_features.append({
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {
                    "type": f["properties"].get("A50_003", f["properties"].get("A50_002", "")),
                    "name": f["properties"].get("A50_001", ""),
                },
            })
        _save_geojson(slim_features, pc, "location_opt")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="オーバーレイGeoJSON生成")
    parser.add_argument("--pref", "-p", type=int, nargs="+", help="都道府県コード")
    args = parser.parse_args()

    pref_codes = args.pref or list(range(1, 48))

    logger.info("=== Generating overlay GeoJSON ===")
    logger.info("--- Point layers (from CSV) ---")
    generate_railways(pref_codes)
    generate_land_prices(pref_codes)
    logger.info("--- Polygon layers (from Shapefile) ---")
    generate_flood(pref_codes)
    generate_did(pref_codes)
    generate_zoning(pref_codes)
    generate_location_opt(pref_codes)
    logger.info("=== Done ===")


if __name__ == "__main__":
    main()
