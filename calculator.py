"""CCIM CI102 市場分析の中核数理モデル。

純粋関数のみで構成し、データソース層と切り離してテスト可能にする。
ロードマップに記載の数式に厳密に従う:
  - LQ (Location Quotient / 特化係数)
  - EBM (Economic Base Multiplier / 経済基盤乗数)
  - PER (Population to Employment Ratio / 人口雇用比率)
  - Shift-Share Analysis (シフトシェア分析)
  - Gap Analysis (Leakage / Surplus Factor / 漏出余剰係数)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

import pandas as pd


# ---------------------------------------------------------------------------
# 1. Location Quotient (特化係数 LQ)
# ---------------------------------------------------------------------------

def location_quotient(
    local_industry_emp: float,
    local_total_emp: float,
    national_industry_emp: float,
    national_total_emp: float,
) -> float:
    """LQ = (e_i / e) / (E_i / E)

    1.0 を超えると地域がその産業に特化していることを示す。
    分母が0の場合は 0.0 を返す（演算エラー回避）。
    """
    if local_total_emp <= 0 or national_industry_emp <= 0 or national_total_emp <= 0:
        return 0.0
    local_share = local_industry_emp / local_total_emp
    national_share = national_industry_emp / national_total_emp
    if national_share == 0:
        return 0.0
    return local_share / national_share


def lq_table(
    local: Mapping[str, float],
    national: Mapping[str, float],
) -> pd.DataFrame:
    """産業別の従業者数 dict から LQ テーブルを構築する。

    Parameters
    ----------
    local : 産業コード/名 -> 地域従業者数
    national : 産業コード/名 -> 全国従業者数

    Returns
    -------
    pd.DataFrame
        columns: industry, local_emp, national_emp, lq, basic_emp_estimate
        basic_emp_estimate は LQ>1.0 の産業について
        local_industry_emp * (1 - 1/LQ) で算出した基盤雇用推計値。
    """
    local_total = sum(local.values())
    national_total = sum(national.values())
    rows = []
    for industry, l_emp in local.items():
        n_emp = national.get(industry, 0.0)
        lq = location_quotient(l_emp, local_total, n_emp, national_total)
        basic = l_emp * (1 - 1 / lq) if lq > 1.0 else 0.0
        rows.append(
            {
                "industry": industry,
                "local_emp": l_emp,
                "national_emp": n_emp,
                "lq": lq,
                "basic_emp_estimate": basic,
            }
        )
    df = pd.DataFrame(rows)
    return df.sort_values("lq", ascending=False).reset_index(drop=True)


def total_basic_employment(lq_df: pd.DataFrame) -> float:
    """LQ>1.0 の超過分から算出した総基盤雇用。

    lq_table() の出力を入力に取る。
    """
    return float(lq_df["basic_emp_estimate"].sum())


# ---------------------------------------------------------------------------
# 2. Economic Base Multiplier (経済基盤乗数 EBM)
# ---------------------------------------------------------------------------

def economic_base_multiplier(total_emp: float, basic_emp: float) -> float:
    """EBM = Total Employment / Basic Employment

    基盤雇用1単位あたりが地域経済全体で支える総雇用数。
    Gwinnett County 例: 541,584 / 108,974 ≈ 4.97
    """
    if basic_emp <= 0:
        return 0.0
    return total_emp / basic_emp


def forecast_total_employment_change(basic_emp_change: float, ebm: float) -> float:
    """新規（または喪失）基盤雇用から総雇用変動を予測。"""
    return basic_emp_change * ebm


# ---------------------------------------------------------------------------
# 3. Population to Employment Ratio (人口雇用比率 PER)
# ---------------------------------------------------------------------------

def population_employment_ratio(population: float, total_emp: float) -> float:
    """PER = Total Population / Total Employment"""
    if total_emp <= 0:
        return 0.0
    return population / total_emp


def forecast_population_change(emp_change: float, per: float) -> float:
    """雇用変動 × PER で人口変動を予測。"""
    return emp_change * per


def forecast_housing_units(population_change: float, persons_per_household: float) -> float:
    """予測人口増 ÷ 平均世帯人員 = 新規必要住戸数。"""
    if persons_per_household <= 0:
        return 0.0
    return population_change / persons_per_household


# ---------------------------------------------------------------------------
# 4. Shift-Share Analysis (シフトシェア分析)
# ---------------------------------------------------------------------------

@dataclass
class ShiftShareResult:
    """シフトシェア分解結果。"""

    industry: str
    actual_change: float          # 実際の雇用変動 (e_i,t1 - e_i,t0)
    national_growth: float        # 国家成長要因 NS
    industry_mix: float           # 産業ミックス要因 IM
    regional_shift: float         # 地域シフト要因（競争要因）RS

    @property
    def total_share(self) -> float:
        return self.national_growth + self.industry_mix + self.regional_shift


def shift_share(
    local_emp_t0: float,
    local_emp_t1: float,
    national_industry_emp_t0: float,
    national_industry_emp_t1: float,
    national_total_emp_t0: float,
    national_total_emp_t1: float,
    industry: str = "",
) -> ShiftShareResult:
    """単一産業のシフトシェア分析。

    NS  = e_i,t0 * g_national
    IM  = e_i,t0 * (g_industry - g_national)
    RS  = e_i,t0 * (g_local - g_industry)
    """
    g_national = _growth(national_total_emp_t0, national_total_emp_t1)
    g_industry = _growth(national_industry_emp_t0, national_industry_emp_t1)
    g_local = _growth(local_emp_t0, local_emp_t1)

    ns = local_emp_t0 * g_national
    im = local_emp_t0 * (g_industry - g_national)
    rs = local_emp_t0 * (g_local - g_industry)
    return ShiftShareResult(
        industry=industry,
        actual_change=local_emp_t1 - local_emp_t0,
        national_growth=ns,
        industry_mix=im,
        regional_shift=rs,
    )


def _growth(t0: float, t1: float) -> float:
    if t0 <= 0:
        return 0.0
    return (t1 - t0) / t0


def shift_share_table(
    local_t0: Mapping[str, float],
    local_t1: Mapping[str, float],
    national_t0: Mapping[str, float],
    national_t1: Mapping[str, float],
) -> pd.DataFrame:
    """複数産業の一括シフトシェア分析。"""
    nt0 = sum(national_t0.values())
    nt1 = sum(national_t1.values())
    rows = []
    for industry, l0 in local_t0.items():
        l1 = local_t1.get(industry, 0.0)
        n0 = national_t0.get(industry, 0.0)
        n1 = national_t1.get(industry, 0.0)
        r = shift_share(l0, l1, n0, n1, nt0, nt1, industry=industry)
        rows.append(
            {
                "industry": r.industry,
                "actual_change": r.actual_change,
                "national_growth": r.national_growth,
                "industry_mix": r.industry_mix,
                "regional_shift": r.regional_shift,
                "total_share": r.total_share,
            }
        )
    return pd.DataFrame(rows).sort_values("regional_shift", ascending=False).reset_index(drop=True)


# ---------------------------------------------------------------------------
# 5. Gap Analysis (Leakage / Surplus Factor)
# ---------------------------------------------------------------------------

def leakage_surplus_factor(demand: float, supply: float) -> float:
    """漏出余剰係数。

    +100 (完全漏出: 売上ゼロ) 〜 -100 (完全余剰: 需要ゼロ)。
    Esri 定義に準拠:
        Factor = (Demand - Supply) / (Demand + Supply) * 100
    """
    if demand + supply <= 0:
        return 0.0
    return (demand - supply) / (demand + supply) * 100.0


def gap_analysis_table(
    sectors: Iterable[Mapping[str, float]],
) -> pd.DataFrame:
    """小売セクター別のギャップ分析。

    Parameters
    ----------
    sectors : iterable of dict
        各要素は {"sector": str, "demand": float, "supply": float} を持つ。

    Returns
    -------
    pd.DataFrame
        columns: sector, demand, supply, gap, factor, verdict
    """
    rows = []
    for s in sectors:
        sector = s["sector"]
        demand = float(s["demand"])
        supply = float(s["supply"])
        gap = demand - supply
        factor = leakage_surplus_factor(demand, supply)
        verdict = _verdict(factor)
        rows.append(
            {
                "sector": sector,
                "demand": demand,
                "supply": supply,
                "gap": gap,
                "factor": factor,
                "verdict": verdict,
            }
        )
    return pd.DataFrame(rows).sort_values("factor", ascending=False).reset_index(drop=True)


def _verdict(factor: float) -> str:
    """漏損/余剰の判定ラベル。

    CI102日本語テキストでは Leakage を「漏損」と訳している。
    「漏出」も同義で使われる。いずれも商圏外への購買力流出を意味する。
    """
    if factor >= 50:
        return "深刻な漏損（出店余地大）"
    if factor >= 10:
        return "漏損（出店余地あり）"
    if factor > -10:
        return "均衡状態"
    if factor > -50:
        return "余剰（競争過多）"
    return "深刻な余剰（飽和市場）"
