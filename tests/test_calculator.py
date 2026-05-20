"""CI102 教科書の数値で calculator.py の全関数を検証する。

本プロジェクトの最重要テストファイル。
猪俣先生の授業で行われる計算と完全に一致することを保証する。

テストデータ出典:
  - Activity 4-1: LQ 計算（Orlando MSA, p.206）
  - Activity 4-2: Basic Employment（p.207）
  - Activity 4-3: EBM（p.208）
  - Activity 4-4: PER（p.208）
  - Activity 4-5: Forecast（p.209）
  - Self-Assessment 1b: Denver MSA（p.211）
  - Self-Assessment 3: シフトシェア（Baton Rouge, p.212-213）
  - ロードマップ記載の Gwinnett County 例
"""
import math
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calculator import (  # noqa: E402
    economic_base_multiplier,
    forecast_housing_units,
    forecast_population_change,
    forecast_total_employment_change,
    gap_analysis_table,
    leakage_surplus_factor,
    location_quotient,
    lq_table,
    population_employment_ratio,
    shift_share,
    shift_share_table,
    total_basic_employment,
)


# ---------------------------------------------------------------------------
# LQ
# ---------------------------------------------------------------------------

class TestLocationQuotient:
    def test_textbook_education_example(self):
        """ロードマップ記載例: 地域20% / 国9% → LQ ≈ 2.22"""
        lq = location_quotient(20, 100, 9, 100)
        assert math.isclose(lq, 20 / 9, rel_tol=1e-6)

    def test_lq_below_one(self):
        lq = location_quotient(5, 100, 10, 100)
        assert lq == 0.5

    def test_lq_equals_one_when_proportions_match(self):
        assert location_quotient(15, 100, 15, 100) == 1.0

    def test_zero_local_total(self):
        assert location_quotient(10, 0, 100, 1000) == 0.0

    def test_zero_national_industry(self):
        assert location_quotient(10, 100, 0, 1000) == 0.0


class TestLQTable:
    def test_table_structure(self):
        local = {"製造業": 200, "サービス業": 800}
        national = {"製造業": 1000, "サービス業": 9000}
        df = lq_table(local, national)
        assert list(df.columns) == [
            "industry",
            "local_emp",
            "national_emp",
            "lq",
            "basic_emp_estimate",
        ]
        assert len(df) == 2

    def test_basic_emp_estimate_only_when_lq_above_one(self):
        # 製造業: 地域20% vs 国10% → LQ=2.0 → basic = 200 * (1 - 1/2) = 100
        local = {"製造業": 200, "サービス業": 800}
        national = {"製造業": 1000, "サービス業": 9000}
        df = lq_table(local, national)
        mfg = df[df["industry"] == "製造業"].iloc[0]
        svc = df[df["industry"] == "サービス業"].iloc[0]
        assert math.isclose(mfg["lq"], 2.0)
        assert math.isclose(mfg["basic_emp_estimate"], 100.0)
        # サービス業 LQ < 1.0 → basic = 0
        assert svc["lq"] < 1.0
        assert svc["basic_emp_estimate"] == 0.0


# ---------------------------------------------------------------------------
# EBM
# ---------------------------------------------------------------------------

class TestEconomicBaseMultiplier:
    def test_gwinnett_county_example(self):
        """ロードマップ記載例: Gwinnett County
        Total: 541,584 / Basic: 108,974 → EBM ≈ 4.97
        """
        ebm = economic_base_multiplier(541_584, 108_974)
        assert math.isclose(ebm, 4.97, abs_tol=0.01)

    def test_forecast_employment_change(self):
        """基盤雇用 +100, EBM 4.97 → 総雇用増 497"""
        assert math.isclose(
            forecast_total_employment_change(100, 4.97), 497.0, abs_tol=0.01
        )

    def test_zero_basic_emp(self):
        assert economic_base_multiplier(1000, 0) == 0.0


# ---------------------------------------------------------------------------
# PER & 派生指標
# ---------------------------------------------------------------------------

class TestPopulationEmploymentRatio:
    def test_gwinnett_county_per(self):
        """ロードマップ記載例: 人口 936,250 / 雇用 541,584 → PER ≈ 1.73"""
        per = population_employment_ratio(936_250, 541_584)
        assert math.isclose(per, 1.73, abs_tol=0.01)

    def test_forecast_population(self):
        """雇用増 497 × PER 2.5 ≈ 人口増 1,243"""
        delta = forecast_population_change(497, 2.5)
        assert math.isclose(delta, 1242.5, abs_tol=0.1)

    def test_housing_units(self):
        """人口増 1,243 / 世帯人員 2.2 ≈ 565戸"""
        units = forecast_housing_units(1243, 2.2)
        assert math.isclose(units, 565.0, abs_tol=1.0)


