"""データバージョン定数の整合性テスト。

data/data_versions.py と data/census_cache.py の DatasetConfig が
同期されていることを保証する。

2026年版差替時に data_versions.py のみ更新して census_cache.py の
更新を忘れた場合、このテストが落ちる。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.data_versions import (
    ECONOMIC_CENSUS_CURRENT,
    ECONOMIC_CENSUS_PREVIOUS,
    POPULATION_CENSUS_CURRENT,
    POPULATION_CENSUS_PREVIOUS,
    HISTORICAL_VERSIONS,
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


def test_major_employment_table_id_matches_current():
    assert DS_EMPLOYMENT_MAJOR.table_id == ECONOMIC_CENSUS_CURRENT.table_major_emp


def test_mid_employment_table_id_matches_current():
    assert DS_EMPLOYMENT_MID.table_id == ECONOMIC_CENSUS_CURRENT.table_mid_emp


def test_retail_sales_table_id_matches_current():
    assert DS_RETAIL_SALES.table_id == ECONOMIC_CENSUS_CURRENT.table_retail_sales


def test_establishments_table_id_matches_current():
    assert DS_ESTABLISHMENTS.table_id == ECONOMIC_CENSUS_CURRENT.table_establishments


def test_2016_table_id_matches_previous():
    assert DS_EMPLOYMENT_MAJOR_2016.table_id == ECONOMIC_CENSUS_PREVIOUS.table_major_emp


def test_population_table_id_matches_current():
    assert DS_POPULATION.table_id == POPULATION_CENSUS_CURRENT.table_id


def test_csv_names_contain_current_year():
    """CSV ファイル名に現行年度のサフィックスが含まれていること。

    経済センサス系: 2021 サフィックス
    国勢調査系: 2020 サフィックス (こちらは別バージョン体系)
    """
    suffix = ECONOMIC_CENSUS_CURRENT.csv_suffix
    assert suffix in DS_EMPLOYMENT_MAJOR.csv_name, f"{DS_EMPLOYMENT_MAJOR.csv_name} missing {suffix}"
    assert suffix in DS_EMPLOYMENT_MID.csv_name
    assert suffix in DS_RETAIL_SALES.csv_name
    assert suffix in DS_ESTABLISHMENTS.csv_name
    # 国勢調査は別バージョン体系
    pop_suffix = POPULATION_CENSUS_CURRENT.csv_suffix
    assert pop_suffix in DS_POPULATION.csv_name, f"{DS_POPULATION.csv_name} missing {pop_suffix}"


def test_csv_names_contain_previous_year():
    """前回版 CSV にも年度サフィックスが含まれていること。"""
    prev_suffix = ECONOMIC_CENSUS_PREVIOUS.csv_suffix
    assert prev_suffix in DS_EMPLOYMENT_MAJOR_2016.csv_name
    assert prev_suffix in CSV_EMPLOYMENT_MID_2016


def test_population_pop_key_is_consistent():
    """現行(2025速報)の人口キー名が想定通りで、map_data と一致すること。

    data_versions.py と map_data._POP_KEY の両方でハードコードされており、
    どちらかだけ変更されると PER・小売ギャップ需要推計が壊れる。
    2025年 人口速報集計では実測人口キーは "人口"（2015組替値は廃止）。
    """
    expected_key = POPULATION_CENSUS_CURRENT.pop_key
    assert expected_key == "人口", "2025速報の人口キーは '人口'"
    # map_data 側のキーと必ず一致していること（二重管理の同期チェック）
    import map_data
    assert map_data._POP_KEY == expected_key, (
        "data_versions と map_data._POP_KEY の人口キーが不一致"
    )
    # 前回版(2020=2015組替)のキーは組替値であることを保持
    assert "2015" in POPULATION_CENSUS_PREVIOUS.pop_key
    assert "組替" in POPULATION_CENSUS_PREVIOUS.pop_key


def test_publication_year_after_survey_year():
    """公表年は調査年より後でなければならない。"""
    assert ECONOMIC_CENSUS_CURRENT.publication_year >= ECONOMIC_CENSUS_CURRENT.survey_year
    assert ECONOMIC_CENSUS_PREVIOUS.publication_year >= ECONOMIC_CENSUS_PREVIOUS.survey_year


def test_current_is_after_previous():
    """現行版は前回版より新しい。"""
    assert ECONOMIC_CENSUS_CURRENT.survey_year > ECONOMIC_CENSUS_PREVIOUS.survey_year


def test_historical_versions_contains_previous():
    """HISTORICAL_VERSIONS に少なくとも PREVIOUS が含まれている。"""
    assert ECONOMIC_CENSUS_PREVIOUS in HISTORICAL_VERSIONS


def test_no_overlapping_table_ids():
    """現行・前回でテーブル ID が同一でないこと (両方を同時に使うため)。"""
    # 大分類は 2021 と 2016 で別テーブルでなければシフトシェア計算ができない
    assert ECONOMIC_CENSUS_CURRENT.table_major_emp != ECONOMIC_CENSUS_PREVIOUS.table_major_emp
    assert ECONOMIC_CENSUS_CURRENT.table_mid_emp != ECONOMIC_CENSUS_PREVIOUS.table_mid_emp


def test_label_short_format():
    """label_short が "YYYY年" 形式 (UI表示用)。"""
    assert ECONOMIC_CENSUS_CURRENT.label_short.endswith("年")
    assert str(ECONOMIC_CENSUS_CURRENT.survey_year) in ECONOMIC_CENSUS_CURRENT.label_short


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
