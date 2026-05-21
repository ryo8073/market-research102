"""map_data.py の統合テスト。

CSVキャッシュを使い47都道府県の集計が正しく動作することを検証。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _cache_available() -> bool:
    cache_dir = Path(__file__).resolve().parents[1] / "data" / "cache"
    return (cache_dir / "census_employment_major_2021.csv").exists()


SKIP_NO_CACHE = pytest.mark.skipif(
    not _cache_available(), reason="CSVキャッシュが未構築",
)


@SKIP_NO_CACHE
class TestLQSummary:
    def test_returns_47_rows(self):
        from map_data import compute_prefecture_lq_summary
        df = compute_prefecture_lq_summary()
        assert len(df) == 47

    def test_has_required_columns(self):
        from map_data import compute_prefecture_lq_summary
        df = compute_prefecture_lq_summary()
        for col in ["pref_code", "pref_name", "basic_ratio", "max_lq_industry"]:
            assert col in df.columns

    def test_basic_ratio_range(self):
        from map_data import compute_prefecture_lq_summary
        df = compute_prefecture_lq_summary()
        assert df["basic_ratio"].min() > 0
        assert df["basic_ratio"].max() < 100


@SKIP_NO_CACHE
class TestIndustryLQ:
    def test_returns_47_rows_for_common_industry(self):
        from map_data import compute_prefecture_industry_lq
        df = compute_prefecture_industry_lq("製造業")
        assert len(df) == 47

    def test_lq_positive(self):
        from map_data import compute_prefecture_industry_lq
        df = compute_prefecture_industry_lq("製造業")
        assert (df["lq"] > 0).all()


@SKIP_NO_CACHE
class TestShiftShare:
    def test_returns_47_rows(self):
        from map_data import compute_prefecture_shift_share
        df = compute_prefecture_shift_share()
        assert len(df) == 47

    def test_has_rs_column(self):
        from map_data import compute_prefecture_shift_share
        df = compute_prefecture_shift_share()
        assert "total_rs" in df.columns
        # RS は正にも負にもなる
        assert df["total_rs"].min() < 0 or df["total_rs"].max() > 0


@SKIP_NO_CACHE
class TestRetailGap:
    def test_returns_47_rows(self):
        from map_data import compute_prefecture_retail_gap
        df = compute_prefecture_retail_gap()
        assert len(df) == 47

    def test_factor_range(self):
        from map_data import compute_prefecture_retail_gap
        df = compute_prefecture_retail_gap()
        assert df["aggregate_factor"].min() >= -100
        assert df["aggregate_factor"].max() <= 100


@SKIP_NO_CACHE
class TestComparison:
    def test_returns_47_rows(self):
        from map_data import compute_prefecture_comparison
        df = compute_prefecture_comparison()
        assert len(df) == 47

    def test_ebm_positive(self):
        from map_data import compute_prefecture_comparison
        df = compute_prefecture_comparison()
        assert (df["ebm"] > 0).all()
        assert (df["per"] > 0).all()


@SKIP_NO_CACHE
class TestIndustryList:
    def test_returns_nonempty(self):
        from map_data import get_industry_list
        industries = get_industry_list()
        assert len(industries) >= 10