# ---------------------------------------------------------------------------
# Shift-Share
# ---------------------------------------------------------------------------

class TestShiftShare:
    def test_construction_industry_example(self):
        """ロードマップ記載例:
        国の総雇用成長率 5%、国の建設業成長率 8%
        州の建設業 100,000 → 98,000（2%減）
        - NS = 100,000 * 0.05 = 5,000
        - IM = 100,000 * (0.08 - 0.05) = 3,000
        - RS = 100,000 * (-0.02 - 0.08) = -10,000
        - actual_change = -2,000
        """
        # 国家全体: 10M → 10.5M で5%成長
        # 国家建設業: 1M → 1.08M で8%成長
        result = shift_share(
            local_emp_t0=100_000,
            local_emp_t1=98_000,
            national_industry_emp_t0=1_000_000,
            national_industry_emp_t1=1_080_000,
            national_total_emp_t0=10_000_000,
            national_total_emp_t1=10_500_000,
            industry="建設業",
        )
        assert math.isclose(result.national_growth, 5_000.0, abs_tol=1.0)
        assert math.isclose(result.industry_mix, 3_000.0, abs_tol=1.0)
        assert math.isclose(result.regional_shift, -10_000.0, abs_tol=1.0)
        assert math.isclose(result.actual_change, -2_000.0)
        # 三要因の合計 = 実際の変化
        assert math.isclose(result.total_share, result.actual_change, abs_tol=1.0)

    def test_total_share_identity(self):
        """全要因の合計 == 実雇用変化 が成り立つこと（恒等式）。"""
        result = shift_share(
            local_emp_t0=5_000,
            local_emp_t1=6_200,
            national_industry_emp_t0=500_000,
            national_industry_emp_t1=550_000,
            national_total_emp_t0=10_000_000,
            national_total_emp_t1=10_200_000,
        )
        assert math.isclose(
            result.total_share, result.actual_change, rel_tol=1e-9
        )


class TestShiftShareTable:
    def test_table_basic(self):
        local_t0 = {"製造業": 1000, "情報通信": 500}
        local_t1 = {"製造業": 950, "情報通信": 650}
        national_t0 = {"製造業": 100_000, "情報通信": 80_000}
        national_t1 = {"製造業": 102_000, "情報通信": 95_000}
        df = shift_share_table(local_t0, local_t1, national_t0, national_t1)
        assert set(df.columns) == {
            "industry",
            "actual_change",
            "national_growth",
            "industry_mix",
            "regional_shift",
            "total_share",
        }
        assert len(df) == 2


# ---------------------------------------------------------------------------
# Gap Analysis
# ---------------------------------------------------------------------------

class TestLeakageSurplusFactor:
    def test_textbook_food_beverage(self):
        """需要 $15.5M / 供給 $12M → Factor ≈ +12.7"""
        factor = leakage_surplus_factor(15_500_000, 12_000_000)
        assert math.isclose(factor, 12.7, abs_tol=0.1)

    def test_textbook_electronics(self):
        """需要 $3.8M / 供給 $0.5M → Factor ≈ +76.7"""
        factor = leakage_surplus_factor(3_800_000, 500_000)
        assert math.isclose(factor, 76.7, abs_tol=0.1)

    def test_textbook_apparel_surplus(self):
        """需要 $5.2M / 供給 $8.5M → Factor ≈ -24.0"""
        factor = leakage_surplus_factor(5_200_000, 8_500_000)
        assert math.isclose(factor, -24.0, abs_tol=0.1)

    def test_balanced_market(self):
        assert leakage_surplus_factor(1000, 1000) == 0.0

    def test_complete_leakage(self):
        """供給ゼロ → Factor = +100"""
        assert leakage_surplus_factor(1000, 0) == 100.0

    def test_complete_surplus(self):
        """需要ゼロ → Factor = -100"""
        assert leakage_surplus_factor(0, 1000) == -100.0


class TestGapAnalysisTable:
    def test_table_with_textbook_sectors(self):
        sectors = [
            {"sector": "食品・飲料スーパー", "demand": 15_500_000, "supply": 12_000_000},
            {"sector": "アパレル", "demand": 5_200_000, "supply": 8_500_000},
            {"sector": "家電量販店", "demand": 3_800_000, "supply": 500_000},
            {"sector": "飲食店", "demand": 8_400_000, "supply": 8_000_000},
        ]
        df = gap_analysis_table(sectors)
        # 家電量販店が最大の漏出
        assert df.iloc[0]["sector"] == "家電量販店"
        # アパレルが余剰（負）
        apparel = df[df["sector"] == "アパレル"].iloc[0]
        assert apparel["factor"] < 0
        # 飲食店は均衡
        food = df[df["sector"] == "飲食店"].iloc[0]
        assert food["verdict"] == "均衡状態"


