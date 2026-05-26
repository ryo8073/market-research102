"""通勤歪み検出のテスト。

scorecard.build_scorecard() が commute_distortion フラグを
正しく設定することを保証する。

- 千代田区: PER<1.2 → inflow
- 横浜市/京都市: EBM>8 かつ 基盤雇用比率<12% → outflow
- 全国/東京都全体: balanced
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data_sources import MarketDataAccessor
from scorecard import build_scorecard, generate_insights

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def _cache_available() -> bool:
    return (CACHE_DIR / "census_employment_major_2021.csv").exists()


pytestmark = pytest.mark.skipif(
    not _cache_available(),
    reason="経済センサスキャッシュ未構築",
)


@pytest.fixture
def accessor():
    return MarketDataAccessor()


class TestCommuteDistortionDetection:
    def test_chiyoda_is_inflow(self, accessor):
        """千代田区: 通勤流入で雇用が人口を大幅に上回る。"""
        basics = accessor.city_basics(13, 13101)
        sc = build_scorecard(accessor, 13, 13101, basics, 100, 2.2, "千代田区")
        assert sc.commute_distortion == "inflow"
        assert sc.per < 1.0
        assert sc.emp_to_pop_ratio > 1.0  # 雇用 > 人口

    def test_shinjuku_is_inflow(self, accessor):
        """新宿区: 通勤流入"""
        basics = accessor.city_basics(13, 13104)
        sc = build_scorecard(accessor, 13, 13104, basics, 100, 2.2, "新宿区")
        assert sc.commute_distortion == "inflow"

    def test_yokohama_is_outflow(self, accessor):
        """横浜市: ベッドタウン化で EBM が異常高、基盤雇用比率が低い"""
        basics = accessor.city_basics(14, 14100)
        sc = build_scorecard(accessor, 14, 14100, basics, 100, 2.2, "横浜市")
        assert sc.commute_distortion == "outflow"
        assert sc.ebm > 8.0
        assert sc.basic_ratio < 12.0

    def test_warning_in_insights(self, accessor):
        """通勤歪みが警告として insights に含まれること。"""
        basics = accessor.city_basics(13, 13101)
        sc = build_scorecard(accessor, 13, 13101, basics, 100, 2.2, "千代田区")
        insights = generate_insights(sc)
        commute_warnings = [
            ins for ins in insights
            if "通勤" in ins["text"] or "ベッドタウン" in ins["text"]
        ]
        assert len(commute_warnings) > 0
        assert commute_warnings[0]["level"] == "warning"
