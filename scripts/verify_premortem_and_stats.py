"""Pre-mortem validation と統計学的妥当性検証を統合実施。

Pre-mortem 12のリスク仮説:
  R1. 投資スコアが「EBM高い=高スコア」の誤った解釈で算出される
  R2. narrative/insights が大分類のみで通勤歪みを反映していない
  R3. /compare ページが中分類/+農林業/多角化指標を使わずに比較
  R4. ベッドタウン市町村が高EBMで高スコア・優良判定される
  R5. LQ計算が小規模自治体で統計的に不安定
  R6. 同一地域で大分類/中分類/+農林業のスコアが大きく違う場合の混乱
  R7. 中分類版のシフトシェアが未実装で時系列分析が不完全
  R8. 多重比較問題（95業種で見ると偶然のLQ>1.0が増える）
  R9. データ更新時の依存関係（中分類変更時に何を再生成すべきか）
  R10. 公務(S)を含む/含まないでPER分母が変わる
  R11. 多角化指標相互の冗長性（HHI/N_eff/Shannon は同じことを測っている？）
  R12. 経済センサスの調査範囲限界（事業所所在地、農林漁業除外、自営除外）

統計学的視点:
  S1. LQの統計的有意性 — 小規模自治体のサンプル誤差
  S2. 中央値 vs 平均値 vs ロバスト統計
  S3. パーセンタイル分布の解釈の正確性
  S4. min-max正規化の限界（極端値の影響）
  S5. 多角化指標間の相関分析
  S6. LQ計算の凸性質の数学的厳密性
  S7. 投資スコア重み付けの理論的根拠
"""
from __future__ import annotations

