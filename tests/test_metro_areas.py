"""都市圏（MSA相当）集計のテスト。

METROPOLITAN_AREAS の各都市圏で、集計後のPERが
教科書のMSAレンジ（1.5〜2.5）に収まることを確認。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calculator import (
    economic_base_multiplier,
    lq_table,
    population_employment_ratio,
    total_basic_employment,
)
from data.codes import METROPOLITAN_AREAS, get_metro_area_options, get_metro_prefectures
from data_sources import MarketDataAccessor

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def _cache_available() -> bool:
    return (CACHE_DIR / "census_employment_major_2021.csv").exists()


@pytest.fixture
def accessor():
    return MarketDataAccessor()


class TestMetroAreaDefinitions:
    def test_options_returns_all_metros(self):
        options = get_metro_area_options()
        assert len(options) == len(METROPOLITAN_AREAS)

    def test_tokyo_metro_prefectures(self):
        """東京圏は1都3県（東京・神奈川・埼玉・千葉）"""
        prefs = get_metro_prefectures("tokyo")
        assert set(prefs) == {13, 14, 11, 12}

    def test_osaka_metro_prefectures(self):
        """大阪圏は京阪神＋奈良"""
        prefs = get_metro_prefectures("osaka")
        assert set(prefs) == {27, 28, 26, 29}

    def test_unknown_metro(self):
        assert get_metro_prefectures("unknown") == []


@pytest.mark.skipif(not _cache_available(), reason="経済センサスキャッシュ未構築")
class TestMetroAggregation:
    def test_metro_per_is_in_msa_range(self, accessor):
        """都市圏集計後のPERが教科書MSAレンジ(1.5-2.5)に収まる。

        単独自治体（千代田区PER=0.05など）と異なり、経済圏として
        妥当な範囲になることを保証する。
        """
        for key in METROPOLITAN_AREAS:
            prefs = get_metro_prefectures(key)
            basics = accessor.metro_basics(prefs)
            per = population_employment_ratio(
                basics["population"], basics["total_employment"]
            )
            assert 1.5 <= per <= 2.7, (
                f"{key}: PER={per:.2f} が MSA レンジ外。"
                "経済圏定義が広すぎる/狭すぎる可能性。"
            )

    def test_tokyo_metro_population_is_largest(self, accessor):
        """東京圏が最大人口の都市圏であること。"""
        sizes = {}
        for key in METROPOLITAN_AREAS:
            b = accessor.metro_basics(get_metro_prefectures(key))
            sizes[key] = b["population"]
        assert sizes["tokyo"] == max(sizes.values())
        # 3000万人以上であること（1都3県の実勢）
        assert sizes["tokyo"] > 30_000_000

    def test_metro_employment_sum_matches_prefecture_sum(self, accessor):
        """都市圏集計が個別県の合計と一致する（恒等式）。"""
        from data.census_cache import (
            DS_EMPLOYMENT_MAJOR, load_cached_dataset, get_area_employment,
        )
        df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)

        for key in METROPOLITAN_AREAS:
            prefs = get_metro_prefectures(key)
            local, _, _ = accessor.metro_industry_employment(prefs)
            metro_total = sum(local.values())

            manual_total = 0.0
            for pc in prefs:
                pref_emp = get_area_employment(df, f"{pc:02d}000")
                manual_total += sum(pref_emp.values())

            assert abs(metro_total - manual_total) < 1.0, (
                f"{key}: 集計不一致 {metro_total} != {manual_total}"
            )

    def test_metro_shift_share_decomposition_identity(self, accessor):
        """都市圏シフトシェアでも NS+IM+RS = actual_change が成立。"""
        from calculator import shift_share_table

        l0, l1, n0, n1, _ = accessor.metro_shift_share_inputs([37])  # 香川県のみ
        if not l0:
            pytest.skip("シフトシェアデータ取得失敗")
        df = shift_share_table(l0, l1, n0, n1)
        for _, row in df.iterrows():
            computed = row["national_growth"] + row["industry_mix"] + row["regional_shift"]
            assert abs(computed - row["actual_change"]) < 1.0
