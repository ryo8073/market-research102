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


# ---------------------------------------------------------------------------
# Property Scale Conversion
# ---------------------------------------------------------------------------


def office_industrial_gap(
    local_emp: dict,
    national_emp: dict,
    population: float,
    national_population: float,
) -> list[dict]:
    """Estimate office/industrial demand gap by property type.

    Uses employment-based demand estimation:
    - Office demand: proportional to info-tech, finance, professional services workers
    - Warehouse demand: proportional to transport, wholesale workers
    - Retail demand: proportional to retail, food service workers
    - Factory demand: proportional to manufacturing workers

    Returns list of dicts with: property_type, local_emp, national_share,
    expected_emp (based on population share), gap, gap_pct
    """
    _PROPERTY_INDUSTRIES = {
        "オフィス": ["情報通信業", "金融業，保険業", "学術研究，専門・技術サービス業",
                    "不動産業，物品賃貸業"],
        "倉庫・物流": ["運輸業，郵便業", "卸売業，小売業"],
        "商業施設": ["宿泊業，飲食サービス業", "生活関連サービス業，娯楽業"],
        "工場・製造": ["製造業", "建設業"],
        "医療・福祉": ["医療，福祉"],
    }

    pop_share = population / national_population if national_population > 0 else 0

    results = []
    for prop_type, industries in _PROPERTY_INDUSTRIES.items():
        local_total = sum(local_emp.get(ind, 0) for ind in industries)
        national_total = sum(national_emp.get(ind, 0) for ind in industries)
        expected = national_total * pop_share
        gap = local_total - expected
        gap_pct = (gap / expected * 100) if expected > 0 else 0.0

        results.append({
            "property_type": prop_type,
            "local_emp": local_total,
            "expected_emp": expected,
            "gap": gap,
            "gap_pct": gap_pct,
        })

    return results


def investment_suitability_score(
    ebm: float,
    basic_ratio: float,
    rs_total: float,
    gap_factor: float,
    total_emp: float,
) -> dict:
    """Compute 0-100 investment suitability score from CI102 metrics.

    Weights: EBM(20%), basic_ratio(20%), RS(25%), gap(20%), scale(15%).
    Returns dict with total_score and component scores.

    EBMスコアは『教科書MSA健全レンジ 3-6 を最高点』とする山形関数。
    EBM>8 (基盤雇用が薄く分母小=機械的膨張) は減点。
    旧版 (EBM 10で満点) は『高EBM=経済強い』の誤解釈バグだったため修正。

    >>> result = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000)
    >>> 0 <= result['total_score'] <= 100
    True
    >>> # ベッドタウン例: EBM 11 (通勤流出) は満点にならない
    >>> bad = investment_suitability_score(11.0, 9.0, 0, 0, 500000)
    >>> good = investment_suitability_score(4.5, 22.0, 0, 0, 500000)
    >>> bad['ebm_score'] < good['ebm_score']
    True
    """

    def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
        return max(lo, min(hi, v))

    # EBM score: 山形関数 (教科書MSA レンジ 3-6 を最高点)
    #   EBM 3-6: 100点 (教科書 Orlando MSA 4.94 並み = 多角化健全)
    #   EBM 2 / 7: 80点
    #   EBM 1 / 9: 50点
    #   EBM <=0 or >=14: 0点
    # 数式: 中心 4.5、許容幅 ±1.5 で 100点、それ以遠は距離に応じて減点
    if 3.0 <= ebm <= 6.0:
        ebm_score = 100.0
    else:
        # 中心 4.5 からの距離。距離 1.5 までは100、それ以降は線形減衰
        dist = abs(ebm - 4.5)
        ebm_score = _clamp(100 - (dist - 1.5) * 20)

    # Basic ratio score: 教科書 Orlando MSA 20.2% を最高点とする山形
    #   15-25%: 100点 (教科書MSA 健全レンジ)
    #   10% / 30%: 80点
    #   5% / 35%: 50点
    #   <=2% or >=40%: 0点
    if 15.0 <= basic_ratio <= 25.0:
        ratio_score = 100.0
    else:
        dist = abs(basic_ratio - 20.0)
        ratio_score = _clamp(100 - (dist - 5.0) * 6)

    # RS score: -10000→0, 0→50, +10000→100
    rs_score = _clamp(50 + rs_total / 200)

    # Gap score: high leakage=good for commercial, surplus=bad
    # -50→0, 0→50, +50→100
    gap_score = _clamp(50 + gap_factor)

    # Scale score: larger employment base = more stable
    # 50K→30, 200K→70, 1M→100
    scale_score = _clamp(total_emp / 10_000)

    total = (
        ebm_score * 0.20
        + ratio_score * 0.20
        + rs_score * 0.25
        + gap_score * 0.20
        + scale_score * 0.15
    )

    return {
        "total_score": round(total, 1),
        "ebm_score": round(ebm_score, 1),
        "ratio_score": round(ratio_score, 1),
        "rs_score": round(rs_score, 1),
        "gap_score": round(gap_score, 1),
        "scale_score": round(scale_score, 1),
    }


