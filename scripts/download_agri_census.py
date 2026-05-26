"""農林業センサス2020 都道府県別 基幹的農業従事者数を取得し、
   経済センサスの市区町村別構成比で按分配分する。

背景:
   経済センサス(0004005684 民営事業所)では農業従業者は約36万人だが、
   農林業センサスでは個人経営含めて約136万人（4倍）。地方都市の
   基盤雇用を正確に算出するため、農林業センサスのデータで補完する。

データソース:
   - 都道府県別総数: e-Stat 0001938798（2020年農林業センサス）
   - 市区町村への按分: 経済センサス中分類農業データの県内構成比

出力: data/cache/agri_workers_2020.csv
   columns: area_code, area_name, pref_code, total_workers (推計値含む)
"""
from __future__ import annotations

import io
import os
import sys
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.census_cache import DS_EMPLOYMENT_MID, load_cached_dataset

load_dotenv()
ESTAT_KEY = os.environ.get("ESTAT_APP_ID")
CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"

# 農林業センサス2020 都道府県別 基幹的農業従事者数
# 0001938798: 農業経営体(個人経営体) 主副業別統計 (11) 年齢階層別の基幹的農業従事者数
AGRI_CENSUS_TABLE = "0001938798"

# 上記テーブルの cat02 地域コード → 都道府県コード（JIS X 0401）マッピング
# 020が北海道（重複010）、021〜067 が47都道府県順
REGION_TO_PREF_CODE: dict[str, int] = {
    "020": 1,  "021": 2,  "022": 3,  "023": 4,  "024": 5,
    "025": 6,  "026": 7,  "027": 8,  "028": 9,  "029": 10,
    "030": 11, "031": 12, "032": 13, "033": 14, "034": 15,
    "035": 16, "036": 17, "037": 18, "038": 19, "039": 20,
    "040": 21, "041": 22, "042": 23, "043": 24, "044": 25,
    "045": 26, "046": 27, "047": 28, "048": 29, "049": 30,
    "050": 31, "051": 32, "052": 33, "053": 34, "054": 35,
    "055": 36, "056": 37, "057": 38, "058": 39, "059": 40,
    "060": 41, "061": 42, "062": 43, "063": 44, "064": 45,
    "065": 46, "066": 47,
}


def fetch_prefecture_agri_workers() -> dict[int, int]:
    """都道府県別の基幹的農業従事者総数を取得。

    Returns
    -------
    dict[int, int]: {pref_code: total_workers}
    """
    print("Fetching prefecture-level agriculture census data from e-Stat...")
    r = requests.get(
        "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData",
        params={
            "appId": ESTAT_KEY,
            "statsDataId": AGRI_CENSUS_TABLE,
            "cdCat01": "001",  # 主副業別: 計
            "cdCat03": "001",  # 男女年齢別: 男女計_計
            "limit": 100,
            "lang": "J",
        },
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    values = (
        data.get("GET_STATS_DATA", {}).get("STATISTICAL_DATA", {})
        .get("DATA_INF", {}).get("VALUE", [])
    )

    result: dict[int, int] = {}
    for v in values:
        region_code = v.get("@cat02", "")
        pref_code = REGION_TO_PREF_CODE.get(region_code)
        if pref_code is None:
            continue
        val_str = str(v.get("$", "0"))
        try:
            val = int(val_str.replace(",", ""))
        except ValueError:
            continue
        result[pref_code] = val
    return result


def allocate_to_municipalities(pref_totals: dict[int, int]) -> pd.DataFrame:
    """都道府県別総数を経済センサス農業従業者の構成比で市区町村に按分。

    各市区町村の取り分 = 県総数 × (市区町村の経済センサス農業従業者 / 県内合計)

    経済センサス農業従業者がゼロの市区町村にも按分するため、
    ベースとして市区町村の人口比または面積比を使うか検討。
    現状は経済センサス農業従業者がある市区町村のみに按分し、ゼロの
    市区町村は『農林業センサスデータなし』とする（保守的）。

    Returns
    -------
    pd.DataFrame: area_code, area_name, pref_code, agri_workers_allocated
    """
    df_mid = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
    if df_mid is None:
        raise RuntimeError("中分類キャッシュなし。先に rebuild_mid_class_cache.py を実行してください。")

    # 経済センサス 農業(01) のみ抽出
    df_agri_eco = df_mid[df_mid["category_code"] == "01"].copy()
    df_agri_eco["pref_code"] = df_agri_eco["area_code"].str[:2].astype(int)

    # 県内合計（市区町村のみ、県全体行は除外）
    df_munis = df_agri_eco[
        ~df_agri_eco["area_code"].str.endswith("000")
        & (df_agri_eco["area_code"] != "00000")
    ].copy()
    pref_sums = df_munis.groupby("pref_code")["employees"].sum().to_dict()

    # 按分
    rows = []
    for _, r in df_munis.iterrows():
        pc = r["pref_code"]
        pref_total = pref_totals.get(pc, 0)
        pref_eco_sum = pref_sums.get(pc, 0)
        if pref_eco_sum > 0 and r["employees"] > 0:
            allocated = pref_total * (r["employees"] / pref_eco_sum)
        else:
            allocated = 0
        rows.append({
            "area_code": r["area_code"],
            "area_name": r["area_name"],
            "pref_code": pc,
            "eco_agri_workers": int(r["employees"]),
            "agri_census_total_pref": pref_total,
            "agri_census_allocated": round(allocated, 0),
        })

    # 県全体行も追加（全国0000は除く）
    for pc, total in pref_totals.items():
        rows.append({
            "area_code": f"{pc:02d}000",
            "area_name": f"(県全体) pref_code={pc}",
            "pref_code": pc,
            "eco_agri_workers": int(pref_sums.get(pc, 0)),
            "agri_census_total_pref": total,
            "agri_census_allocated": total,
        })

    df_out = pd.DataFrame(rows).sort_values(["pref_code", "area_code"]).reset_index(drop=True)
    return df_out


def main():
    if not ESTAT_KEY:
        print("ESTAT_APP_ID 未設定")
        return

    pref_totals = fetch_prefecture_agri_workers()
    print(f"取得済み: {len(pref_totals)} 都道府県")
    print(f"全国合計（民営+個人含む）: {sum(pref_totals.values()):,} 人")
    print(f"  参考: 経済センサス民営事業所 農業 = 359,300 人")
    print(f"  比率: {sum(pref_totals.values()) / 359_300:.2f}倍")
    print()

    df = allocate_to_municipalities(pref_totals)
    print(f"市区町村按分: {len(df)} 行")

    out_path = CACHE_DIR / "agri_workers_2020.csv"
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"保存: {out_path} ({out_path.stat().st_size/1024:.1f} KB)")

    # サンプル: 農業県の市区町村トップ10
    print()
    print("=== サンプル: 鹿児島県の市区町村別 農林業センサス按分結果 ===")
    sample = df[df["pref_code"] == 46].nlargest(10, "agri_census_allocated")
    print(sample[["area_code", "area_name", "eco_agri_workers", "agri_census_allocated"]].to_string(index=False))


if __name__ == "__main__":
    main()
