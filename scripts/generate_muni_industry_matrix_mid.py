"""市区町村×中分類95業種マトリクスをフラットJSONで出力。
カスタム経済圏（複数市区町村合算）でブラウザ側計算するためのデータ層。
中分類版 — EBMの精度が大分類17業種版より高い。

出力: ci102-nextjs/public/data/muni_industry_matrix_mid.json
形式: { area_code: { area_name, pref_code, employment: { industry_name: count, ... } } }

サイズ目安: 中分類95業種 × 1,918市区町村 ≈ 182K entries ≈ 3-7MB (圧縮前)
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.census_cache import (
    DS_EMPLOYMENT_MID,
    get_area_employment_mid,
    load_cached_dataset,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"
OUTPUT = Path(__file__).resolve().parents[1] / "ci102-nextjs" / "public" / "data" / "muni_industry_matrix_mid.json"


def main():
    df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
    if df is None:
        print("中分類キャッシュ未構築")
        return

    # 全市区町村（県全体は除外）
    cities_df = df[
        ~df["area_code"].str.endswith("000")
        & (df["area_code"] != "00000")
    ]
    matrix: dict[str, dict] = {}
    for area_code in sorted(cities_df["area_code"].unique()):
        emp = get_area_employment_mid(df, area_code)
        if not emp:
            continue
        rows = cities_df[cities_df["area_code"] == area_code]
        area_name = rows.iloc[0]["area_name"] if not rows.empty else area_code
        pref_code = int(area_code[:2])
        matrix[area_code] = {
            "area_name": area_name,
            "pref_code": pref_code,
            "employment": {k: int(v) for k, v in emp.items()},
        }

    # 全国データを末尾に
    national_emp = get_area_employment_mid(df, "00000")
    if national_emp:
        matrix["00000"] = {
            "area_name": "全国",
            "pref_code": 0,
            "employment": {k: int(v) for k, v in national_emp.items()},
        }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(matrix, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"出力: {OUTPUT}")
    print(f"  市区町村数: {len(matrix) - 1}")
    print(f"  業種数: {len(next(iter(matrix.values()))['employment'])} (中分類)")
    print(f"  ファイルサイズ: {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
