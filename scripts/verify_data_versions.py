"""データバージョン整合性チェック。

`data/data_versions.py` と実際のキャッシュ CSV ・コード内のテーブル ID が
整合しているか検証する。

差替作業時にこのスクリプトを実行して全項目 PASS を確認すること。

Usage:
    python scripts/verify_data_versions.py
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import get_settings
from data.data_versions import (
    ECONOMIC_CENSUS_CURRENT,
    ECONOMIC_CENSUS_PREVIOUS,
    POPULATION_CENSUS_CURRENT,
    census_data_vintage_label,
    is_data_stale_years,
    next_census_estimated_year,
)
from data.census_cache import (
    DS_EMPLOYMENT_MAJOR,
    DS_EMPLOYMENT_MID,
    DS_EMPLOYMENT_MAJOR_2016,
    DS_POPULATION,
    DS_RETAIL_SALES,
    DS_ESTABLISHMENTS,
    CSV_EMPLOYMENT_MID_2016,
)


def check(label: str, condition: bool, detail: str = "") -> bool:
    icon = "✓" if condition else "✗"
    status = "PASS" if condition else "FAIL"
    print(f"  {icon} [{status}] {label}{('  — ' + detail) if detail else ''}")
    return condition


def main():
    print("=" * 70)
    print("データバージョン整合性チェック")
    print("=" * 70)
    print()
    print(f"現行ラベル: {census_data_vintage_label()}")
    print(f"現行データの経過年数: {is_data_stale_years()} 年")
    print(f"次回経済センサス公表予定: {next_census_estimated_year()} 年")
    print()

    all_pass = True

    # 1. テーブル ID の整合性
    print("【1】data_versions.py と census_cache.py のテーブル ID 整合性")
    all_pass &= check(
        "DS_EMPLOYMENT_MAJOR.table_id == ECONOMIC_CENSUS_CURRENT.table_major_emp",
        DS_EMPLOYMENT_MAJOR.table_id == ECONOMIC_CENSUS_CURRENT.table_major_emp,
        f"{DS_EMPLOYMENT_MAJOR.table_id} vs {ECONOMIC_CENSUS_CURRENT.table_major_emp}",
    )
    all_pass &= check(
        "DS_EMPLOYMENT_MID.table_id == ECONOMIC_CENSUS_CURRENT.table_mid_emp",
        DS_EMPLOYMENT_MID.table_id == ECONOMIC_CENSUS_CURRENT.table_mid_emp,
        f"{DS_EMPLOYMENT_MID.table_id} vs {ECONOMIC_CENSUS_CURRENT.table_mid_emp}",
    )
    all_pass &= check(
        "DS_RETAIL_SALES.table_id == ECONOMIC_CENSUS_CURRENT.table_retail_sales",
        DS_RETAIL_SALES.table_id == ECONOMIC_CENSUS_CURRENT.table_retail_sales,
        f"{DS_RETAIL_SALES.table_id} vs {ECONOMIC_CENSUS_CURRENT.table_retail_sales}",
    )
    all_pass &= check(
        "DS_ESTABLISHMENTS.table_id == ECONOMIC_CENSUS_CURRENT.table_establishments",
        DS_ESTABLISHMENTS.table_id == ECONOMIC_CENSUS_CURRENT.table_establishments,
        f"{DS_ESTABLISHMENTS.table_id} vs {ECONOMIC_CENSUS_CURRENT.table_establishments}",
    )
    all_pass &= check(
        "DS_EMPLOYMENT_MAJOR_2016.table_id == ECONOMIC_CENSUS_PREVIOUS.table_major_emp",
        DS_EMPLOYMENT_MAJOR_2016.table_id == ECONOMIC_CENSUS_PREVIOUS.table_major_emp,
    )
    all_pass &= check(
        "DS_POPULATION.table_id == POPULATION_CENSUS_CURRENT.table_id",
        DS_POPULATION.table_id == POPULATION_CENSUS_CURRENT.table_id,
    )
    print()

    # 2. CSV ファイル名の整合性
    print("【2】CSV ファイル名にデータ年度サフィックスが含まれているか")
    suffix = ECONOMIC_CENSUS_CURRENT.csv_suffix
    all_pass &= check(
        f"DS_EMPLOYMENT_MAJOR.csv_name に '{suffix}' が含まれる",
        suffix in DS_EMPLOYMENT_MAJOR.csv_name,
        DS_EMPLOYMENT_MAJOR.csv_name,
    )
    all_pass &= check(
        f"DS_EMPLOYMENT_MID.csv_name に '{suffix}' が含まれる",
        suffix in DS_EMPLOYMENT_MID.csv_name,
        DS_EMPLOYMENT_MID.csv_name,
    )
    prev_suffix = ECONOMIC_CENSUS_PREVIOUS.csv_suffix
    all_pass &= check(
        f"DS_EMPLOYMENT_MAJOR_2016.csv_name に '{prev_suffix}' が含まれる",
        prev_suffix in DS_EMPLOYMENT_MAJOR_2016.csv_name,
        DS_EMPLOYMENT_MAJOR_2016.csv_name,
    )
    all_pass &= check(
        f"CSV_EMPLOYMENT_MID_2016 に '{prev_suffix}' が含まれる",
        prev_suffix in CSV_EMPLOYMENT_MID_2016,
        CSV_EMPLOYMENT_MID_2016,
    )
    print()

    # 3. 実キャッシュファイルの存在
    print("【3】キャッシュ CSV ファイルの存在")
    settings = get_settings()
    expected_files = [
        DS_EMPLOYMENT_MAJOR.csv_name,
        DS_EMPLOYMENT_MID.csv_name,
        DS_EMPLOYMENT_MAJOR_2016.csv_name,
        DS_POPULATION.csv_name,
        DS_RETAIL_SALES.csv_name,
        DS_ESTABLISHMENTS.csv_name,
        CSV_EMPLOYMENT_MID_2016,
    ]
    for fname in expected_files:
        path = settings.cache_dir / fname
        size_kb = path.stat().st_size / 1024 if path.exists() else 0
        all_pass &= check(
            f"{fname} ({size_kb:,.0f} KB)" if path.exists() else fname,
            path.exists(),
            "" if path.exists() else f"NOT FOUND: {path}",
        )
    print()

    # 4. 鮮度判定
    print("【4】データ鮮度ステータス")
    age = is_data_stale_years()
    if age < 3:
        check(f"データ鮮度: 最新 ({age} 年前)", True)
    elif age < 5:
        print(f"  ⚠ データはやや経過 ({age} 年前) — UI は黄色バナー表示")
    else:
        print(f"  ⚠ データは古い ({age} 年以上経過) — 次回経済センサス公表 ({next_census_estimated_year()} 年予定) を待つ")
    print()

    # 結果
    print("=" * 70)
    if all_pass:
        print("✓ ALL PASS — データバージョン整合性 OK")
    else:
        print("✗ FAIL — 上記の不整合を修正してください")
        print("    docs/DATA_MIGRATION_2026.md の手順を参照")
    print("=" * 70)
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
