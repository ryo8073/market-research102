"""道路ネットワークプロセッサ (N01)。

道路ラインデータを市区町村別に集約。
将来のDriving Distance分析の基盤データ。

出力CSV: roads_by_muni.csv
  pref_code, muni_code, total_road_segments, road_class_counts
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

OUTPUT_CSV = "roads_by_muni.csv"

# 道路種別コード
ROAD_CLASSES = {
    "1": "高速自動車国道",
    "2": "都市高速道路",
    "3": "一般国道",
    "4": "主要地方道（都道府県道）",
    "5": "一般都道府県道",
    "6": "指定市の市道",
    "7": "その他",
}


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分の道路データを処理。"""
    raw_dir = RAW_DIR / "N01" / f"{pref_code:02d}"
    if not raw_dir.exists():
        return pd.DataFrame()

    try:
        records = read_shapefile_records(raw_dir, encoding="cp932")
    except Exception as e:
        logger.error(f"  Error reading N01 for pref {pref_code:02d}: {e}")
        return pd.DataFrame()

    # 道路種別ごとのセグメント数を県レベルで集計
    class_counts: dict[str, int] = {}
    total_segments = len(records)

    for rec in records:
        road_class = str(rec.get("N01_002", rec.get("N01_001", "7")))
        class_name = ROAD_CLASSES.get(road_class, "その他")
        class_counts[class_name] = class_counts.get(class_name, 0) + 1

    rows = [{
        "pref_code": f"{pref_code:02d}",
        "total_road_segments": total_segments,
        "highway": class_counts.get("高速自動車国道", 0),
        "urban_express": class_counts.get("都市高速道路", 0),
        "national_route": class_counts.get("一般国道", 0),
        "prefectural_major": class_counts.get("主要地方道（都道府県道）", 0),
        "prefectural_general": class_counts.get("一般都道府県道", 0),
        "city_road": class_counts.get("指定市の市道", 0),
        "other_road": class_counts.get("その他", 0),
    }]

    return pd.DataFrame(rows)


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県の道路データを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing N01 pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