# ===========================================================================
# CI102 教科書 Activity 4-1〜4-5 の正確なデータによる検証
# （Orlando, FL MSA — p.206-209）
# ===========================================================================

class TestOrlandoMSA_Activity4_1:
    """Activity 4-1: 全16産業の LQ を教科書の値と比較。"""

    TOTAL_LOCAL = 1_050_091
    TOTAL_NATIONAL = 142_795_200

    @pytest.mark.parametrize(
        "local_emp, national_emp, expected_lq",
        [
            (61_673, 7_269_400, 1.1537),       # Construction
            (111_735, 8_723_700, 1.7417),       # Financial Activities
            (171_246, 13_326_700, 1.7474),      # Leisure and Hospitality
            (61_349, 5_555_100, 1.5018),        # Transportation
            (201_785, 20_245_700, 1.3553),      # Professional
            (20_254, 2_694_400, 1.0222),        # Information
            (54_176, 6_048_800, 1.2179),        # Other Services
            (38_232, 12_179_100, 0.4269),       # Manufacturing (non-basic)
            (1_262, 573_100, 0.2994),           # Natural Resources (non-basic)
            (93_527, 14_853_100, 0.8563),       # Retail Trade (non-basic)
        ],
        ids=[
            "Construction", "Financial", "Leisure", "Transportation",
            "Professional", "Information", "OtherServices",
            "Manufacturing", "NaturalResources", "RetailTrade",
        ],
    )
    def test_lq_values(self, local_emp, national_emp, expected_lq):
        lq = location_quotient(
            local_emp, self.TOTAL_LOCAL, national_emp, self.TOTAL_NATIONAL
        )
        assert lq == pytest.approx(expected_lq, abs=0.001)


class TestOrlandoMSA_Activity4_2:
    """Activity 4-2: 基盤雇用の算出。"""

    @pytest.mark.parametrize(
        "local_emp, lq, expected_basic",
        [
            (61_673, 1.1537, 8_215),        # Construction
            (61_349, 1.5018, 20_498),        # Transportation
            (20_254, 1.0222, 440),           # Information
            (111_735, 1.7417, 47_582),       # Financial
            (201_785, 1.3553, 52_902),       # Professional
            (171_246, 1.7474, 73_244),       # Leisure
            (54_176, 1.2179, 9_694),         # Other Services
        ],
        ids=[
            "Construction", "Transportation", "Information",
            "Financial", "Professional", "Leisure", "OtherServices",
        ],
    )
    def test_basic_employment(self, local_emp, lq, expected_basic):
        basic = local_emp * (1 - 1 / lq)
        assert basic == pytest.approx(expected_basic, abs=50)

    def test_total_basic_from_lq_table(
        self, orlando_local_employment, orlando_national_employment
    ):
        """lq_table() の総基盤雇用 = 212,575"""
        df = lq_table(orlando_local_employment, orlando_national_employment)
        assert total_basic_employment(df) == pytest.approx(212_575, abs=200)

    def test_seven_basic_industries_identified(
        self, orlando_local_employment, orlando_national_employment
    ):
        """LQ > 1.0 の基盤産業は正しく 7 つ。"""
        df = lq_table(orlando_local_employment, orlando_national_employment)
        basic_industries = set(df[df["lq"] > 1.0]["industry"])
        expected = {
            "Construction", "Transportation and Warehousing",
            "Information", "Financial Activities",
            "Professional and Business Services",
            "Leisure and Hospitality", "Other Services",
        }
        assert basic_industries == expected


class TestOrlandoMSA_Activity4_3:
    """Activity 4-3: EBM = 1,050,091 / 212,575 = 4.94"""

    def test_ebm(self):
        ebm = economic_base_multiplier(1_050_091, 212_575)
        assert ebm == pytest.approx(4.94, abs=0.01)


class TestOrlandoMSA_Activity4_4:
    """Activity 4-4: PER = 2,002,000 / 1,050,091 = 1.91"""

    def test_per(self):
        per = population_employment_ratio(2_002_000, 1_050_091)
        assert per == pytest.approx(1.91, abs=0.01)


