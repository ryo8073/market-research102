"""市区町村×業種マトリクスをフラットJSONで出力。
カスタム経済圏（複数市区町村合算）でブラウザ側計算するためのデータ層。

出力: ci102-nextjs/public/data/muni_industry_matrix.json
形式: { area_code: { area_name, pref_code, employment: { industry_name: count, ... } } }

サイズ目安: 大分類17業種 × 1,918市区町村 ≈ 32K entries ≈ 400-600KB (圧縮前)
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
    DS_EMPLOYMENT_MAJOR,
    get_area_employment,
    get_national_employment,
    load_cached_dataset,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"
OUTPUT = Path(__file__).resolve().parents[1] / "ci102-nextjs" / "public" / "data" / "muni_industry_matrix.json"


def main():
    df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    if df is None:
        print("大分類キャッシュ未構築")
        return

    # 全市区町村（県全体は除外）
    cities_df = df[
        ~df["area_code"].str.endswith("000")
        & (df["area_code"] != "00000")
    ]
    matrix: dict[str, dict] = {}
    for area_code in sorted(cities_df["area_code"].unique()):
        rows = cities_df[cities_df["area_code"] == area_code]
        if rows.empty:
            continue
        area_name = rows.iloc[0]["area_name"]
        pref_code = int(area_code[:2])
        employment = {
            row["category_name"]: int(row["employees"])
            for _, row in rows.iterrows()
        }
        matrix[area_code] = {
            "area_name": area_name,
            "pref_code": pref_code,
            "employment": employment,
        }

    # 全国データを末尾に
    national_emp = get_national_employment(df)
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
    print(f"  ファイルサイズ: {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
