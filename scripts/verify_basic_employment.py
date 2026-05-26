"""基盤雇用の数値検証スクリプト。

CI102教科書のOrlando MSA例（基盤雇用率20%、EBM 4.94）と
日本の主要都市（東京・大阪・高松・那覇・札幌・福岡）を比較。
過大な数値が出ていないか確認する。
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from calculator import lq_table, total_basic_employment, economic_base_multiplier
from data.census_cache import (
    DS_EMPLOYMENT_MAJOR,
    load_cached_dataset,
    get_area_employment,
    get_national_employment,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"

TARGETS = [
    ("00000", "全国"),
    ("13100", "東京都特別区部"),
    ("13101", "千代田区"),
    ("13104", "新宿区"),  # 5桁目正しくは新宿区=13104
    ("13113", "渋谷区"),
    ("27100", "大阪市"),
    ("01100", "札幌市"),
    ("40130", "福岡市"),
    ("37201", "高松市"),
    ("47201", "那覇市"),
    ("23100", "名古屋市"),
    ("14100", "横浜市"),
    ("26100", "京都市"),
    ("28100", "神戸市"),
    ("13000", "東京都"),
    ("27000", "大阪府"),
]


def main() -> None:
    df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    if df is None:
        print("キャッシュなし。scripts/download_census.py を実行してください。")
        return

    print(f"=== キャッシュ概要 ===")
    print(f"全行数: {len(df):,}")
    print(f"カラム: {list(df.columns)}")
    print(f"地域数: {df['area_code'].nunique():,}")
    print(f"全国(00000)の産業数: {(df['area_code'] == '00000').sum()}")
    print()

    # 全国データを確認
    national = get_national_employment(df)
    print(f"=== 全国の産業別従業者数（2021経済センサス）===")
    nat_total = sum(national.values())
    for ind, emp in sorted(national.items(), key=lambda x: -x[1]):
        print(f"  {ind:30s} {emp:>15,.0f}  ({emp/nat_total*100:5.1f}%)")
    print(f"  {'合計':30s} {nat_total:>15,.0f}")
    print()

    # 各都市
    print(f"=== 都市別 LQ・基盤雇用 ===")
    print(f"{'都市':20s} {'総雇用':>12s} {'基盤雇用':>12s} {'基盤率':>7s} {'EBM':>6s} {'基盤産業数':>5s}")
    print("-" * 80)

    results = []
    for code, name in TARGETS:
        local = get_area_employment(df, code)
        if not local:
            print(f"{name:20s} -- データなし (code={code})")
            continue

        local_total = sum(local.values())
        df_lq = lq_table(local, national)
        basic = total_basic_employment(df_lq)
        basic_pct = basic / local_total * 100 if local_total > 0 else 0
        ebm = economic_base_multiplier(local_total, basic)
        n_basic_industries = (df_lq["lq"] > 1.0).sum()

        results.append({
            "area": name,
            "code": code,
            "total_emp": local_total,
            "basic_emp": basic,
            "basic_pct": basic_pct,
            "ebm": ebm,
            "n_basic": n_basic_industries,
        })

        print(f"{name:20s} {local_total:>12,.0f} {basic:>12,.0f} {basic_pct:>6.1f}% {ebm:>6.2f} {n_basic_industries:>5}")

    print()
    print(f"=== 教科書(Orlando MSA)との比較 ===")
    print(f"Orlando: 総雇用 1,050,091 / 基盤雇用 212,575 / 基盤率 20.2% / EBM 4.94")
    print()

    # 大阪市のLQ詳細
    print("=== 例: 大阪市の産業別LQ ===")
    osaka = get_area_employment(df, "27100")
    if osaka:
        df_lq = lq_table(osaka, national)
        for _, row in df_lq.iterrows():
            mark = "★基盤" if row["lq"] > 1.0 else ""
            print(f"  {row['industry']:30s} LQ={row['lq']:5.2f}  local={row['local_emp']:>10,.0f}  basic={row['basic_emp_estimate']:>10,.0f} {mark}")


if __name__ == "__main__":
    main()
