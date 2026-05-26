"""投資適格スコアのEBM山形関数化バグ修正テスト。

旧版バグ: EBM > 10 → ebm_score = 100点満点 (横浜・神戸等のベッドタウンが高評価)
修正後: EBM 3-6 が最高点、それ以遠は減点 (教科書 Orlando MSA 4.94 を健全レンジに)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calculator import investment_suitability_score


class TestEbmYamagataFunction:
    def test_textbook_orlando_range_full_score(self):
        """教科書 Orlando MSA EBM 4.94 → ebm_score 100点"""
        for ebm in [3.0, 4.0, 4.5, 4.94, 5.0, 6.0]:
            result = investment_suitability_score(ebm, 20.0, 0, 0, 500000)
            assert result["ebm_score"] == 100.0, f"EBM={ebm} → {result['ebm_score']}"

    def test_bedtown_high_ebm_penalized(self):
        """横浜市 EBM 11.43 (通勤流出ベッドタウン) → ebm_score 大幅低下"""
        result = investment_suitability_score(11.43, 8.8, 0, 0, 500000)
        # 4.5から距離6.93、(6.93-1.5)*20=108.6 → clamp(0,100-108.6)=0
        assert result["ebm_score"] <= 10, (
            f"EBM 11.43 → {result['ebm_score']}点 (バグ未修正)"
        )

    def test_extremely_low_ebm_penalized(self):
        """EBM 1.0 (過剰特化) → 低スコア"""
        result = investment_suitability_score(1.0, 50.0, 0, 0, 500000)
        # 4.5から距離3.5、(3.5-1.5)*20=40 → 60点
        assert 50 <= result["ebm_score"] <= 70

    def test_monotonic_around_edges(self):
        """EBM 6→7→8 で単調減少すること"""
        scores = [investment_suitability_score(e, 20, 0, 0, 500000)["ebm_score"]
                  for e in [6.0, 7.0, 8.0, 10.0, 12.0]]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1], f"単調性違反: {scores}"


class TestBasicRatioYamagataFunction:
    def test_textbook_orlando_range_full_score(self):
        """Orlando MSA 基盤雇用比率 20.2% → ratio_score 100"""
        for br in [15.0, 18.0, 20.0, 22.0, 25.0]:
            result = investment_suitability_score(4.5, br, 0, 0, 500000)
            assert result["ratio_score"] == 100.0

    def test_low_ratio_penalized(self):
        """基盤雇用比率 5% (Tokyoの一部や地方) → 低スコア"""
        result = investment_suitability_score(4.5, 5.0, 0, 0, 500000)
        assert result["ratio_score"] <= 50

    def test_excessive_ratio_penalized(self):
        """基盤雇用比率 40% (過剰特化) → 低スコア"""
        result = investment_suitability_score(4.5, 40.0, 0, 0, 500000)
        assert result["ratio_score"] <= 50


class TestBedtownNotOverratedBug:
    """旧バグの回帰防止: ベッドタウンが高スコアになっていないか"""

    def test_yokohama_vs_orlando_like(self):
        """横浜市タイプ (EBM 11, 基盤率 8.8%) は健全タイプ (EBM 4.94, 基盤率 20.2%) より低スコア"""
        yokohama_like = investment_suitability_score(11.0, 8.8, 0, 0, 1500000)
        orlando_like = investment_suitability_score(4.94, 20.2, 0, 0, 1050000)
        assert yokohama_like["total_score"] < orlando_like["total_score"], (
            f"横浜タイプ {yokohama_like['total_score']} >= Orlando タイプ {orlando_like['total_score']}"
            "  → バグ未修正"
        )

    def test_ebm_score_is_zero_for_extreme_outlier(self):
        """EBM 20+ (大阪府等の極端な値) → ebm_score 0 に近い"""
        result = investment_suitability_score(20.0, 5.0, 0, 0, 500000)
        assert result["ebm_score"] <= 10


class TestBackwardCompatibility:
    """既存テストフィクスチャとの整合性"""

    def test_score_still_in_range(self):
        """スコアが 0-100 の範囲に収まる"""
        for ebm in [0.5, 2.0, 4.94, 10.0, 25.0]:
            for br in [3.0, 10.0, 20.0, 40.0]:
                result = investment_suitability_score(ebm, br, 0, 0, 500000)
                assert 0 <= result["total_score"] <= 100
                assert 0 <= result["ebm_score"] <= 100
                assert 0 <= result["ratio_score"] <= 100

    def test_returns_all_keys(self):
        result = investment_suitability_score(4.5, 20, 0, 0, 500000)
        assert set(result.keys()) == {
            "total_score", "ebm_score", "ratio_score",
            "rs_score", "gap_score", "scale_score",
        }