class TestOrlandoMSA_Activity4_5:
    """Activity 4-5: 需要予測カスケード。"""

    def test_forecast_total_employment(self):
        """3,000 x 4.94 = 14,820"""
        assert forecast_total_employment_change(3_000, 4.94) == pytest.approx(14_820, abs=1)

    def test_forecast_population(self):
        """14,820 x 1.91 = 28,306.2"""
        assert forecast_population_change(14_820, 1.91) == pytest.approx(28_306.2, abs=1)

    def test_full_cascade(self):
        """基盤雇用 3,000 → 総雇用 14,820 → 人口 28,306"""
        total_emp = forecast_total_employment_change(3_000, 4.94)
        pop = forecast_population_change(total_emp, 1.91)
        assert total_emp == pytest.approx(14_820, abs=1)
        assert pop == pytest.approx(28_306.2, abs=1)


# ===========================================================================
# Self-Assessment 1b: Denver MSA（p.211）
# ===========================================================================

class TestDenverMSA:
    """Denver MSA Professional and Business Services: BE = 47,418"""

    def test_denver_lq(self):
        lq = location_quotient(202_639, 1_006_879, 16_489_216, 106_946_360)
        assert lq == pytest.approx(1.3054, abs=0.001)

    def test_denver_basic_employment(self):
        lq = location_quotient(202_639, 1_006_879, 16_489_216, 106_946_360)
        basic = 202_639 * (1 - 1 / lq)
        assert basic == pytest.approx(47_418, abs=50)


# ===========================================================================
# Self-Assessment 3: Baton Rouge シフトシェア分析（p.212-213）
# ===========================================================================

class TestBatonRougeShiftShare:
    """教科書の Baton Rouge データで 3 要因分解の合計を検証。"""

    def test_national_growth_total(
        self, baton_rouge_local_t0, baton_rouge_local_t1,
        baton_rouge_national_t0, baton_rouge_national_t1,
    ):
        """National Growth Net Share 合計 = 9,374"""
        df = shift_share_table(
            baton_rouge_local_t0, baton_rouge_local_t1,
            baton_rouge_national_t0, baton_rouge_national_t1,
        )
        assert df["national_growth"].sum() == pytest.approx(9_374, abs=50)

    def test_industry_mix_total(
        self, baton_rouge_local_t0, baton_rouge_local_t1,
        baton_rouge_national_t0, baton_rouge_national_t1,
    ):
        """Industry Mix Net Share 合計 = 2,111"""
        df = shift_share_table(
            baton_rouge_local_t0, baton_rouge_local_t1,
            baton_rouge_national_t0, baton_rouge_national_t1,
        )
        assert df["industry_mix"].sum() == pytest.approx(2_111, abs=100)

    def test_regional_shift_total(
        self, baton_rouge_local_t0, baton_rouge_local_t1,
        baton_rouge_national_t0, baton_rouge_national_t1,
    ):
        """Regional Shift Net Share 合計 = 8,676"""
        df = shift_share_table(
            baton_rouge_local_t0, baton_rouge_local_t1,
            baton_rouge_national_t0, baton_rouge_national_t1,
        )
        assert df["regional_shift"].sum() == pytest.approx(8_676, abs=100)

    def test_actual_change_total(
        self, baton_rouge_local_t0, baton_rouge_local_t1,
        baton_rouge_national_t0, baton_rouge_national_t1,
    ):
        """Baton Rouge 全体の雇用変動 = 20,161"""
        df = shift_share_table(
            baton_rouge_local_t0, baton_rouge_local_t1,
            baton_rouge_national_t0, baton_rouge_national_t1,
        )
        assert df["actual_change"].sum() == pytest.approx(20_161, abs=10)

    def test_decomposition_identity(
        self, baton_rouge_local_t0, baton_rouge_local_t1,
        baton_rouge_national_t0, baton_rouge_national_t1,
    ):
        """全産業で NS + IM + RS = Actual Change が成立（恒等式）。"""
        df = shift_share_table(
            baton_rouge_local_t0, baton_rouge_local_t1,
            baton_rouge_national_t0, baton_rouge_national_t1,
        )
        for _, row in df.iterrows():
            computed = row["national_growth"] + row["industry_mix"] + row["regional_shift"]
            assert computed == pytest.approx(row["actual_change"], abs=1), (
                f"{row['industry']}: NS+IM+RS={computed:.0f} != actual={row['actual_change']:.0f}"
            )

    def test_education_health_regional_shift(
        self, baton_rouge_local_t0, baton_rouge_local_t1,
        baton_rouge_national_t0, baton_rouge_national_t1,
    ):
        """Education and Health の Regional Shift = 7,741"""
        df = shift_share_table(
            baton_rouge_local_t0, baton_rouge_local_t1,
            baton_rouge_national_t0, baton_rouge_national_t1,
        )
        edu_row = df[df["industry"] == "Education and Health Services"]
        assert len(edu_row) == 1
        assert edu_row.iloc[0]["regional_shift"] == pytest.approx(7_741, abs=50)
