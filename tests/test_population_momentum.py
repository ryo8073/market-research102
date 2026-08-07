"""2025年国勢調査 人口モメンタム統合のテスト。"""
from __future__ import annotations
import math
import pytest
from config import get_settings
from data.census_cache import (
    load_cached_dataset, DS_POPULATION, get_area_population_momentum,
)
from scorecard import classify_population_momentum

df = load_cached_dataset(get_settings().cache_dir, DS_POPULATION.csv_name)
pytestmark = pytest.mark.skipif(df is None, reason="2025人口キャッシュ未取得")


def test_national_2025_population():
    m = get_area_population_momentum(df, "00000")
    # 令和7年速報 全国人口 約1.23億
    assert 1.22e8 < m["population"] < 1.24e8
    # 全国5年増減率は約-2.45%
    assert -3.0 < m["pop_change_pct"] < -2.0


def test_tokyo_grows_akita_declines():
    tokyo = get_area_population_momentum(df, "13000")
    akita = get_area_population_momentum(df, "05000")
    assert tokyo["pop_change_pct"] > 0        # 東京は増加
    assert akita["pop_change_pct"] < -5.0     # 秋田は深刻な減少


def test_momentum_block_has_all_fields():
    m = get_area_population_momentum(df, "40130")  # 福岡市
    for k in ("population", "population_2020", "households",
              "pop_change_pct", "hh_change_pct", "density"):
        assert k in m and isinstance(m[k], float)


def test_classify_boundaries():
    nat = -2.45
    assert classify_population_momentum(3.2, nat) == "growth"
    assert classify_population_momentum(0.5, nat) == "resilient"
    assert classify_population_momentum(-1.0, nat) == "outperform_decline"
    assert classify_population_momentum(-4.0, nat) == "decline"
    assert classify_population_momentum(-8.0, nat) == "severe_decline"


def test_scorecard_exposes_momentum():
    from data_sources import MarketDataAccessor
    from scorecard import build_scorecard
    acc = MarketDataAccessor()
    basics = acc.city_basics(40, 40130)  # 福岡市
    sc = build_scorecard(acc, 40, 40130, basics, new_basic_jobs=0,
                         persons_per_household=basics.get("persons_per_household", 2.2),
                         area_name="福岡市")
    assert sc.pop_change_pct > 0
    assert sc.pop_momentum_class == "growth"
    # 全国比ギャップは実測差分と整合
    assert math.isclose(sc.pop_momentum_gap,
                        round(sc.pop_change_pct - sc.pop_change_pct_national, 2),
                        abs_tol=0.01)
