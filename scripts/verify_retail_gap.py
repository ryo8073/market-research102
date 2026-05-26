"""小売ギャップ分析のデータ検証。

仮説: retail_sales キャッシュには卸売（50-55）と小売（56-61）の両方が
含まれており、ギャップ分析の供給側に卸売が混入している可能性がある。
卸売販売額は小売販売額の数倍規模のため、供給側を過大に見せている恐れ。
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from data.census_cache import (
    DS_RETAIL_SALES,
    DS_POPULATION,
    load_cached_dataset,
    get_area_retail_sales,
    get_area_population,
)
from data_sources import MarketDataAccessor

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def main():
    df = load_cached_dataset(CACHE_DIR, DS_RETAIL_SALES.csv_name)
    nat = df[df["area_code"] == "00000"].copy()
    nat["code_str"] = nat["category_code"].astype(str)
    nat["major"] = nat["code_str"].str[:2]
    nat["code_len"] = nat["code_str"].str.len()

    # 中分類のみ（2桁）
    mid = nat[nat["code_len"] == 2].copy()
    ws = mid[mid["major"].isin(["50", "51", "52", "53", "54", "55"])]["sales"].sum()
    rt = mid[mid["major"].isin(["56", "57", "58", "59", "60", "61"])]["sales"].sum()

    print("=== 卸売 vs 小売の規模（全国, 中分類, 単位=万円） ===")
    print(f"  卸売業合計（50-55）: {ws:>15,.0f} 万円 = {ws/1e8:>8,.1f} 兆円")
    print(f"  小売業合計（56-61）: {rt:>15,.0f} 万円 = {rt/1e8:>8,.1f} 兆円")
    print(f"  卸売/小売 比率: {ws/rt:.2f}倍")
    print()

    # 高松市の retail_sectors を実際の関数で取得
    print("=== retail_sectors() の出力（高松市） ===")
    acc = MarketDataAccessor()
    sectors, source = acc.retail_sectors(37, 37201)
    print(f"source: {source}")
    print(f"{'sector':50s} {'demand(万円)':>15s} {'supply(万円)':>15s} {'gap':>15s}")
    for s in sorted(sectors, key=lambda x: -x["supply"]):
        print(f"  {s['sector']:50s} {s['demand']:>15,.0f} {s['supply']:>15,.0f} {s['demand']-s['supply']:>15,.0f}")
    print()

    total_d = sum(s["demand"] for s in sectors)
    total_s = sum(s["supply"] for s in sectors)
    print(f"  合計 demand = {total_d:,.0f} / supply = {total_s:,.0f}")
    print()
    print("  問題: demand は『全国小売販売額/全国人口 × 地域人口』なので小売需要のみ")
    print("        supply は『地域の小売販売額』だが、卸売+小売+細分が混在")
    print("        分母分子は同じカテゴリ集合（全国も地域も同じ列）なので係数は打ち消しあう")
    print()

    print("=== カテゴリの粒度（細分の重複問題） ===")
    high = df[df["area_code"] == "37201"].copy()
    high["code_str"] = high["category_code"].astype(str)
    high["code_len"] = high["code_str"].str.len()
    print(high.groupby("code_len").size().to_string())
    print()
    print("→ 2桁(中分類)と3桁(小分類)が両方含まれる場合、合計に二重計上が発生")
    print("→ Gwinnett例のCI102 Gap分析は『NAICS 4桁』レベルで一意の業種を扱う")

    # 二重計上チェック: 中分類 vs 小分類の合計
    mid_h = high[high["code_len"] == 2]["sales"].sum()
    sub_h = high[high["code_len"] == 3]["sales"].sum()
    print(f"  高松市: 中分類合計={mid_h:,.0f}  小分類合計={sub_h:,.0f}  合計={mid_h+sub_h:,.0f}")


if __name__ == "__main__":
    main()
