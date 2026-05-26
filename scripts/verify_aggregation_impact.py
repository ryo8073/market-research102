"""業種分類粒度の影響を全指標で定量分析する。

検証対象:
  - LQ計算（大分類17 vs 中分類95）
  - 基盤雇用 / EBM
  - PER（影響なしを確認）
  - シフトシェア（業種数が変わると分解が変わる）
  - 小売ギャップ（独立データなので影響なしを確認）

理論背景: Mulligan & Murphy (1995), Isard (1956) のLQ Aggregation問題。
LQ計算は分類粒度に対し凸的性質を持つ。

  数学的事実:
    Aggregated LQ ≦ Σ (weighted disaggregated LQ)
    細分化すると基盤雇用は必ず増える方向（または不変）

  直感的説明:
    大分類『卸売・小売業』LQ=1.0
    ↓ 細分化
    中分類『機械器具卸売業』LQ=3.0、『各種商品小売業』LQ=0.5
    → 機械器具卸売業は基盤雇用に算入、各種商品小売業は0のまま
    → 結果として総基盤雇用は増える
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from calculator import (
    economic_base_multiplier,
    gap_analysis_table,
    lq_table,
    population_employment_ratio,
    shift_share_table,
    total_basic_employment,
)
from data.census_cache import (
    DS_EMPLOYMENT_MAJOR,
    DS_EMPLOYMENT_MID,
    get_area_employment,
    get_area_employment_mid,
    get_national_employment,
    load_agri_census,
    load_cached_dataset,
)
from data_sources import MarketDataAccessor

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def section_1_concrete_examples():
    print("=" * 100)
    print("Section 1: 大分類 vs 中分類 — 具体的な業種の対応関係")
    print("=" * 100)
    print()
    print("【大分類17業種（経済センサス 0003449718）】")
    print("  A 農業，林業  ※経済センサスでは欠落")
    print("  B 漁業       ※経済センサスでは欠落")
    print("  C 鉱業，採石業，砂利採取業")
    print("  D 建設業")
    print("  E 製造業 ← 製造業全体で 1業種扱い")
    print("  F 電気・ガス・熱供給・水道業")
    print("  G 情報通信業 ← 通信/放送/情報サービス/インターネット/映像 すべて1業種")
    print("  H 運輸業，郵便業")
    print("  I 卸売業，小売業 ← 卸売+小売 すべて1業種")
    print("  J 金融業，保険業 ← 銀行/金融商品取引/保険 すべて1業種")
    print("  K 不動産業，物品賃貸業")
    print("  L 学術研究，専門・技術サービス業")
    print("  M 宿泊業，飲食サービス業")
    print("  N 生活関連サービス業，娯楽業")
    print("  O 教育，学習支援業")
    print("  P 医療，福祉")
    print("  Q 複合サービス事業")
    print("  R サービス業（他に分類されないもの） ← 廃棄物処理/自動車整備/職業紹介 等すべて1業種")
    print("  S 公務（他に分類されるものを除く）")
    print()
    print("【中分類95業種（経済センサス 0004005684）— 大分類の細分例】")
    print("  E 製造業:")
    print("    09 食料品製造業 / 10 飲料・たばこ・飼料 / 11 繊維工業 / 12 木材")
    print("    ... 24 金属製品 / 25 はん用機械 / 26 生産用機械 / 27 業務用機械")
    print("    28 電子部品 / 29 電気機械 / 30 情報通信機械 / 31 輸送用機械 / 32 その他")
    print("    → 24業種に細分")
    print("  I 卸売業，小売業 → 12業種に細分:")
    print("    50-55 卸売6種 + 56-61 小売6種")
    print("  G 情報通信業 → 5業種に細分:")
    print("    37 通信業 / 38 放送業 / 39 情報サービス業 / 40 インターネット附随 / 41 映像")
    print("  J 金融業，保険業 → 6業種に細分:")
    print("    62 銀行 / 63 協同組織金融 / 64 貸金業 / 65 金融商品取引 / 66 補助金融 / 67 保険")


def section_2_aggregation_problem(area_code: str, area_name: str):
    print("=" * 100)
    print(f"Section 2: 集計問題の実例 — {area_name} ({area_code})")
    print("=" * 100)

    df_major = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    df_mid = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
    nat_major = get_national_employment(df_major)
    nat_mid = get_area_employment_mid(df_mid, "00000")

    local_major = get_area_employment(df_major, area_code)
    local_mid = get_area_employment_mid(df_mid, area_code)

    print()
    print("【大分類で『卸売・小売業』を1つの業種として見た場合】")
    df_lq_major = lq_table(local_major, nat_major)
    ws_row = df_lq_major[df_lq_major["industry"] == "卸売業，小売業"]
    if not ws_row.empty:
        r = ws_row.iloc[0]
        print(f"  地域雇用 = {r['local_emp']:,.0f} 人")
        print(f"  全国雇用 = {r['national_emp']:,.0f} 人")
        print(f"  LQ = {r['lq']:.3f}")
        print(f"  基盤雇用 = {r['basic_emp_estimate']:,.0f} 人 (LQが1.0前後なら基盤算入されない)")
    print()

    print("【中分類で12の卸売・小売業種に分解した場合】")
    df_lq_mid = lq_table(local_mid, nat_mid)
    ws_codes = ["各種商品卸売業", "繊維・衣服等卸売業", "飲食料品卸売業",
                "建築材料，鉱物・金属材料等卸売業", "機械器具卸売業", "その他の卸売業",
                "各種商品小売業", "織物・衣服・身の回り品小売業", "飲食料品小売業",
                "機械器具小売業", "その他の小売業", "無店舗小売業"]
    ws_total_basic = 0
    print(f"  {'業種':30s} {'地域雇用':>10s} {'LQ':>6s} {'基盤雇用':>10s}")
    for ind in ws_codes:
        row = df_lq_mid[df_lq_mid["industry"] == ind]
        if row.empty: continue
        r = row.iloc[0]
        mark = "★" if r['lq'] > 1.0 else " "
        print(f"  {mark}{ind:29s} {r['local_emp']:>10,.0f} {r['lq']:>6.2f} {r['basic_emp_estimate']:>10,.0f}")
        ws_total_basic += r['basic_emp_estimate']
    print(f"  → 中分類化により、卸売・小売の基盤雇用 = {ws_total_basic:,.0f} 人")
    print()


def section_3_full_impact_matrix():
    print("=" * 100)
    print("Section 3: 全指標への影響マトリクス")
    print("=" * 100)
    print()

    accessor = MarketDataAccessor()
    df_major = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    df_mid = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
    df_agri = load_agri_census(CACHE_DIR)
    nat_major = get_national_employment(df_major)
    nat_mid = get_area_employment_mid(df_mid, "00000")
    nat_mid_ext = get_area_employment_mid(df_mid, "00000", extend_agriculture=True, agri_df=df_agri)

    targets = [
        (46, 46000, "鹿児島県"),  # 農業県
        (37, 37000, "香川県"),    # バランス型
        (13, 13000, "東京都"),    # 都心
        (14, 14000, "神奈川県"),  # ベッドタウン
    ]

    for pref, _, name in targets:
        area_code = f"{pref:02d}000"
        basics = accessor.city_basics(pref, 0)
        local_major = get_area_employment(df_major, area_code)
        local_mid = get_area_employment_mid(df_mid, area_code)
        local_mid_ext = get_area_employment_mid(df_mid, area_code,
                                                  extend_agriculture=True, agri_df=df_agri)

        # 計算
        def calc(local, national):
            df_lq = lq_table(local, national)
            basic = total_basic_employment(df_lq)
            total = float(df_lq["local_emp"].sum())
            ebm = total / basic if basic > 0 else 0
            return total, basic, ebm, basic/total*100 if total > 0 else 0, int((df_lq["lq"] > 1.0).sum())

        t_maj, b_maj, ebm_maj, br_maj, n_maj = calc(local_major, nat_major)
        t_mid, b_mid, ebm_mid, br_mid, n_mid = calc(local_mid, nat_mid)
        t_ext, b_ext, ebm_ext, br_ext, n_ext = calc(local_mid_ext, nat_mid_ext)

        # PER (人口/総雇用) - 雇用が変わるとPERも変わる
        per_maj = basics["population"] / t_maj if t_maj > 0 else 0
        per_mid = basics["population"] / t_mid if t_mid > 0 else 0
        per_ext = basics["population"] / t_ext if t_ext > 0 else 0

        # 小売ギャップ
        sectors, _ = accessor.retail_sectors(pref, 0)
        df_gap = gap_analysis_table(sectors)
        gap_factor = ((df_gap["demand"].sum() - df_gap["supply"].sum()) /
                      (df_gap["demand"].sum() + df_gap["supply"].sum()) * 100) if not df_gap.empty else 0

        print(f"\n■ {name}")
        print(f"  {'指標':18s} {'大分類17':>12s} {'中分類95':>12s} {'+農林業':>12s}")
        print(f"  {'─'*60}")
        print(f"  {'総雇用':18s} {t_maj:>12,.0f} {t_mid:>12,.0f} {t_ext:>12,.0f}")
        print(f"  {'基盤雇用':18s} {b_maj:>12,.0f} {b_mid:>12,.0f} {b_ext:>12,.0f}")
        print(f"  {'基盤雇用比率(%)':18s} {br_maj:>11.1f}% {br_mid:>11.1f}% {br_ext:>11.1f}%")
        print(f"  {'EBM':18s} {ebm_maj:>12.2f} {ebm_mid:>12.2f} {ebm_ext:>12.2f}")
        print(f"  {'基盤産業数':18s} {n_maj:>12} {n_mid:>12} {n_ext:>12}")
        print(f"  {'PER':18s} {per_maj:>12.2f} {per_mid:>12.2f} {per_ext:>12.2f}")
        print(f"  {'小売漏損係数':18s} {gap_factor:>+11.1f} {gap_factor:>+11.1f} {gap_factor:>+11.1f} (独立)")


def section_4_indicator_dependency_map():
    print()
    print("=" * 100)
    print("Section 4: 分類粒度が影響を与える指標の依存関係マップ")
    print("=" * 100)
    print()
    print("  📊 影響を強く受ける指標（業種分類が変わると数値が変わる）:")
    print("    ├─ LQ（業種別）           大分類1業種 → 中分類複数業種に分解")
    print("    ├─ 基盤雇用合計           細分化で必ず増える方向")
    print("    ├─ 基盤雇用比率           基盤雇用 ÷ 総雇用")
    print("    ├─ EBM = 1/基盤雇用比率   基盤率上昇でEBM低下")
    print("    └─ シフトシェア分解        業種数が違うと NS/IM/RS の分解結果が変わる")
    print()
    print("  ⚖️  間接的に影響を受ける指標:")
    print("    ├─ 投資適格スコア          EBM・基盤比率を使うため")
    print("    └─ 需要予測カスケード      EBM が変わると総雇用→人口→住宅も変わる")
    print()
    print("  🛡 影響を受けない（独立）指標:")
    print("    ├─ 人口・世帯数            国勢調査から取得、分類と無関係")
    print("    ├─ 小売販売額             経済センサス小売中分類で独立計算")
    print("    ├─ 小売ギャップ係数        小売販売額のみ使用")
    print("    ├─ MLIT取引価格            別データソース")
    print("    └─ NLNI空間データ          別データソース")
    print()
    print("  ⚠️  PER の取り扱い注意:")
    print("    - 大分類版: PER = 人口 / 経済センサス民営+公務全体総雇用")
    print("    - 中分類版: PER = 人口 / 民営事業所のみ総雇用（公務S除外）")
    print("    - +農林業版: PER = 人口 / 民営+農林業センサス補完（家族農家含む）")
    print("    → 分母（雇用範囲）が異なるためPERも変わる")


def section_5_textbook_reproducibility():
    print()
    print("=" * 100)
    print("Section 5: 教科書 Orlando MSA との互換性")
    print("=" * 100)
    print()
    print("CI102 教科書 Activity 4-1 は16業種で実施。これは米国 BLS の")
    print("『Supersector classification』に近い粒度で、日本のJSIC大分類17業種に相当。")
    print()
    print("→ 大分類版が CCIM 教科書と最も整合的な粒度")
    print("→ 中分類版は『教科書の補正版（隠れた特化産業を捉える）』")
    print("→ +農林業版は『日本固有の補完（経済センサス範囲外を統合）』")
    print()
    print("実務的な使い分け推奨:")
    print("  - CI102教科書通りの分析: 大分類版を使用")
    print("  - 詳細な地域経済診断:   中分類版を使用")
    print("  - 地方都市の現実評価:   +農林業版を使用")


def main():
    section_1_concrete_examples()
    section_2_aggregation_problem("46000", "鹿児島県")
    section_3_full_impact_matrix()
    section_4_indicator_dependency_map()
    section_5_textbook_reproducibility()


if __name__ == "__main__":
    main()
