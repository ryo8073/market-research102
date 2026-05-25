"""用途地域プロセッサ (A29)。

13種の用途地域ポリゴンを市区町村単位に面積集約。

出力CSV: zoning_by_muni.csv
  pref_code, muni_code, zone_code, zone_name, area_ha, coverage_ratio, floor_area_ratio
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

OUTPUT_CSV = "zoning_by_muni.csv"

# 用途地域コード→名称マッピング
ZONE_NAMES = {
    "1": "第一種低層住居専用地域",
    "2": "第二種低層住居専用地域",
    "3": "第一種中高層住居専用地域",
    "4": "第二種中高層住居専用地域",
    "5": "第一種住居地域",
    "6": "第二種住居地域",
    "7": "準住居地域",
    "8": "近隣商業地域",
    "9": "商業地域",
    "10": "準工業地域",
    "11": "工業地域",
    "12": "工業専用地域",
    "13": "田園住居地域",
}


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分の用途地域データを処理。"""
    raw_dir = RAW_DIR / "A29" / f"{pref_code:02d}"
    if not raw_dir.exists():
        return pd.DataFrame()

    try:
        records = read_shapefile_records(raw_dir, encoding="cp932")
    except Exception as e:
        logger.error(f"  Error reading A29 for pref {pref_code:02d}: {e}")
        return pd.DataFrame()

    rows = []
    for rec in records:
        # 市区町村コード
        muni_code = str(rec.get("A29_003", rec.get("A29_002", ""))).zfill(5)
        zone_code = str(rec.get("A29_004", rec.get("A29_003", "")))
        zone_name = rec.get("A29_005", rec.get("A29_004", ""))
        if not zone_name:
            zone_name = ZONE_NAMES.get(zone_code, f"zone_{zone_code}")

        coverage = rec.get("A29_006", rec.get("A29_005", None))
        far = rec.get("A29_007", rec.get("A29_006", None))

        try:
            coverage = float(coverage) if coverage else None
        except (ValueError, TypeError):
            coverage = None
        try:
            far = float(far) if far else None
        except (ValueError, TypeError):
            far = None

        rows.append({
            "pref_code": f"{pref_code:02d}",
            "muni_code": muni_code,
            "zone_code": zone_code,
            "zone_name": zone_name,
            "coverage_ratio": coverage,
            "floor_area_ratio": far,
        })

    return pd.DataFrame(rows) if rows else pd.DataFrame()


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県の用途地域データを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing A29 pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
