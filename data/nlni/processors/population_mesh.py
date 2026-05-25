"""メッシュ別将来推計人口プロセッサ。

1kmメッシュShapefileを読み取り、市区町村別に将来人口を集約。
推計年: 2020, 2025, 2030, 2035, 2040, 2045, 2050

出力CSV: mesh_pop_projection.csv
  pref_code, muni_code, muni_name, year, population, pop_under15, pop_15_64, pop_65_over
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from data.nlni.downloader import (
    RAW_DIR, read_shapefile_records, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

OUTPUT_CSV = "mesh_pop_projection.csv"

# メッシュShapefileのフィールド名マッピング（H30推計版）
# PTN_20XX = 推計年の総人口
# R6推計版フィールド名（2025-2070年、5年ごと）
# PTN_YYYY = 総人口, PTA_YYYY = 0-14歳, PTB_YYYY = 15-64歳, PTE_YYYY = 65歳以上
YEAR_FIELDS = {
    2020: "PTN_2020",
    2025: "PTN_2025",
    2030: "PTN_2030",
    2035: "PTN_2035",
    2040: "PTN_2040",
    2045: "PTN_2045",
    2050: "PTN_2050",
    2055: "PTN_2055",
    2060: "PTN_2060",
    2065: "PTN_2065",
    2070: "PTN_2070",
}

# 年齢3区分: 0-14(PTA), 15-64(PTB), 65+(PTE)
AGE_GROUP_FIELDS = {
    2020: {"under15": "PTA_2020", "working": "PTB_2020", "elderly": "PTE_2020"},
    2025: {"under15": "PTA_2025", "working": "PTB_2025", "elderly": "PTE_2025"},
    2030: {"under15": "PTA_2030", "working": "PTB_2030", "elderly": "PTE_2030"},
    2040: {"under15": "PTA_2040", "working": "PTB_2040", "elderly": "PTE_2040"},
    2050: {"under15": "PTA_2050", "working": "PTB_2050", "elderly": "PTE_2050"},
}


def _extract_muni_code_from_mesh(mesh_id: str) -> str | None:
    """メッシュIDに付随するSHICODE（市区町村コード）を使う。"""
    # メッシュデータにはSHICODE列がある
    return None  # SHICODEフィールドで直接取得


def process_prefecture(pref_code: int) -> pd.DataFrame:
    """1県分のメッシュ人口データを処理。"""
    raw_dir = RAW_DIR / "mesh_pop" / f"{pref_code:02d}"
    if not raw_dir.exists():
        logger.warning(f"  No mesh_pop data for pref {pref_code:02d}")
        return pd.DataFrame()

    try:
        records = read_shapefile_records(raw_dir, encoding="utf-8")
    except Exception as e:
        logger.error(f"  Error reading mesh_pop for pref {pref_code:02d}: {e}")
        return pd.DataFrame()

    rows = []
    for rec in records:
        # SHICODE: R6版は5桁市区町村コード（文字列で格納）
        raw_code = str(rec.get("SHICODE", "")).strip()
        muni_code = raw_code.zfill(5) if raw_code else ""
        if not muni_code or muni_code == "00000":
            continue

        for year, field in YEAR_FIELDS.items():
            pop = rec.get(field)
            if pop is None or pop == "" or pop == "-":
                continue
            try:
                pop_val = int(float(pop))
            except (ValueError, TypeError):
                continue

            row = {
                "pref_code": f"{pref_code:02d}",
                "muni_code": muni_code,
                "year": year,
                "population": pop_val,
            }

            # 年齢3区分（一部の年のみ）
            if year in AGE_GROUP_FIELDS:
                age_fields = AGE_GROUP_FIELDS[year]
                for key, field_name in age_fields.items():
                    val = rec.get(field_name)
                    if val is not None and val != "" and val != "-":
                        try:
                            row[key] = int(float(val))
                        except (ValueError, TypeError):
                            pass

            rows.append(row)

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    # メッシュ単位→市区町村単位に集約
    group_cols = ["pref_code", "muni_code", "year"]
    agg_dict = {"population": "sum"}
    for col in ["under15", "working", "elderly"]:
        if col in df.columns:
            agg_dict[col] = "sum"

    return df.groupby(group_cols, as_index=False).agg(agg_dict)


def process_all(pref_codes: list[int] | None = None) -> pd.DataFrame:
    """全県のメッシュ人口データを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    codes = pref_codes or list(range(1, 48))
    all_dfs = []
    for pc in codes:
        logger.info(f"Processing mesh_pop pref {pc:02d}...")
        df = process_prefecture(pc)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        return pd.DataFrame()

    result = pd.concat(all_dfs, ignore_index=True)
    save_cached_csv(result, OUTPUT_CSV)
    return result
