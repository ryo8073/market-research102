"""Investment scorecard — aggregate all CI102 metrics into a single view."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import pandas as pd

from calculator import (
    economic_base_multiplier,
    forecast_housing_units,
    forecast_population_change,
    forecast_total_employment_change,
    gap_analysis_table,
    investment_suitability_score,
    lq_table,
    population_employment_ratio,
    shift_share_table,
    total_basic_employment,
)


@dataclass
class ScorecardData:
    """All CI102 metrics for the selected area, aggregated for display."""

    area_name: str
    population: int
    households: int
    total_employment: int

    # LQ / Economic Base
    ebm: float
    per: float
    basic_emp: float
    basic_ratio: float  # percentage
    top_lq_industries: list[dict] = field(default_factory=list)

    # Shift-Share
    rs_total: float = 0.0
    top_rs_industry: str = ""
    top_rs_value: float = 0.0
    ss_df: Optional[pd.DataFrame] = None

    # Retail Gap
    aggregate_gap_factor: float = 0.0
    num_leakage_sectors: int = 0
    num_surplus_sectors: int = 0
    gap_df: Optional[pd.DataFrame] = None

    # MLIT
    median_unit_price: Optional[float] = None  # yen / m2

    # Investment suitability score (0-100)
    suitability_score: Optional[dict] = None

    # Actual trends (shift-share period: 2016→2021)
    actual_emp_change: float = 0.0  # total employment change
    new_basic_jobs_assumption: int = 0  # sidebar input value (for context)

    # Simulation results (IF new_basic_jobs are added — NOT predictions)
    total_emp_forecast: float = 0.0
    population_forecast: float = 0.0
    housing_demand: float = 0.0


def build_scorecard(
    accessor,
    pref_code: int,
    city_code: int,
    basics: dict,
    new_basic_jobs: int,
    persons_per_household: float,
    area_name: str,
) -> ScorecardData:
    """Aggregate all analysis results into a single scorecard.

    Calls existing accessor methods and calculator functions.
    """
    # --- LQ / Economic Base ---
    local_emp, national_emp, _ = accessor.industry_employment(pref_code, city_code)
    df_lq = lq_table(local_emp, national_emp)
    basic_total = total_basic_employment(df_lq)
    total_emp = float(df_lq["local_emp"].sum())
    if total_emp <= 0:
        total_emp = float(basics.get("total_employment", 1))

    ebm = economic_base_multiplier(total_emp, basic_total)
    per = population_employment_ratio(basics["population"], basics["total_employment"])

    basic_ratio = (basic_total / total_emp * 100) if total_emp > 0 else 0.0

    top_lq = (
        df_lq[df_lq["lq"] > 1.0]
        .nlargest(5, "lq")
        [["industry", "lq", "basic_emp_estimate"]]
        .to_dict("records")
    )

    # --- Shift-Share ---
    rs_total = 0.0
    top_rs_industry = ""
    top_rs_value = 0.0
    actual_emp_change = 0.0
    ss_df = None
    try:
        l0, l1, n0, n1, _ = accessor.shift_share_inputs(pref_code, city_code)
        ss_df = shift_share_table(l0, l1, n0, n1)
        if not ss_df.empty:
            rs_total = float(ss_df["regional_shift"].sum())
            actual_emp_change = float(ss_df["actual_change"].sum())
            best = ss_df.loc[ss_df["regional_shift"].idxmax()]
            top_rs_industry = str(best["industry"])
            top_rs_value = float(best["regional_shift"])
    except Exception:
        pass

    # --- Retail Gap ---
    aggregate_gap = 0.0
    n_leak = 0
    n_surplus = 0
    gap_df = None
    try:
        sectors, _ = accessor.retail_sectors(pref_code, city_code)
        gap_df = gap_analysis_table(sectors)
        if not gap_df.empty:
            total_demand = gap_df["demand"].sum()
            total_supply = gap_df["supply"].sum()
            if (total_demand + total_supply) > 0:
                aggregate_gap = (
                    (total_demand - total_supply) / (total_demand + total_supply) * 100
                )
            n_leak = int((gap_df["factor"] >= 10).sum())
            n_surplus = int((gap_df["factor"] <= -10).sum())
    except Exception:
        pass

    # --- MLIT median unit price ---
    median_price = None
    try:
        mlit_city = city_code if city_code and city_code % 1000 != 0 else None
        df_re = accessor.mlit.transaction_prices(
            year=2024, quarter=1, pref_code=pref_code, city_code=mlit_city,
        )
        if df_re is not None and not df_re.empty:
            prices = pd.to_numeric(df_re.get("UnitPrice", pd.Series()), errors="coerce")
            valid = prices[prices > 0]
            if not valid.empty:
                median_price = float(valid.median())
    except Exception:
        pass

    # --- Investment Suitability Score ---
    suit_score = investment_suitability_score(
        ebm=ebm,
        basic_ratio=basic_ratio,
        rs_total=rs_total,
        gap_factor=aggregate_gap,
        total_emp=total_emp,
    )

    # --- Forecasts ---
    delta_total = forecast_total_employment_change(new_basic_jobs, ebm)
    delta_pop = forecast_population_change(delta_total, per)
    delta_housing = forecast_housing_units(delta_pop, persons_per_household)

    return ScorecardData(
        area_name=area_name,
        population=basics["population"],
        households=basics["households"],
        total_employment=basics["total_employment"],
        ebm=ebm,
        per=per,
        basic_emp=basic_total,
        basic_ratio=basic_ratio,
        top_lq_industries=top_lq,
        rs_total=rs_total,
        top_rs_industry=top_rs_industry,
        top_rs_value=top_rs_value,
        ss_df=ss_df,
        aggregate_gap_factor=aggregate_gap,
        num_leakage_sectors=n_leak,
        num_surplus_sectors=n_surplus,
        gap_df=gap_df,
        median_unit_price=median_price,
        suitability_score=suit_score,
        actual_emp_change=actual_emp_change,
        new_basic_jobs_assumption=new_basic_jobs,
        total_emp_forecast=delta_total,
        population_forecast=delta_pop,
        housing_demand=delta_housing,
    )


def generate_insights(sc: ScorecardData) -> list[dict]:
    """Generate auto-insights based on threshold rules.

    Returns list of {level: 'success'|'warning'|'info', text: str}.
    """
    insights: list[dict] = []

    # EBM thresholds
    if sc.ebm >= 5.0:
        insights.append({
            "level": "success",
            "text": (
                f"経済基盤乗数 EBM = {sc.ebm:.2f} は非常に高い。"
                "基盤雇用1人の増減が地域経済に大きく波及します。"
            ),
        })
    elif sc.ebm < 2.0:
        insights.append({
            "level": "warning",
            "text": (
                f"経済基盤乗数 EBM = {sc.ebm:.2f} は低め。"
                "非基盤部門が小さく、雇用増の波及効果が限定的です。"
            ),
        })

    # Basic ratio
    if sc.basic_ratio < 5.0:
        insights.append({
            "level": "warning",
            "text": (
                f"基盤雇用比率 {sc.basic_ratio:.1f}% — "
                "域外から資金を呼び込む輸出基盤が弱い地域です。"
            ),
        })
    elif sc.basic_ratio >= 20.0:
        insights.append({
            "level": "success",
            "text": (
                f"基盤雇用比率 {sc.basic_ratio:.1f}% — "
                "強い輸出基盤を持ち、外部資金が安定的に流入しています。"
            ),
        })

    # Top LQ concentration risk
    if sc.top_lq_industries:
        top = sc.top_lq_industries[0]
        if top["lq"] > 3.0 and len(sc.top_lq_industries) <= 2:
            insights.append({
                "level": "warning",
                "text": (
                    f"LQ上位が {top['industry']}（LQ={top['lq']:.2f}）に集中。"
                    "一極集中リスクに注意してください。"
                ),
            })

    # Shift-Share RS
    if sc.rs_total > 0:
        insights.append({
            "level": "success",
            "text": (
                f"地域シフト(RS)合計 = {sc.rs_total:+,.0f}人 — "
                f"全国平均を上回る競争優位。"
                f"牽引産業: {sc.top_rs_industry}（RS={sc.top_rs_value:+,.0f}）"
            ),
        })
    elif sc.rs_total < 0:
        insights.append({
            "level": "warning",
            "text": (
                f"地域シフト(RS)合計 = {sc.rs_total:+,.0f}人 — "
                "全国の同産業と比べ雇用が減少傾向。競争力の低下に注意。"
            ),
        })

    # Retail gap
    if sc.aggregate_gap_factor >= 10:
        insights.append({
            "level": "success",
            "text": (
                f"小売漏損係数 +{sc.aggregate_gap_factor:.1f} — "
                f"購買力が域外に流出中。{sc.num_leakage_sectors}セクターに出店機会あり。"
            ),
        })
    elif sc.aggregate_gap_factor <= -10:
        insights.append({
            "level": "warning",
            "text": (
                f"小売余剰係数 {sc.aggregate_gap_factor:.1f} — "
                f"供給過多。{sc.num_surplus_sectors}セクターが競争過多状態。"
            ),
        })

    # MLIT availability
    if sc.median_unit_price is None:
        insights.append({
            "level": "info",
            "text": "MLIT取引価格データが取得できませんでした（APIキー未設定または対象期間にデータなし）。",
        })

    return insights
