"""大分類17業種 vs 中分類95業種 で同じ都市のEBM・基盤雇用比率を比較。

ユーザー疑問: 「業種分類が粗いと基盤雇用が過小評価され、EBMが過大になる」
→ 中分類で再計算したらどう変わるか実証する。

理論: LQ計算は分類粒度に対し凸的性質。細かくするほど基盤雇用は必ず増える方向。
"""
from __future__ import annotations

import io
import statistics
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calculator import economic_base_multiplier, lq_table, total_basic_employment
from data.census_cache import (
    DS_EMPLOYMENT_MAJOR,
    DS_EMPLOYMENT_MID,
    load_cached_dataset,
    get_area_employment,
    get_area_employment_mid,
    get_national_employment,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def calc_metrics(local, national):
    """LQテーブルから total_emp, basic_emp, ebm, basic_ratio を計算。"""
    if not local or not national:
        return None
    total = sum(local.values())
    if total < 1000:
        return None
    df_lq = lq_table(local, national)
    basic = total_basic_employment(df_lq)
    ebm = total / basic if basic > 0 else 0
    basic_pct = basic / total * 100
    n_basic = (df_lq["lq"] > 1.0).sum()
    return {
        "total": total, "basic": basic, "ebm": ebm,
        "basic_pct": basic_pct, "n_basic": int(n_basic),
    }


def main():
    df_major = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    df_mid = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)

    nat_major = get_national_employment(df_major)
    nat_mid = dict(zip(
        df_mid[df_mid["area_code"] == "00000"]["category_name"],
        df_mid[df_mid["area_code"] == "00000"]["employees"],
    ))

    print(f"全国データ: 大分類={len(nat_major)}業種 / 中分類={len(nat_mid)}業種")
    print()

    targets = [
        ("00000", "全国"),
        ("13100", "東京特別区部"),
        ("13104", "新宿区"),
        ("13101", "千代田区"),
        ("13113", "渋谷区"),
        ("27100", "大阪市"),
        ("23100", "名古屋市"),
        ("40130", "福岡市"),
        ("28100", "神戸市"),
        ("14100", "横浜市"),
        ("14130", "川崎市"),
        ("37201", "高松市"),
        ("47201", "那覇市"),
        ("01100", "札幌市"),
        ("26100", "京都市"),
        ("22130", "浜松市"),
        ("13000", "東京都"),
    ]

    print("=" * 110)
    print(f"{'都市':14s} {'大分類EBM':>9s} {'中分類EBM':>9s} {'EBM変化':>9s} "
          f"{'大分類 基盤率':>11s} {'中分類 基盤率':>11s} {'基盤産業':>10s}")
    print("=" * 110)
    rows = []
    for code, name in targets:
        local_major = get_area_employment(df_major, code)
        local_mid = dict(zip(
            df_mid[df_mid["area_code"] == code]["category_name"],
            df_mid[df_mid["area_code"] == code]["employees"],
        ))
        m_major = calc_metrics(local_major, nat_major)
        m_mid = calc_metrics(local_mid, nat_mid)
        if not m_major or not m_mid:
            print(f"{name:14s} -- データなし")
            continue
        delta_ebm = m_mid["ebm"] - m_major["ebm"]
        n_basic_str = f"{m_major['n_basic']}→{m_mid['n_basic']}"
        print(f"{name:14s} {m_major['ebm']:>9.2f} {m_mid['ebm']:>9.2f} {delta_ebm:>+9.2f} "
              f"{m_major['basic_pct']:>10.1f}% {m_mid['basic_pct']:>10.1f}% {n_basic_str:>10s}")
        rows.append({"name": name, **m_mid, "ebm_major": m_major["ebm"]})

    # 全市区町村の中央値計算
    print()
    print("=== 全市区町村のEBM・基盤雇用比率 中央値（大分類 vs 中分類）===")
    ebms_major = []
    ebms_mid = []
    ratios_major = []
    ratios_mid = []
    for code in df_major["area_code"].unique():
        if code == "00000" or code.endswith("000"):
            continue
        local_major = get_area_employment(df_major, code)
        local_mid = dict(zip(
            df_mid[df_mid["area_code"] == code]["category_name"],
            df_mid[df_mid["area_code"] == code]["employees"],
        ))
        m_major = calc_metrics(local_major, nat_major)
        m_mid = calc_metrics(local_mid, nat_mid)
        if m_major and m_major["basic"] > 0:
            ebms_major.append(m_major["ebm"])
            ratios_major.append(m_major["basic_pct"])
        if m_mid and m_mid["basic"] > 0:
            ebms_mid.append(m_mid["ebm"])
            ratios_mid.append(m_mid["basic_pct"])

    print(f"対象市区町村: {len(ebms_major):,}（大分類）/ {len(ebms_mid):,}（中分類）")
    print()
    print(f"指標          | 大分類17業種 | 中分類95業種 | 差")
    print(f"EBM 中央値    | {statistics.median(ebms_major):>11.2f} | {statistics.median(ebms_mid):>11.2f} | {statistics.median(ebms_mid)-statistics.median(ebms_major):>+5.2f}")
    print(f"基盤率 中央値 | {statistics.median(ratios_major):>10.1f}% | {statistics.median(ratios_mid):>10.1f}% | {statistics.median(ratios_mid)-statistics.median(ratios_major):>+5.1f}%")
    print(f"EBM 25%       | {statistics.quantiles(ebms_major,n=4)[0]:>11.2f} | {statistics.quantiles(ebms_mid,n=4)[0]:>11.2f}")
    print(f"EBM 75%       | {statistics.quantiles(ebms_major,n=4)[2]:>11.2f} | {statistics.quantiles(ebms_mid,n=4)[2]:>11.2f}")
    print()
    print("教科書 Orlando MSA: EBM 4.94 / 基盤率 20.2%")


if __name__ == "__main__":
    main()
