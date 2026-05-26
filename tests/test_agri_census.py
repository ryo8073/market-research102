"""農林業センサス2020データの統合テスト。

経済センサスでは捉えられない個人経営の家族農家を補完するため、
2020年農林業センサスの都道府県別総数を経済センサスの構成比で
市区町村に按分配分したデータ（agri_workers_2020.csv）を検証。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.census_cache import (
    load_agri_census,
    get_area_agri_workers,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def _cache_available() -> bool:
    return (CACHE_DIR / "agri_workers_2020.csv").exists()


pytestmark = pytest.mark.skipif(
    not _cache_available(),
    reason="農林業センサスキャッシュ未構築（scripts/download_agri_census.py を実行）",
)


class TestAgriCensusCache:
    def test_load_returns_dataframe(self):
        df = load_agri_census(CACHE_DIR)
        assert df is not None
        assert len(df) > 1500  # 1700+市区町村 + 47県全体

    def test_national_total_matches_census(self):
        """都道府県全体の合計が農林業センサス公表値 約136万人と一致。"""
        df = load_agri_census(CACHE_DIR)
        # 県全体行（_000）のみを合計
        pref_only = df[df["area_code"].str.endswith("000")]
        total = pref_only["agri_census_total_pref"].sum()
        assert 1_300_000 <= total <= 1_400_000, (
            f"全国合計 {total:,.0f} が農林業センサス2020 (約136万) と乖離"
        )

    def test_eco_to_census_ratio_about_3x(self):
        """農林業センサスは経済センサスの3-4倍規模であることを確認。"""
        df = load_agri_census(CACHE_DIR)
        pref_only = df[df["area_code"].str.endswith("000")]
        eco_total = pref_only["eco_agri_workers"].sum()
        census_total = pref_only["agri_census_total_pref"].sum()
        assert eco_total > 0
        ratio = census_total / eco_total
        assert 3.0 <= ratio <= 4.5, f"比率 {ratio:.2f} が想定範囲外"


class TestAreaAgriWorkers:
    def test_kagoshima_city_allocated(self):
        """鹿児島市の按分結果が経済センサス値より大きい。"""
        df = load_agri_census(CACHE_DIR)
        result = get_area_agri_workers(df, "46201")
        assert result, "鹿児島市データなし"
        assert result["extended"] > result["eco_only"]
        assert result["diff"] > 0

    def test_returns_empty_for_unknown(self):
        df = load_agri_census(CACHE_DIR)
        assert get_area_agri_workers(df, "99999") == {}

    def test_agriculture_prefectures_have_significant_workers(self):
        """農業県の県全体値が1万人以上であること。"""
        df = load_agri_census(CACHE_DIR)
        for pref_code, name in [
            ("01000", "北海道"),
            ("06000", "山形県"),
            ("15000", "新潟県"),
            ("46000", "鹿児島県"),
        ]:
            result = get_area_agri_workers(df, pref_code)
            assert result, f"{name} データなし"
            assert result["extended"] > 10_000, (
                f"{name} 農林業センサス按分値が異常に少ない: {result['extended']:,.0f}"
            )
