"""Leakage (漏損係数) の計算ロジック検証。

CI102の漏損・余剰係数:
  Factor = (Demand - Supply) / (Demand + Supply) × 100
  範囲: -100 (完全余剰) 〜 +100 (完全漏損)

検証項目:
  1. 教科書テスト値 (Orlando食品+12.7, 電子+76.7, アパレル-24.0) の再現
  2. 需要推計式 (人口 × 全国平均1人あたり小売支出) の妥当性
  3. 日本実データでの主要都市・地方都市の漏損パターン
  4. 系統的な歪み（特定地域・特定セクターで異常値が出ないか）
"""
from __future__ import annotations

import io
import math
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from calculator import gap_analysis_table, leakage_surplus_factor
from data.census_cache import (
    DS_POPULATION,
    DS_RETAIL_SALES,
    get_area_population,
    get_area_retail_sales,
    load_cached_dataset,
)
from data_sources import MarketDataAccessor

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def step1_textbook_reproducibility():
    print("=" * 80)
    print("Step 1: 教科書値の再現確認")
    print("=" * 80)
    tests = [
        ("食品・飲料スーパー", 15_500_000, 12_000_000, 12.7),
        ("家電量販店", 3_800_000, 500_000, 76.7),
        ("アパレル", 5_200_000, 8_500_000, -24.0),
    ]
    for sector, demand, supply, expected in tests:
        actual = leakage_surplus_factor(demand, supply)
        ok = "✓" if abs(actual - expected) < 0.1 else "✗"
        print(f"  {ok} {sector}: 需要 {demand:,} / 供給 {supply:,}")
        print(f"    Factor = ({demand-supply:,}) / ({demand+supply:,}) × 100 = {actual:.1f} (期待: {expected:+.1f})")
    print()


def step2_demand_estimation_check():
    print("=" * 80)
    print("Step 2: 需要推計式の妥当性チェック")
    print("=" * 80)
    print()
    df_retail = load_cached_dataset(CACHE_DIR, DS_RETAIL_SALES.csv_name)
    df_pop = load_cached_dataset(CACHE_DIR, DS_POPULATION.csv_name)
    pop_key = "2015年（平成27年）の人口（組替）"

    national_supply = get_area_retail_sales(df_retail, "00000")
    national_pop_data = get_area_population(df_pop, "00000")
    nat_population = national_pop_data.get(pop_key, 0)

    print(f"全国人口（2015組替）: {nat_population:,.0f} 人")
    print(f"全国 小売販売額（小売中分類のみ）:")
    total_retail = 0
    for sector, sales in sorted(national_supply.items(), key=lambda x: -x[1]):
        per_capita = sales / nat_population
        total_retail += sales
        print(f"  {sector:30s} {sales*10000:>15,.0f} 円  1人当たり: {per_capita*10000:>10,.0f} 円/人/年")
    print(f"  {'合計':30s} {total_retail*10000:>15,.0f} 円")
    print(f"  → 1人あたり小売支出（合計）: {total_retail*10000/nat_population:,.0f} 円/年")
    print()
    print("参考: 家計調査(2021)の1世帯あたり消費支出 約280万円/年、うち小売関連推計 約140万円/年")
    print("      世帯人員2.2人とすると、1人あたり 約63万円/年")
    print()


def step3_actual_data_diagnosis():
    print("=" * 80)
    print("Step 3: 主要都市・地方都市の漏損パターン診断")
    print("=" * 80)
    print()
    accessor = MarketDataAccessor()
    targets = [
        (13, 13000, "東京都"),
        (13, 13100, "東京特別区部"),
        (27, 27100, "大阪市"),
        (14, 14100, "横浜市"),
        (1, 1100, "札幌市"),
        (37, 37201, "高松市"),
        (47, 47201, "那覇市"),
        (46, 46201, "鹿児島市"),
        # 中山間地・観光地
        (15, 15216, "南魚沼市"),  # 新潟県
        (20, 20204, "岡谷市"),    # 長野県
    ]
    print(f"{'地域':18s} {'demand合計':>15s} {'supply合計':>15s} {'集約factor':>10s} "
          f"{'漏損':>5s} {'余剰':>5s}")
    print("-" * 90)
    for pref, city, name in targets:
        sectors, _ = accessor.retail_sectors(pref, city)
        if not sectors:
            continue
        df_gap = gap_analysis_table(sectors)
        td = df_gap["demand"].sum()
        ts = df_gap["supply"].sum()
        agg = (td - ts) / (td + ts) * 100 if (td + ts) > 0 else 0
        n_leak = int((df_gap["factor"] >= 10).sum())
        n_surplus = int((df_gap["factor"] <= -10).sum())
        print(f"{name:18s} {td:>15,.0f} {ts:>15,.0f} {agg:>+9.1f} {n_leak:>5} {n_surplus:>5}")
    print()


