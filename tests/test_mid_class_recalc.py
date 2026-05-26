"""中分類版EBM・基盤雇用比率の回帰テスト。

中分類キャッシュ修復後、ScorecardData に中分類版指標が追加されること、
理論的に基盤雇用が大分類より大きくなること（凸性質）を保証する。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data_sources import MarketDataAccessor
from scorecard import build_scorecard

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def _cache_available() -> bool:
    return (
        (CACHE_DIR / "census_employment_major_2021.csv").exists()
        and (CACHE_DIR / "census_employment_mid_2021.csv").exists()
    )


pytestmark = pytest.mark.skipif(
    not _cache_available(),
    reason="経済センサスキャッシュ未構築",
)


@pytest.fixture
def accessor():
    return MarketDataAccessor()


class TestMidClassPresence:
    def test_mid_metrics_present(self, accessor):
        """中分類版指標が ScorecardData に格納される。"""
        basics = accessor.city_basics(13, 13101)
        sc = build_scorecard(accessor, 13, 13101, basics, 100, 2.2, "千代田区")
        assert sc.ebm_mid is not None
        assert sc.basic_ratio_mid is not None
        assert sc.basic_emp_mid is not None
        assert sc.n_basic_industries_mid is not None

    def test_top_lq_industries_mid_populated(self, accessor):
        """中分類版のTOP LQ産業が10件まで生成される。"""
        basics = accessor.city_basics(13, 13101)
        sc = build_scorecard(accessor, 13, 13101, basics, 100, 2.2, "千代田区")
        assert len(sc.top_lq_industries_mid) > 0


class TestMidClassConvexity:
    """LQ計算の凸性質: 分類粒度が細かいほど基盤雇用は必ず増える方向。

    例外的に減少する場合は API・キャッシュデータの問題のサイン。
    """

    @pytest.mark.parametrize("pref,city,name", [
        (13, 13101, "千代田区"),
        (14, 14100, "横浜市"),
        (37, 37201, "高松市"),
        (27, 27100, "大阪市"),
        (23, 23100, "名古屋市"),
        (40, 40130, "福岡市"),
    ])
    def test_mid_basic_ratio_higher_than_major(self, accessor, pref, city, name):
        """中分類版の基盤雇用比率は大分類版以上になる（凸性質）。"""
        basics = accessor.city_basics(pref, city)
        sc = build_scorecard(accessor, pref, city, basics, 100, 2.2, name)
        assert sc.basic_ratio_mid >= sc.basic_ratio, (
            f"{name}: 中分類基盤率 {sc.basic_ratio_mid:.1f}% < "
            f"大分類基盤率 {sc.basic_ratio:.1f}% — 凸性質違反"
        )

    @pytest.mark.parametrize("pref,city,name", [
        (13, 13101, "千代田区"),
        (14, 14100, "横浜市"),
        (37, 37201, "高松市"),
    ])
    def test_mid_n_industries_more_than_major(self, accessor, pref, city, name):
        """中分類版の基盤産業数は大分類版以上になる。"""
        basics = accessor.city_basics(pref, city)
        sc = build_scorecard(accessor, pref, city, basics, 100, 2.2, name)
        n_major = sum(1 for r in sc.top_lq_industries if r["lq"] > 1.0)
        assert sc.n_basic_industries_mid >= n_major


class TestMidClassNoBugRegression:
    """旧バグ（製造業 551人など異常値）の再発防止チェック。"""

    def test_national_mid_total_realistic(self, accessor):
        """全国の中分類雇用合計が3000万人以上であること。

        旧バグ時は4,477,993人（公務のみ）と異常に少なかった。
        正常時は約5,800万人（民営事業所のみ）。
        """
        from data.census_cache import (
            DS_EMPLOYMENT_MID, load_cached_dataset,
        )
        df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
        nat = df[df["area_code"] == "00000"]
        total = nat["employees"].sum()
        assert total > 30_000_000, (
            f"全国中分類合計が異常に小さい: {total:,.0f}人。"
            "旧バグ（テーブル0004005686, 公務のみ）が再発した可能性。"
        )

    def test_manufacturing_realistic(self, accessor):
        """製造業（食料品〜輸送用機械）の合計が500万人以上であること。

        旧バグ時は製造業合計 551人 と異常値。正常時は約800-900万人。
        """
        from data.census_cache import (
            DS_EMPLOYMENT_MID, load_cached_dataset,
        )
        df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
        nat = df[df["area_code"] == "00000"].copy()
        nat["code_str"] = nat["category_code"].astype(str)
        # 製造業中分類コード 09-32
        mfg_codes = {f"{i:02d}" for i in range(9, 33)}
        mfg = nat[nat["code_str"].isin(mfg_codes)]
        total = mfg["employees"].sum()
        assert total > 5_000_000, (
            f"製造業合計が異常に小さい: {total:,.0f}人。"
            "旧バグ（テーブル0004005686）が再発した可能性。"
        )
