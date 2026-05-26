"""小売ギャップ修正の回帰テスト。

修正前は卸売業（カテゴリ50-55）と中分類+小分類が両方含まれ、
合計が約6倍に膨らんでいた。get_area_retail_sales() のデフォルト
（include_wholesale=False, include_subcategories=False）で
小売中分類のみが返ることを保証する。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.census_cache import (
    DS_RETAIL_SALES,
    RETAIL_MID_CATEGORY_PREFIXES,
    get_area_retail_sales,
    load_cached_dataset,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def _cache_available() -> bool:
    return (CACHE_DIR / DS_RETAIL_SALES.csv_name).exists()


SKIP_NO_CACHE = pytest.mark.skipif(
    not _cache_available(),
    reason="小売販売額キャッシュ未構築",
)


# ---------------------------------------------------------------------------
# Synthetic fixture（キャッシュなしでもユニットレベルで検証可能）
# ---------------------------------------------------------------------------

@pytest.fixture
def synthetic_df():
    """卸売・小売中分類・小分類が混在する人工データ。"""
    return pd.DataFrame([
        # 卸売業（除外されるべき）
        {"area_code": "37201", "category_code": "50", "category_name": "各種商品卸売業", "sales": 1000.0},
        {"area_code": "37201", "category_code": "52", "category_name": "飲食料品卸売業", "sales": 2000.0},
        {"area_code": "37201", "category_code": "521", "category_name": "農畜産物卸売業", "sales": 800.0},
        # 小売業 中分類（デフォルトで含まれるべき）
        {"area_code": "37201", "category_code": "56", "category_name": "各種商品小売業", "sales": 100.0},
        {"area_code": "37201", "category_code": "58", "category_name": "飲食料品小売業", "sales": 500.0},
        {"area_code": "37201", "category_code": "61", "category_name": "無店舗小売業", "sales": 300.0},
        # 小売業 小分類（デフォルトでは二重計上回避のため除外）
        {"area_code": "37201", "category_code": "581", "category_name": "各種食料品小売業", "sales": 250.0},
        {"area_code": "37201", "category_code": "582", "category_name": "野菜・果実小売業", "sales": 50.0},
    ])


class TestRetailGapFilter:
    def test_default_excludes_wholesale(self, synthetic_df):
        """デフォルトでは卸売（50-55）を除外する。"""
        result = get_area_retail_sales(synthetic_df, "37201")
        # 卸売業の名前が含まれていないこと
        assert "各種商品卸売業" not in result
        assert "飲食料品卸売業" not in result
        assert "農畜産物卸売業" not in result

    def test_default_excludes_subcategories(self, synthetic_df):
        """デフォルトでは小分類（3桁コード）を除外する。"""
        result = get_area_retail_sales(synthetic_df, "37201")
        assert "各種食料品小売業" not in result
        assert "野菜・果実小売業" not in result

    def test_default_includes_retail_mid(self, synthetic_df):
        """デフォルトでは小売中分類（56-61, 2桁）のみを含む。"""
        result = get_area_retail_sales(synthetic_df, "37201")
        assert set(result.keys()) == {"各種商品小売業", "飲食料品小売業", "無店舗小売業"}
        assert sum(result.values()) == 900.0

    def test_include_wholesale(self, synthetic_df):
        """include_wholesale=True で卸売も含む（中分類のみ）。"""
        result = get_area_retail_sales(synthetic_df, "37201", include_wholesale=True)
        assert "各種商品卸売業" in result
        assert "農畜産物卸売業" not in result  # 小分類は依然除外

    def test_include_subcategories(self, synthetic_df):
        """include_subcategories=True で小分類も含む（小売のみ）。"""
        result = get_area_retail_sales(synthetic_df, "37201", include_subcategories=True)
        assert "各種食料品小売業" in result
        assert "農畜産物卸売業" not in result  # 卸売は依然除外

    def test_all_categories(self, synthetic_df):
        """両フラグTrueで全カテゴリ（旧仕様）。"""
        result = get_area_retail_sales(
            synthetic_df, "37201",
            include_wholesale=True, include_subcategories=True,
        )
        assert len(result) == 8

    def test_unknown_area(self, synthetic_df):
        """存在しない地域は空dictを返す。"""
        assert get_area_retail_sales(synthetic_df, "99999") == {}


class TestRetailMidCategoryPrefixes:
    """RETAIL_MID_CATEGORY_PREFIXES が CI102 が対象とする小売業
    （日本標準産業分類大分類I 小売業）と一致することを保証。"""

    def test_prefixes_are_retail(self):
        assert RETAIL_MID_CATEGORY_PREFIXES == ("56", "57", "58", "59", "60", "61")

    def test_no_wholesale_in_prefixes(self):
        """卸売業（50-55）が含まれていないこと。"""
        for ws in ("50", "51", "52", "53", "54", "55"):
            assert ws not in RETAIL_MID_CATEGORY_PREFIXES


# ---------------------------------------------------------------------------
# 実キャッシュでの検証（CSVがある場合のみ）
# ---------------------------------------------------------------------------

@SKIP_NO_CACHE
class TestRealCacheRetailGap:
    def test_takamatsu_default_smaller_than_legacy(self):
        """高松市: デフォルト合計 < 旧仕様合計（修正前は約6倍）。"""
        df = load_cached_dataset(CACHE_DIR, DS_RETAIL_SALES.csv_name)
        default_total = sum(get_area_retail_sales(df, "37201").values())
        legacy_total = sum(get_area_retail_sales(
            df, "37201",
            include_wholesale=True, include_subcategories=True,
        ).values())
        assert default_total > 0
        assert legacy_total > default_total * 3, (
            f"修正が効いていない: default={default_total:,.0f}, legacy={legacy_total:,.0f}"
        )

    def test_no_wholesale_categories_in_default(self):
        """デフォルト出力に『卸売』を含むカテゴリ名がないこと。"""
        df = load_cached_dataset(CACHE_DIR, DS_RETAIL_SALES.csv_name)
        result = get_area_retail_sales(df, "00000")
        for k in result.keys():
            assert "卸売" not in k, f"卸売業が混入: {k}"
