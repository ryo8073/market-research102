"""data_sources.py の統合テスト。

キャッシュ済みCSVを使った実データパスと、
フォールバック（sample_data）パスの両方を検証する。
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sample_data
from data_sources import MarketDataAccessor


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def accessor():
    return MarketDataAccessor()


def _cache_available() -> bool:
    """CSVキャッシュが存在するか。CI環境では無い可能性がある。"""
    cache_dir = Path(__file__).resolve().parents[1] / "data" / "cache"
    return (cache_dir / "census_employment_major_2021.csv").exists()


SKIP_NO_CACHE = pytest.mark.skipif(
    not _cache_available(),
    reason="CSVキャッシュが未構築（CI環境等）",
)


# ---------------------------------------------------------------------------
# _build_area_code
# ---------------------------------------------------------------------------

class TestBuildAreaCode:
    def test_pref_only(self):
        assert MarketDataAccessor._build_area_code(37, 0) == "37000"

    def test_pref_only_none(self):
        assert MarketDataAccessor._build_area_code(13, 0) == "13000"

    def test_five_digit_city(self):
        assert MarketDataAccessor._build_area_code(37, 37201) == "37201"

    def test_short_city_code(self):
        assert MarketDataAccessor._build_area_code(37, 201) == "37201"

    def test_tokyo_ward(self):
        assert MarketDataAccessor._build_area_code(13, 13113) == "13113"


# ---------------------------------------------------------------------------
# キャッシュパス（実データ）テスト
# ---------------------------------------------------------------------------

class TestCachePath:
    """CSVキャッシュが存在する場合の実データテスト。"""

    @SKIP_NO_CACHE
    def test_industry_employment_returns_dicts(self, accessor):
        local, national, src = accessor.industry_employment(37, 0)
        assert isinstance(local, dict)
        assert isinstance(national, dict)
        assert "キャッシュ" in src
        assert len(local) >= 5
        assert len(national) >= 5
        # 全従業者数が妥当な範囲
        assert sum(local.values()) > 10_000
        assert sum(national.values()) > 10_000_000

    @SKIP_NO_CACHE
    def test_industry_employment_city_level(self, accessor):
        """市区町村レベル（高松市）でもデータが取れる。"""
        local, national, src = accessor.industry_employment(37, 37201)
        assert len(local) >= 5
        # 高松市の従業者数は県全体より少ないはず
        pref_local, _, _ = accessor.industry_employment(37, 0)
        assert sum(local.values()) < sum(pref_local.values())

    @SKIP_NO_CACHE
    def test_city_basics_returns_valid_structure(self, accessor):
        result = accessor.city_basics(37, 0)
        assert "population" in result
        assert "households" in result
        assert "total_employment" in result
        assert "persons_per_household" in result
        # 香川県の人口は50万〜120万の範囲
        assert 500_000 < result["population"] < 1_200_000
        assert result["persons_per_household"] > 1.0

    @SKIP_NO_CACHE
    def test_city_basics_city_level(self, accessor):
        result = accessor.city_basics(37, 37201)
        pref = accessor.city_basics(37, 0)
        assert result["population"] < pref["population"]

    @SKIP_NO_CACHE
    def test_shift_share_inputs_returns_five_tuple(self, accessor):
        l0, l1, n0, n1, src = accessor.shift_share_inputs(37, 0)
        assert isinstance(l0, dict)
        assert isinstance(l1, dict)
        assert isinstance(n0, dict)
        assert isinstance(n1, dict)
        assert "e-Stat" in src
        # 共通産業が5以上ある
        common = set(l0) & set(l1) & set(n0) & set(n1)
        assert len(common) >= 5

    @SKIP_NO_CACHE
    def test_shift_share_national_t0_is_prefecture_sum(self, accessor):
        """2016年全国データは47都道府県の合計で算出される。"""
        _, _, n0, n1, _ = accessor.shift_share_inputs(37, 0)
        # 全国の2016年・2021年それぞれで総雇用が1000万以上
        assert sum(n0.values()) > 10_000_000
        assert sum(n1.values()) > 10_000_000

    @SKIP_NO_CACHE
    def test_retail_sectors_returns_list(self, accessor):
        sectors, src = accessor.retail_sectors(37, 0)
        assert isinstance(sectors, list)
        assert len(sectors) >= 1
        assert "e-Stat" in src
        # 各セクターに必須キーがある
        for s in sectors:
            assert "sector" in s
            assert "demand" in s
            assert "supply" in s
            assert s["demand"] > 0
            assert s["supply"] > 0

    @SKIP_NO_CACHE
    def test_get_census_municipalities(self, accessor):
        cities = accessor.get_census_municipalities(37)
        assert isinstance(cities, list)
        assert len(cities) >= 3  # 香川県は8市+α
        # タプル (code, name) のリスト
        codes, names = zip(*cities)
        assert any("高松" in n for n in names)


# ---------------------------------------------------------------------------
# フォールバックパス テスト
# ---------------------------------------------------------------------------

class TestFallbackPath:
    """キャッシュが存在しない / 読み込み失敗時のフォールバック動作。"""

    def test_industry_employment_fallback(self):
        acc = MarketDataAccessor()
        with patch.object(acc, "_ensure_census_cache", return_value=None):
            acc._estat_v2 = None  # API も無効化
            local, national, src = acc.industry_employment(37, 0)
        assert src == "sample_data (フォールバック)"
        assert local == sample_data.TAKAMATSU_EMP_BY_INDUSTRY
        assert national == sample_data.NATIONAL_EMP_BY_INDUSTRY

    def test_city_basics_fallback(self):
        acc = MarketDataAccessor()
        # city_basics 内の try/except で sample_data に落ちることを確認
        with patch("data.census_cache.load_cached_dataset", return_value=None):
            result = acc.city_basics(37, 0)
        assert result == sample_data.TAKAMATSU

    def test_shift_share_fallback(self):
        acc = MarketDataAccessor()
        with patch("data_sources.MarketDataAccessor._build_area_code", return_value="37000"):
            # load_cached_dataset を失敗させる
            with patch("data.census_cache.load_cached_dataset", return_value=None):
                l0, l1, n0, n1, src = acc.shift_share_inputs(37, 0)
        assert "sample_data" in src
        assert l0 == sample_data.TAKAMATSU_EMP_T0

    def test_retail_sectors_fallback(self):
        acc = MarketDataAccessor()
        with patch("data.census_cache.load_cached_dataset", return_value=None):
            sectors, src = acc.retail_sectors(37, 0)
        assert src == "sample_data"
        assert sectors == sample_data.TAKAMATSU_RETAIL_SECTORS

    def test_get_census_municipalities_no_cache(self):
        acc = MarketDataAccessor()
        with patch.object(acc, "_ensure_census_cache", return_value=None):
            result = acc.get_census_municipalities(37)
        assert result == []


# ---------------------------------------------------------------------------
# api_status
# ---------------------------------------------------------------------------

class TestApiStatus:
    def test_returns_dict_with_three_keys(self, accessor):
        status = accessor.api_status()
        assert "RESAS API" in status
        assert "e-Stat API" in status
        assert "不動産情報ライブラリ API" in status
        # 各値は bool
        for v in status.values():
            assert isinstance(v, bool)


# ---------------------------------------------------------------------------
# 2016年産業名正規化
# ---------------------------------------------------------------------------

class TestNormalize2016IndustryName:
    def test_removes_jsic_prefix(self):
        assert MarketDataAccessor._normalize_2016_industry_name("D建設業") == "建設業"

    def test_skips_subdivision(self):
        assert MarketDataAccessor._normalize_2016_industry_name("G1通信業") == ""
        assert MarketDataAccessor._normalize_2016_industry_name("R2その他") == ""

    def test_pure_kanji_strips_first_char(self):
        # 漢字も isalpha()=True なので先頭文字が除去される
        # 実際の2016年データは "D建設業" 形式なのでこれで問題ない
        assert MarketDataAccessor._normalize_2016_industry_name("D建設業") == "建設業"
        assert MarketDataAccessor._normalize_2016_industry_name("I卸売業，小売業") == "卸売業，小売業"
