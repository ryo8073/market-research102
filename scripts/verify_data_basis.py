"""データ基準（事業所所在地 vs 就業地、人口の時点）の整合性を確認。

問題仮説:
1. e-Stat 経済センサス「従業者数」は事業所所在地ベース
   → 東京都心の千代田区は通勤流入で従業者が膨張、PER（人口/雇用）が異常に低くなる
2. 国勢調査の「人口」は夜間人口（居住地ベース）
   → 分母（事業所所在地雇用）と分子（居住地人口）が地理的に不一致
3. 結果: 大都市中心部のEBM・基盤雇用率が過大、PER に基づくカスケード予測がおかしくなる
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.census_cache import (
    DS_EMPLOYMENT_MAJOR,
    DS_POPULATION,
    load_cached_dataset,
    get_area_employment,
    get_area_population,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"

TARGETS = [
    ("00000", "全国"),
    ("13101", "千代田区"),
    ("13104", "新宿区"),
    ("13100", "東京特別区部"),
    ("13000", "東京都"),
    ("27100", "大阪市"),
    ("27000", "大阪府"),
    ("01100", "札幌市"),
    ("14100", "横浜市"),
    ("28100", "神戸市"),
    ("37201", "高松市"),
    ("47201", "那覇市"),
]


def main():
    df_emp = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    df_pop = load_cached_dataset(CACHE_DIR, DS_POPULATION.csv_name)

    print("=== 人口データの利用可能項目（千代田区を例に） ===")
    if df_pop is not None:
        chi = get_area_population(df_pop, "13101")
        for k, v in sorted(chi.items(), key=lambda x: x[0]):
            print(f"  {k}: {v:,.0f}")
        print()

    print("=== 人口 vs 雇用 比較 ===")
    print(f"{'地域':18s} {'人口':>12s} {'総雇用':>12s} {'PER':>6s} {'雇用/人口':>8s}")
    print("-" * 70)
    pop_key = "2015年（平成27年）の人口（組替）"
    for code, name in TARGETS:
        local_emp = get_area_employment(df_emp, code)
        pop = get_area_population(df_pop, code)
        total_emp = sum(local_emp.values()) if local_emp else 0
        population = pop.get(pop_key, 0) if pop else 0
        per = population / total_emp if total_emp > 0 else 0
        emp_to_pop = total_emp / population if population > 0 else 0
        print(f"{name:18s} {population:>12,.0f} {total_emp:>12,.0f} {per:>6.2f} {emp_to_pop:>8.2%}")

    print()
    print("=== 解釈 ===")
    print("PER（人口/雇用）が 1.0 を大きく下回る地域 = 通勤流入で雇用が膨張している事業所所在地データ")
    print("CI102教科書 Orlando MSA: PER 1.91（健全な居住地+事業所のバランス）")
    print("PER < 1.0 の地域では「基盤雇用×EBM×PER で人口増を推計」のカスケードが破綻する")


if __name__ == "__main__":
    main()