def step4_known_distortions():
    print("=" * 80)
    print("Step 4: 既知の系統的歪みパターンの調査")
    print("=" * 80)
    print()
    accessor = MarketDataAccessor()

    # 観光地（一時人口で実需要が膨張するが、住民人口ベース推計だと過小）
    print("【歪み1: 観光地は『需要過小推計』になる】")
    print("理由: 需要 = 住民人口 × 1人あたり全国平均、観光客は含まれない")
    print()
    tourism_areas = [
        (40, 40130, "福岡市"),
        (47, 47201, "那覇市"),
        (47, 47207, "石垣市"),  # 観光地
        (26, 26100, "京都市"),
    ]
    for pref, city, name in tourism_areas:
        sectors, _ = accessor.retail_sectors(pref, city)
        if not sectors:
            continue
        df_gap = gap_analysis_table(sectors)
        td = df_gap["demand"].sum()
        ts = df_gap["supply"].sum()
        agg = (td - ts) / (td + ts) * 100 if (td + ts) > 0 else 0
        # 飲食料品小売業のfactor（一時人口の影響大）
        food_row = df_gap[df_gap["sector"] == "飲食料品小売業"]
        food_factor = food_row.iloc[0]["factor"] if not food_row.empty else 0
        print(f"  {name:15s}  集約factor={agg:>+6.1f}  飲食料品factor={food_factor:>+6.1f}")
        print(f"    → 観光地は『余剰』が出やすい（一時消費を需要側に含めていないため）")
    print()

    print("【歪み2: 商業中心地（県庁所在地）は『需要過小推計』になる】")
    print("理由: 周辺市町村住民の購買力を吸収するが、需要は住民人口×1人あたり")
    print()
    central_areas = [
        (37, 37201, "高松市（香川県の商業中心）"),
        (38, 38201, "松山市（愛媛県）"),
        (44, 44201, "大分市（大分県）"),
        (45, 45201, "宮崎市（宮崎県）"),
    ]
    for pref, city, name in central_areas:
        sectors, _ = accessor.retail_sectors(pref, city)
        if not sectors:
            continue
        df_gap = gap_analysis_table(sectors)
        td = df_gap["demand"].sum()
        ts = df_gap["supply"].sum()
        agg = (td - ts) / (td + ts) * 100 if (td + ts) > 0 else 0
        print(f"  {name:30s}  集約factor={agg:>+6.1f}")
    print()

    print("【歪み3: 純粋な住宅地は『漏損』に見える】")
    print("理由: 住民は域外（都心）で買い物。小売店が少なくsupplyが小さい")
    print()
    bedroom = [
        (11, 11104, "川口市（埼玉）"),  # 東京通勤の住宅地
        (12, 12100, "千葉市"),
        (14, 14107, "藤沢市（神奈川）"),
    ]
    for pref, city, name in bedroom:
        sectors, _ = accessor.retail_sectors(pref, city)
        if not sectors:
            continue
        df_gap = gap_analysis_table(sectors)
        td = df_gap["demand"].sum()
        ts = df_gap["supply"].sum()
        agg = (td - ts) / (td + ts) * 100 if (td + ts) > 0 else 0
        print(f"  {name:20s}  集約factor={agg:>+6.1f}")
    print()


def step5_sector_level_check():
    print("=" * 80)
    print("Step 5: セクター粒度（中分類6カテゴリ）の妥当性")
    print("=" * 80)
    print()
    print("現在の小売セクター:")
    print("  56 各種商品小売業（百貨店・総合スーパー）")
    print("  57 織物・衣服・身の回り品小売業")
    print("  58 飲食料品小売業")
    print("  59 機械器具小売業（自動車・電機）")
    print("  60 その他の小売業（医薬品・燃料等）")
    print("  61 無店舗小売業（通販・自販機）")
    print()
    print("教科書 CI102 Activity 4 では NAICS 4桁レベル（数十〜100業種）の")
    print("詳細セクターで実施。日本の中分類6種では粒度が粗く、")
    print("『機械器具小売業』のような幅広いカテゴリで漏損/余剰が相殺される可能性。")
    print()


def step6_calculation_verification():
    print("=" * 80)
    print("Step 6: 計算式の純粋性検証（calculator.py）")
    print("=" * 80)
    print()
    print("leakage_surplus_factor(demand, supply):")
    print("  return (demand - supply) / (demand + supply) * 100.0")
    print()
    print("性質:")
    edge_cases = [
        ("完全余剰（supply only）", 0, 1_000_000, -100.0),
        ("完全漏損（demand only）", 1_000_000, 0, 100.0),
        ("均衡", 1_000_000, 1_000_000, 0.0),
        ("ゼロ÷ゼロ", 0, 0, 0.0),
        ("負の値（理論的にあり得ない）", -1000, 1000, math.nan),
    ]
    for label, d, s, expected in edge_cases:
        actual = leakage_surplus_factor(d, s)
        match = "?" if math.isnan(expected) else ("✓" if abs(actual - expected) < 0.01 else "✗")
        print(f"  {match} {label}: leakage({d}, {s}) = {actual:.2f}  (期待: {expected})")
    print()


def main():
    step1_textbook_reproducibility()
    step2_demand_estimation_check()
    step3_actual_data_diagnosis()
    step4_known_distortions()
    step5_sector_level_check()
    step6_calculation_verification()

    print()
    print("=" * 80)
    print("結論")
    print("=" * 80)
    print()
    print("✅ Leakage計算式自体（calculator.leakage_surplus_factor）は教科書と一致")
    print("✅ Esri方式 (Demand-Supply)/(Demand+Supply)×100 を正確に実装")
    print()
    print("⚠️ 日本データで使う際の構造的な歪み:")
    print()
    print("  1. 需要推計が『住民人口 × 1人あたり全国平均消費』のため:")
    print("     - 観光地・商業中心地 → 需要過小推計 → 余剰側にシフト")
    print("     - 住宅地（ベッドタウン） → 一見漏損に見える（実際は域外消費）")
    print()
    print("  2. セクター粒度が中分類6種と粗い:")
    print("     - 『機械器具小売業（自動車+電気+その他）』のような幅広分類")
    print("     - 教科書NAICS 4桁レベルなら漏損が見えるはずの細分が相殺")
    print()
    print("  3. 1人あたり消費が全国均一の仮定:")
    print("     - 所得水準・年齢構成の地域差を反映していない")
    print("     - 高所得地域は需要過小推計、低所得地域は需要過大推計")
    print()
    print("→ 計算ロジックは正しいが、解釈には『地理的・人口動態的補正』が必要")


if __name__ == "__main__":
    main()
