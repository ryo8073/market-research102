"""テスト共通フィクスチャ。

CI102 教科書のデータを正確に再現する。
"""
from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# Orlando MSA データ（Activity 4-1 〜 4-5, p.206-209）
# 教科書の正確な数値を使用
# ---------------------------------------------------------------------------
@pytest.fixture
def orlando_local_employment() -> dict[str, float]:
    """Orlando, FL MSA の産業別雇用者数。"""
    return {
        "Natural Resources and Mining": 1_262,
        "Construction": 61_673,
        "Manufacturing": 38_232,
        "Wholesale Trade": 35_328,
        "Retail Trade": 93_527,
        "Transportation and Warehousing": 61_349,
        "Utilities": 749,
        "Information": 20_254,
        "Financial Activities": 111_735,
        "Professional and Business Services": 201_785,
        "Education and Health Services": 114_227,
        "Leisure and Hospitality": 171_246,
        "Other Services": 54_176,
        "Federal Government": 15_585,
        "State Government": 20_650,
        "Local Government": 48_313,
    }


@pytest.fixture
def orlando_national_employment() -> dict[str, float]:
    """全米の産業別雇用者数。"""
    return {
        "Natural Resources and Mining": 573_100,
        "Construction": 7_269_400,
        "Manufacturing": 12_179_100,
        "Wholesale Trade": 5_639_800,
        "Retail Trade": 14_853_100,
        "Transportation and Warehousing": 5_555_100,
        "Utilities": 541_900,
        "Information": 2_694_400,
        "Financial Activities": 8_723_700,
        "Professional and Business Services": 20_245_700,
        "Education and Health Services": 23_235_600,
        "Leisure and Hospitality": 13_326_700,
        "Other Services": 6_048_800,
        "Federal Government": 2_929_000,
        "State Government": 5_002_128,
        "Local Government": 13_977_672,
    }


@pytest.fixture
def orlando_total_local() -> float:
    return 1_050_091.0


@pytest.fixture
def orlando_total_national() -> float:
    return 142_795_200.0


@pytest.fixture
def orlando_population() -> float:
    return 2_002_000.0


# ---------------------------------------------------------------------------
# Baton Rouge シフトシェアデータ（Self-Assessment, p.212-213）
# ---------------------------------------------------------------------------
@pytest.fixture
def baton_rouge_local_t0() -> dict[str, float]:
    """Baton Rouge Base Year 雇用。"""
    return {
        "Natural Resources and Mining": 2_453,
        "Construction": 35_277,
        "Manufacturing": 29_989,
        "Trade, Transportation, and Utilities": 65_853,
        "Information": 5_155,
        "Financial Activities": 16_237,
        "Professional and Business Services": 39_755,
        "Education and Health Services": 30_434,
        "Leisure and Hospitality": 28_341,
        "Other Services": 10_309,
        "Unclassified": 0,
    }


@pytest.fixture
def baton_rouge_local_t1() -> dict[str, float]:
    """Baton Rouge Current Year 雇用。"""
    return {
        "Natural Resources and Mining": 2_041,
        "Construction": 40_605,
        "Manufacturing": 25_123,
        "Trade, Transportation, and Utilities": 64_230,
        "Information": 5_520,
        "Financial Activities": 16_526,
        "Professional and Business Services": 42_796,
        "Education and Health Services": 44_537,
        "Leisure and Hospitality": 32_836,
        "Other Services": 9_750,
        "Unclassified": 0,
    }


@pytest.fixture
def baton_rouge_national_t0() -> dict[str, float]:
    """全米 Base Year 雇用。"""
    return {
        "Natural Resources and Mining": 1_705_759,
        "Construction": 6_773_512,
        "Manufacturing": 16_386_001,
        "Trade, Transportation, and Utilities": 25_648_091,
        "Information": 3_591_995,
        "Financial Activities": 7_678_974,
        "Professional and Business Services": 16_324_890,
        "Education and Health Services": 14_849_666,
        "Leisure and Hospitality": 11_884_966,
        "Other Services": 4_206_345,
        "Unclassified": 254_603,
    }


@pytest.fixture
def baton_rouge_national_t1() -> dict[str, float]:
    """全米 Current Year 雇用。"""
    return {
        "Natural Resources and Mining": 1_882_426,
        "Construction": 7_124_886,
        "Manufacturing": 13_382_697,
        "Trade, Transportation, and Utilities": 26_092_799,
        "Information": 2_989_161,
        "Financial Activities": 7_968_376,
        "Professional and Business Services": 17_705_280,
        "Education and Health Services": 17_954_103,
        "Leisure and Hospitality": 13_395_477,
        "Other Services": 4_484_907,
        "Unclassified": 208_532,
    }
