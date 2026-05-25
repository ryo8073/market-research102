"""商業施設 + 医療施設プロセッサ (P09 + P04)。

ポイントデータを市区町村別に集計。

出力CSV:
  facilities_medical.csv   — pref_code, muni_code, facility_name, type, lon, lat
  facilities_commercial.csv — pref_code, muni_code, facility_name, type, lon, lat
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

MEDICAL_CSV = "facilities_medical.csv"
COMMERCIAL_CSV = "facilities_commercial.csv"


def _process_facility_dataset(
    dataset_id: str,
    output_csv: str,
    name_field: str,
    type_field: str,
    pref_codes: list[int] | None = None,
) -> pd.DataFrame:
    """汎用施設データプロセッサ。"""
    cached = load_cached_csv(output_csv)
    if cached is not None:
        logger.info(f"Using cached {output_csv}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_rows = []

    for pc in codes:
        raw_dir = RAW_DIR / dataset_id / f"{pc:02d}"
        if not raw_dir.exists():
            continue

        try:
            records = read_shapefile_records(raw_dir, encoding="cp932")
        except Exception as e:
            logger.warning(f"  Error reading {dataset_id} for pref {pc:02d}: {e}")
            continue

        point_records = [r for r in records if "_lon" in r and "_lat" in r]
        if not point_records:
            continue

        # 座標→市区町村コード変換（point-in-polygon）
        from data.nlni.spatial import assign_points_to_municipalities
        points = [(r["_lon"], r["_lat"]) for r in point_records]
        muni_codes = assign_points_to_municipalities(points, pc)

        for rec, muni_code in zip(point_records, muni_codes):
            all_rows.append({
                "pref_code": f"{pc:02d}",
                "muni_code": muni_code or "",
                "facility_name": rec.get(name_field, ""),
                "type": rec.get(type_field, ""),
                "lon": rec["_lon"],
                "lat": rec["_lat"],
            })

    if not all_rows:
        return pd.DataFrame()

    result = pd.DataFrame(all_rows)
    save_cached_csv(result, output_csv)
    return result


def process_medical(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """医療施設データを処理。"""
    return _process_facility_dataset(
        dataset_id="P04",
        output_csv=MEDICAL_CSV,
        name_field="P04_004",  # 施設名
        type_field="P04_003",  # 施設分類
        pref_codes=pref_codes,
    )


def process_commercial(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """集客施設(P33)データを処理。"""
    cached = load_cached_csv(COMMERCIAL_CSV)
    if cached is not None:
        logger.info(f"Using cached {COMMERCIAL_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_rows = []

    for pc in codes:
        raw_dir = RAW_DIR / "P33" / f"{pc:02d}"
        if not raw_dir.exists():
            continue

        try:
            records = read_shapefile_records(raw_dir, encoding="cp932")
        except Exception as e:
            logger.warning(f"  Error reading P33 for pref {pc:02d}: {e}")
            continue

        for rec in records:
            if "_lon" not in rec or "_lat" not in rec:
                continue
            # P33_002 = 市区町村コード, P33_005 = 施設名, P33_001 = 施設分類
            muni_code = str(rec.get("P33_002", "")).zfill(5)
            all_rows.append({
                "pref_code": f"{pc:02d}",
                "muni_code": muni_code,
                "facility_name": rec.get("P33_005", ""),
                "type": rec.get("P33_001", ""),
                "lon": rec["_lon"],
                "lat": rec["_lat"],
            })

    if not all_rows:
        return pd.DataFrame()

    result = pd.DataFrame(all_rows)
    save_cached_csv(result, COMMERCIAL_CSV)
    return result


def process_all(pref_codes: list[int] | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """両方を処理。"""
    med = process_medical(pref_codes)
    com = process_commercial(pref_codes)
    return med, com
