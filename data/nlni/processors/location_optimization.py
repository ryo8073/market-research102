"""立地適正化計画区域プロセッサ (A35)。

居住誘導区域・都市機能誘導区域のポリゴンデータを市区町村別に集約。

出力CSV: location_optimization.csv
  pref_code, muni_code, has_plan, area_type, area_ha
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

OUTPUT_CSV = "location_optimization.csv"

# A35 区域種別
AREA_TYPES = {
    "1": "都市機能誘導区域",
    "2": "居住誘導区域",
    "3": "居住調整区域",
}


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分の立地適正化計画データを処理。"""
    # A50 データは自治体別GeoJSON
    raw_dir = RAW_DIR / "A50" / f"{pref_code:02d}"
    if not raw_dir.exists():
        # レガシーA35もチェック
        raw_dir = RAW_DIR / "A35" / f"{pref_code:02d}"
        if not raw_dir.exists():
            return pd.DataFrame()

    # GeoJSONファイルを探す（A50は自治体別に複数ファイル）
    import json
    geojson_files = list(raw_dir.rglob("*.geojson"))
    records = []

    if geojson_files:
        for gf in geojson_files:
            try:
                with open(gf, encoding="utf-8") as f:
                    data = json.load(f)
                for feat in data.get("features", []):
                    props = feat.get("properties", {})
                    records.append(props)
            except Exception:
                continue
    else:
        # Shapefile フォールバック
        try:
            records = read_shapefile_records(raw_dir, encoding="cp932")
        except Exception as e:
            logger.error(f"  Error reading location_opt for pref {pref_code:02d}: {e}")
            return pd.DataFrame()

    rows = []
    for rec in records:
        # A50: A50_003=市区町村コード, A50_006=区域種別
        # A35: A35b_003=市区町村コード, A35b_004=区域種別
        muni_code = str(rec.get("A50_003", rec.get("A35b_003",
                        rec.get("A35_003", rec.get("A35b_002", ""))))).zfill(5)
        area_type_code = str(rec.get("A50_006", rec.get("A35b_004",
                            rec.get("A35_004", ""))))
        area_type = AREA_TYPES.get(area_type_code, f"type_{area_type_code}")

        rows.append({
            "pref_code": f"{pref_code:02d}",
            "muni_code": muni_code,
            "has_plan": True,
            "area_type": area_type,
        })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    # 市区町村×区域種別でユニーク化
    return df.groupby(["pref_code", "muni_code", "area_type"], as_index=False).agg(
        has_plan=("has_plan", "first"),
        num_zones=("has_plan", "count"),
    )


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県の立地適正化計画データを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing A35 pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