import io
import math
import statistics
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from calculator import (
    economic_base_multiplier,
    investment_suitability_score,
    lq_table,
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
from data.codes import METROPOLITAN_AREAS
from data_sources import MarketDataAccessor

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def section_premortem():
    print("=" * 100)
    print("Pre-mortem validation — 12のリスク仮説")
    print("=" * 100)

    accessor = MarketDataAccessor()
    df_major = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    nat_major = get_national_employment(df_major)

    # R1, R4: 投資スコアが通勤流出ベッドタウンを過大評価していないか
    print("\n【R1, R4: 投資スコアの逆解釈リスク — ベッドタウンが高スコアになるか】")
    candidates = [
        (13, 13100, "東京特別区部", "都心通勤流入型"),
        (14, 14100, "横浜市", "通勤流出ベッドタウン"),
        (14, 14130, "川崎市", "通勤流出ベッドタウン"),
        (28, 28100, "神戸市", "通勤流出ベッドタウン"),
        (37, 37201, "高松市", "地方中核"),
        (1, 1100, "札幌市", "地方中核"),
    ]
    print(f"{'地域':18s} {'タイプ':18s} {'EBM':>6s} {'基盤率':>7s} {'投資スコア':>9s}")
    for pref, city, name, category in candidates:
        basics = accessor.city_basics(pref, city)
        local_emp = get_area_employment(df_major, f"{pref:02d}{city%1000:03d}" if city % 1000 != 0 else f"{pref:02d}000")
        if not local_emp:
            continue
        df_lq = lq_table(local_emp, nat_major)
        basic = total_basic_employment(df_lq)
        total = float(df_lq["local_emp"].sum())
        ebm = total / basic if basic > 0 else 0
        basic_ratio = basic / total * 100 if total > 0 else 0
        score = investment_suitability_score(ebm, basic_ratio, 0, 0, total)
        # EBM スコアの単独値も
        print(f"  {name:18s} {category:18s} {ebm:>6.2f} {basic_ratio:>6.1f}% {score['total_score']:>9.1f} (EBM部分: {score['ebm_score']:.0f})")
    print()
    print("→ 横浜市 EBM 11.43 の ebm_score = (11.43-1)/9*100 = 116 → clamp(100) = 100点満点")
    print("→ ベッドタウンが通勤流出で過大なEBMを得て、スコアが高くなるバグ")
    print("  ✗ 修正必要: 投資スコアのEBM部分を『3-6が最高点』の山形関数に変更すべき")

    # R5: LQ計算の小規模自治体での安定性
    print("\n【R5: 小規模自治体でLQ計算が統計的に不安定か】")
    sizes = []
    for code in df_major["area_code"].unique():
        if code == "00000" or code.endswith("000"):
            continue
        local = get_area_employment(df_major, code)
        total = sum(local.values()) if local else 0
        if total > 0:
            sizes.append(total)
    sizes.sort()
    print(f"  全市区町村数: {len(sizes):,}")
    print(f"  雇用者総数の分布:")
    print(f"    最小: {min(sizes):,} 人  (極小規模)")
    print(f"    10%タイル: {sizes[len(sizes)//10]:,} 人")
    print(f"    中央値: {sizes[len(sizes)//2]:,} 人")
    print(f"    90%タイル: {sizes[len(sizes)*9//10]:,} 人")
    print(f"    最大: {max(sizes):,} 人")
    n_small = sum(1 for s in sizes if s < 5000)
    print(f"  雇用 < 5,000 人の自治体: {n_small} ({n_small/len(sizes)*100:.0f}%)")
    print(f"  ⚠ これらでは1業種が全体の20%超を占めることがあり、LQが極端な値（>3.0）になりやすい")

    # R6: 大分類/中分類/+農林業のスコア乖離
    print("\n【R6: 同一地域で3バージョンのスコア乖離】")
    df_mid = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
    df_agri = load_agri_census(CACHE_DIR)
    nat_mid = get_area_employment_mid(df_mid, "00000")
    nat_mid_ext = get_area_employment_mid(df_mid, "00000", extend_agriculture=True, agri_df=df_agri)

    for pref, city, name in [(46, 46201, "鹿児島市"), (14, 14100, "横浜市"), (13, 13101, "千代田区")]:
        area = f"{pref:02d}{city%1000:03d}" if city % 1000 != 0 else f"{pref:02d}000"
        l_maj = get_area_employment(df_major, area)
        l_mid = get_area_employment_mid(df_mid, area)
        l_ext = get_area_employment_mid(df_mid, area, extend_agriculture=True, agri_df=df_agri)

        def calc(local, national):
            df = lq_table(local, national)
            basic = total_basic_employment(df)
            total = float(df["local_emp"].sum())
            if total == 0 or basic == 0:
                return None
            ebm = total/basic
            br = basic/total*100
            score = investment_suitability_score(ebm, br, 0, 0, total)
            return score["total_score"]

        s_maj = calc(l_maj, nat_major)
        s_mid = calc(l_mid, nat_mid)
        s_ext = calc(l_ext, nat_mid_ext)
        diff = max(s_maj or 0, s_mid or 0, s_ext or 0) - min(s_maj or 0, s_mid or 0, s_ext or 0)
        warn = "⚠️" if diff > 10 else "  "
        print(f"  {warn} {name:14s} 大分類スコア={s_maj} 中分類={s_mid} +農林業={s_ext}  最大差={diff:.1f}")
    print()
    print("  ⚠ スコアが10点以上違う場合、判定（A/B/C）が変わる可能性")

    # R8: 多重比較問題
    print("\n【R8: 多重比較問題 — 95業種で見ると偶然のLQ>1.0が増える】")
    # 全市区町村の平均「LQ>1.0業種数」を比較
    n_basic_major_list = []
    n_basic_mid_list = []
    for code in df_major["area_code"].unique()[:100]:  # サンプリング
        if code == "00000" or code.endswith("000"):
            continue
        l_maj = get_area_employment(df_major, code)
        l_mid = get_area_employment_mid(df_mid, code)
        if l_maj:
            df_lq = lq_table(l_maj, nat_major)
            n_basic_major_list.append((df_lq["lq"] > 1.0).sum())
        if l_mid:
            df_lq = lq_table(l_mid, nat_mid)
            n_basic_mid_list.append((df_lq["lq"] > 1.0).sum())
    print(f"  サンプル {len(n_basic_major_list)} 市区町村:")
    print(f"  大分類17業種: 平均{statistics.mean(n_basic_major_list):.1f} 業種 が LQ>1.0 (={statistics.mean(n_basic_major_list)/17*100:.0f}%)")
    print(f"  中分類95業種: 平均{statistics.mean(n_basic_mid_list):.1f} 業種 が LQ>1.0 (={statistics.mean(n_basic_mid_list)/95*100:.0f}%)")
    print(f"  → 中分類化で『偶然のLQ>1.0』が増える可能性。ただしLQが1.0僅か超は基盤雇用への寄与が小さい(1-1/1.05=0.05のみ)")

    # R10: PER分母の違い
    print("\n【R10: PER分母（公務含む/民営のみ）の違い】")
    for code, name in [("00000", "全国"), ("13000", "東京都"), ("46000", "鹿児島県")]:
        emp_maj = sum(get_area_employment(df_major, code).values())
        emp_mid = sum(get_area_employment_mid(df_mid, code).values())
        print(f"  {name:10s} 大分類(民営+公務) {emp_maj:>12,}人  中分類(民営のみ) {emp_mid:>12,}人  差={emp_maj-emp_mid:>10,}人 ({(emp_maj-emp_mid)/emp_maj*100:.1f}%)")
    print(f"  → 公務(S)が4-7%を占める。PERの値は中分類版で僅か（4-7%）高めに出る")


def section_statistical():
    print("\n" + "=" * 100)
    print("統計学的視点 — 妥当性の検証")
    print("=" * 100)

    df_major = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    df_mid = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
    nat_major = get_national_employment(df_major)
    nat_mid = get_area_employment_mid(df_mid, "00000")

    # S1: LQの統計的有意性 — Casetti (1968) のLQ標準誤差
    print("\n【S1: LQの統計的有意性 — 小規模自治体でのサンプル誤差】")
    print("Casetti (1968)・Tian (2013) によるLQの標準誤差近似:")
    print("  SE(LQ) ≈ LQ × sqrt(1/e_i + 1/E_i)  ※ e_i=地域業種雇用, E_i=全国業種雇用")
    print()
    examples = [
        ("100", "極小自治体・1業種10人 vs 全国1万人", 10, 10000, 1000, 60000000),
        ("中規模", "1業種1,000人 vs 全国100万人", 1000, 1000000, 100000, 60000000),
        ("大規模", "1業種100,000人 vs 全国1,000万人", 100000, 10000000, 1000000, 60000000),
    ]
    for label, desc, e_i, E_i, e_total, E_total in examples:
        lq = (e_i/e_total) / (E_i/E_total) if e_total > 0 and E_i > 0 else 0
        se = lq * math.sqrt(1/e_i + 1/E_i) if e_i > 0 and E_i > 0 else 0
        ci_low = lq - 1.96 * se
        ci_high = lq + 1.96 * se
        print(f"  {label} ({desc}):")
        print(f"    LQ = {lq:.3f}, SE ≈ {se:.3f}, 95%信頼区間 [{ci_low:.3f}, {ci_high:.3f}]")
    print()
    print("  → 小規模自治体（雇用<5,000）ではSEが大きく、LQが1.0前後なら『有意な特化』とは言えない")
    print("  ✗ 現状のUIは点推定値のみ表示。信頼区間を併記すべき")

    # S5: 多角化指標間の相関
    print("\n【S5: 多角化指標間の相関 — 4指標は本当に独立か】")
    accessor = MarketDataAccessor()
    metro_data = []
    for key, info in METROPOLITAN_AREAS.items():
        local, national, _ = accessor.metro_industry_employment(info["prefectures"])
        total = sum(local.values())
        shares = [v/total for v in local.values() if v > 0]
        hhi = sum(s*s for s in shares) * 10000
        n_eff = 1 / sum(s*s for s in shares)
        shannon = -sum(s * math.log(s) for s in shares if s > 0)
        cr5 = sum(sorted(shares, reverse=True)[:5]) * 100
        metro_data.append({"name": info["name"], "hhi": hhi, "n_eff": n_eff, "shannon": shannon, "cr5": cr5})

    # 相関係数 (7サンプル)
    def corr(x, y):
        n = len(x)
        mx, my = sum(x)/n, sum(y)/n
        num = sum((x[i]-mx)*(y[i]-my) for i in range(n))
        denx = math.sqrt(sum((x[i]-mx)**2 for i in range(n)))
        deny = math.sqrt(sum((y[i]-my)**2 for i in range(n)))
        return num / (denx * deny) if denx*deny > 0 else 0

    hhis = [m["hhi"] for m in metro_data]
    neffs = [m["n_eff"] for m in metro_data]
    shannons = [m["shannon"] for m in metro_data]
    cr5s = [m["cr5"] for m in metro_data]

    print(f"  HHI vs N_eff:     r = {corr(hhis, neffs):.3f}  (HHI=1/N_eff*scale なので強い負相関が予想される)")
    print(f"  HHI vs Shannon:   r = {corr(hhis, shannons):.3f}  (両方とも分散を測るが計算式が異なる)")
    print(f"  HHI vs CR5:       r = {corr(hhis, cr5s):.3f}")
    print(f"  N_eff vs Shannon: r = {corr(neffs, shannons):.3f}  (構造的に同じ多様性を測定)")
    print()
    print("  ⚠️ HHI と N_eff は数学的に N_eff = 10000/HHI（HHI×100²基準） の関係で 1対1 対応")
    print("    → 同じ情報を2つの形で表示している可能性")
    print("  Shannon は対数なので別の情報を持つが、N_eff と高相関 → 部分的に冗長")
    print()
    print("  推奨: HHI と Shannon の2指標で十分。N_eff は HHI から導出される派生指標として扱う")

    # S7: 投資スコア重み付けの理論的根拠
    print("\n【S7: 投資スコア重み付けの妥当性】")
    print("現状の重み: EBM(20%) + 基盤比率(20%) + RS(25%) + Gap(20%) + 規模(15%)")
    print()
    print("問題点:")
    print("  1. EBM と 基盤比率は EBM = 1/基盤比率 の恒等式で従属")
    print("     → 同じ情報を2倍カウント (40%相当)")
    print("  2. EBMスコアが (EBM-1)/9*100 で計算 → EBM 10以上で満点")
    print("     → ベッドタウン（EBM 11+）が満点になる逆解釈バグ")
    print("  3. 規模スコアが total_emp/10000 (50K=5, 200K=20, 1M=100)")
    print("     → 大都市が機械的に高得点")
    print()
    print("  推奨: EBM スコアを『3-6が最高点』の山形関数に修正")
    print("       例: 100 - |EBM - 4.5| * 20, clamp(0, 100)")
    print("       基盤比率と EBM を統合（どちらか1つに）")


def section_recommendations():
    print("\n" + "=" * 100)
    print("総合的な推奨対応")
    print("=" * 100)
    print()
    print("【優先度: 高】")
    print("  1. 投資適格スコアの EBM 山形関数化")
    print("     現状: EBM=20でも満点 → ベッドタウン高評価バグ")
    print("     修正: EBM 3-6 が最高点、それを離れると低下")
    print()
    print("  2. insights.ts (Next.js) の EBM 解釈修正")
    print("     現状: 『EBM>=5.0=非常に高い=波及効果大』(旧解釈)")
    print("     修正: 『EBM 3-6=健全、>8=基盤雇用薄い』")
    print()
    print("  3. /compare ページに通勤歪み警告を追加")
    print("     現状: 大分類のEBMで比較、ベッドタウン市が高評価")
    print("     修正: commute_distortion フラグを反映、注意書き")
    print()
    print("【優先度: 中】")
    print("  4. narrative生成（generateNarrative）に新指標反映")
    print("     - 通勤歪みのある県（神奈川等）にコメント")
    print("     - 中分類で大きく変わる県に注記")
    print()
    print("  5. 多角化指標の冗長性整理（HHI と N_eff を併記する旨を明示）")
    print()
    print("【優先度: 低】")
    print("  6. LQ信頼区間の表示（特に小規模自治体）")
    print("  7. 統計的注意書きを Learn ページに追加")


def main():
    section_premortem()
    section_statistical()
    section_recommendations()


if __name__ == "__main__":
    main()
