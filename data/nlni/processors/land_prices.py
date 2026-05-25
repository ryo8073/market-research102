"""地価公示プロセッサ (L01)。

地価公示データ（ポイント）を市区町村別に集約。

出力CSV: land_prices.csv
  pref_code, muni_code, point_id, lon, lat, price_per_m2, change_rate,
  current_use, zoning, building_coverage, floor_area_ratio, nearest_station, station_distance
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

OUTPUT_CSV = "land_prices.csv"

# L01 フィールドマッピング（v3.1/v3.2）
# 141属性のうち主要なものを抽出
FIELD_MAP = {
    "L01_001": "standard_code",      # 標準地コード(市区町村コード)
    "L01_008": "price_per_m2",       # 公示価格（円/m²）★L01_006は枝番
    "L01_009": "change_rate",        # 前年変動率(%)
    "L01_024": "current_use",        # 利用の現況
    "L01_029": "nearest_station",    # 最寄駅名
    "L01_030": "station_distance",   # 駅距離(m) → 実際は3桁コード
    "L01_027": "floor_area_ratio",   # 容積率
    "L01_057": "building_coverage",  # 建蔽率(%)
    "L01_058": "floor_area_ratio_pct", # 容積率(%)
}


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分の地価公示データを処理。"""
    raw_dir = RAW_DIR / "L01" / f"{pref_code:02d}"
    if not raw_dir.exists():
        return pd.DataFrame()

    try:
        records = read_shapefile_records(raw_dir, encoding="cp932")
    except Exception as e:
        logger.error(f"  Error reading L01 for pref {pref_code:02d}: {e}")
        return pd.DataFrame()

    rows = []
    for rec in records:
        if "_lon" not in rec or "_lat" not in rec:
            continue

        row = {
            "pref_code": f"{pref_code:02d}",
            "lon": rec["_lon"],
            "lat": rec["_lat"],
        }

        # 市区町村コードを標準地コードから抽出（先頭5桁）
        std_code = str(rec.get("L01_001", ""))
        if len(std_code) >= 5:
            row["muni_code"] = std_code[:5]
        else:
            row["muni_code"] = ""

        for src_field, dest_field in FIELD_MAP.items():
            val = rec.get(src_field)
            if val is not None and val != "":
                row[dest_field] = val

        # 数値変換
        for num_field in ["price_per_m2", "change_rate", "building_coverage",
                          "floor_area_ratio", "station_distance"]:
            if num_field in row:
                try:
                    row[num_field] = float(row[num_field])
                except (ValueError, TypeError):
                    row[num_field] = None

        rows.append(row)

    return pd.DataFrame(rows) if rows else pd.DataFrame()


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県の地価公示データを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing L01 pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