def enhanced_investment_score(
    base_score: dict,
    flood_risk_pct: float = 0.0,
    num_stations: int = 0,
    daily_riders: int = 0,
    num_bus_stops: int = 0,
    pop_change_pct: float = 0.0,
) -> dict:
    """Extend investment suitability score with NLNI spatial data.

    Reweights: existing 5 components (75%) + disaster(10%) + accessibility(10%) + demographics(5%).
    Returns dict with all component scores.
    """
    def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
        return max(lo, min(hi, v))

    # Disaster score: lower flood exposure = higher score
    # 0%→100, 20%→60, 50%→25, 100%→0
    disaster_score = _clamp(100 - flood_risk_pct * 2)

    # Accessibility score: composite of rail + bus
    # Stations: 0→0, 10→40, 50→70, 200→100
    station_score = _clamp(num_stations / 2.0)
    # Ridership: 0→0, 50K→50, 500K→100
    rider_score = _clamp(daily_riders / 5000)
    # Bus: 0→0, 50→50, 200→100
    bus_score = _clamp(num_bus_stops / 2.0)
    accessibility_score = station_score * 0.4 + rider_score * 0.4 + bus_score * 0.2

    # Demographics score: population trend
    # -30%→0, 0%→50, +10%→100
    demographic_score = _clamp(50 + pop_change_pct * 2.5)

    # Reweight existing scores
    base_total = base_score["total_score"]
    total = (
        base_total * 0.75
        + disaster_score * 0.10
        + accessibility_score * 0.10
        + demographic_score * 0.05
    )

    result = dict(base_score)
    result["total_score"] = round(total, 1)
    result["disaster_score"] = round(disaster_score, 1)
    result["accessibility_score"] = round(accessibility_score, 1)
    result["demographic_score"] = round(demographic_score, 1)
    result["base_score"] = round(base_total, 1)
    return result


def estimate_daytime_population(
    nighttime_population: float,
    basic_employment: float,
) -> float:
    """Estimate daytime population using basic employment as commuter proxy.

    Daytime pop ≈ nighttime pop + basic employment (workers commuting in
    for export-oriented industries).

    >>> estimate_daytime_population(400000, 50000)
    450000.0
    """
    return nighttime_population + basic_employment


def development_feasibility(
    housing_demand: float,
    avg_unit_size_m2: float,
    land_price_per_m2: float,
    construction_cost_per_m2: float = 250_000,
    target_yield: float = 0.05,
) -> dict:
    """CI102 Front-door/Back-door feasibility analysis.

    Front-door (demand-side):
      Required floor area from housing demand.

    Back-door (supply-side):
      Maximum development cost vs achievable rent.

    Returns dict with front_door and back_door results.
    """
    # Front-door: demand -> required development scale
    required_area = housing_demand * avg_unit_size_m2
    total_dev_cost = required_area * (construction_cost_per_m2 + land_price_per_m2)
    required_annual_rent = total_dev_cost * target_yield

    # Back-door: target yield -> maximum affordable price
    monthly_rent_per_m2 = required_annual_rent / 12 / required_area if required_area > 0 else 0
    max_price_per_unit = (monthly_rent_per_m2 * 12 * avg_unit_size_m2) / target_yield if target_yield > 0 else 0

    return {
        "front_door": {
            "required_area_m2": round(required_area, 0),
            "total_dev_cost": round(total_dev_cost, 0),
            "required_annual_rent": round(required_annual_rent, 0),
        },
        "back_door": {
            "monthly_rent_per_m2": round(monthly_rent_per_m2, 0),
            "max_price_per_unit": round(max_price_per_unit, 0),
            "land_cost_ratio": round(
                land_price_per_m2 / (land_price_per_m2 + construction_cost_per_m2) * 100, 1
            ) if (land_price_per_m2 + construction_cost_per_m2) > 0 else 0,
        },
    }


def forecast_required_floor_area(
    housing_units: float,
    avg_unit_size_m2: float,
) -> float:
    """Forecast total required residential floor area in m2.

    >>> forecast_required_floor_area(100, 65.0)
    6500.0
    """
    return housing_units * avg_unit_size_m2


def forecast_building_count(
    housing_units: float,
    floors_per_building: int,
    units_per_floor: int,
) -> float:
    """Forecast number of buildings needed.

    >>> forecast_building_count(100, 5, 4)
    5.0
    """
    capacity = floors_per_building * units_per_floor
    if capacity <= 0:
        return 0.0
    return housing_units / capacity
