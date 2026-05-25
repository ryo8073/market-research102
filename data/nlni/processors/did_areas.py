"""人口集中地区 (DID) プロセッサ (A16)。

DIDポリゴンを市区町村境界と重ね合わせ、DID面積・人口を集約。

出力CSV: did_by_muni.csv
  pref_code, muni_code, did_area_ha, did_population, did_density
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

OUTPUT_CSV = "did_by_muni.csv"


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分のDIDデータを処理。"""
    raw_dir = RAW_DIR / "A16" / f"{pref_code:02d}"
    if not raw_dir.exists():
        return pd.DataFrame()

    try:
        records = read_shapefile_records(raw_dir, encoding="cp932")
    except Exception as e:
        logger.error(f"  Error reading A16 for pref {pref_code:02d}: {e}")
        return pd.DataFrame()

    rows = []
    for rec in records:
        # DIDデータの市区町村コード — A16_002が5桁コード
        muni_code = str(rec.get("A16_002", rec.get("A16_001", ""))).zfill(5)
        # A16_001は7桁（市区町村コード+DID番号）の場合があるので先頭5桁に
        if len(muni_code) > 5:
            muni_code = muni_code[:5]
        if not muni_code or muni_code == "00000":
            continue

        # DID面積（ha）= A16_006, DID人口 = A16_005
        area_ha = rec.get("A16_006", rec.get("A16_003", rec.get("AREA", 0)))
        population = rec.get("A16_005", rec.get("A16_002", rec.get("JINKO", 0)))

        try:
            area_ha = float(area_ha) if area_ha else 0
        except (ValueError, TypeError):
            area_ha = 0
        try:
            population = int(float(population)) if population else 0
        except (ValueError, TypeError):
            population = 0

        rows.append({
            "pref_code": f"{pref_code:02d}",
            "muni_code": muni_code,
            "did_area_ha": area_ha,
            "did_population": population,
        })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    # 市区町村別に集約（複数DIDが1自治体内にある場合）
    agg = df.groupby(["pref_code", "muni_code"], as_index=False).agg({
        "did_area_ha": "sum",
        "did_population": "sum",
    })
    agg["did_density"] = agg.apply(
        lambda r: round(r["did_population"] / r["did_area_ha"], 1)
        if r["did_area_ha"] > 0 else 0, axis=1
    )
    return agg


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県のDIDデータを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing A16 pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
