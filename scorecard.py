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

    # Commute distortion flag — geographic mismatch detection
    # 経済センサスは事業所所在地、国勢調査は居住地。単独自治体だと
    # 通勤流入（千代田区など）や流出（横浜・神戸など）で歪む。
    # "balanced" | "inflow" | "outflow"
    commute_distortion: str = "balanced"
    emp_to_pop_ratio: float = 0.0  # 総雇用/人口

    # Mid-classification (95業種) — 業種粒度を細かくした補正版
    # 大分類17業種では LQ>1.0 の産業が少なく基盤雇用が過小評価されるため、
    # 中分類で再計算した参考値を並置する（Mulligan & Murphy 1995 の凸性質）。
    # データなし時は None。
    ebm_mid: Optional[float] = None
    basic_ratio_mid: Optional[float] = None
    basic_emp_mid: Optional[float] = None
    n_basic_industries_mid: Optional[int] = None
    top_lq_industries_mid: list[dict] = field(default_factory=list)


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

    # --- Mid-classification (中分類95業種) recompute ---
    # 業種粒度を細かくすることで隠れた特化産業を捉え、基盤雇用過小評価を補正
    ebm_mid = None
    basic_ratio_mid = None
    basic_emp_mid = None
    n_basic_mid = None
    top_lq_mid = []
    try:
        from config import get_settings
        from data.census_cache import (
            DS_EMPLOYMENT_MID, load_cached_dataset,
            get_area_employment_mid,
        )
        settings = get_settings()
        df_mid = load_cached_dataset(settings.cache_dir, DS_EMPLOYMENT_MID.csv_name)
        if df_mid is not None:
            area_code = accessor._build_area_code(pref_code, city_code)
            local_mid = get_area_employment_mid(df_mid, area_code)
            national_mid = get_area_employment_mid(df_mid, "00000")
            if local_mid and national_mid:
                df_lq_mid = lq_table(local_mid, national_mid)
                basic_mid = total_basic_employment(df_lq_mid)
                total_mid = float(df_lq_mid["local_emp"].sum())
                if total_mid > 0 and basic_mid > 0:
                    ebm_mid = total_mid / basic_mid
                    basic_ratio_mid = basic_mid / total_mid * 100
                    basic_emp_mid = basic_mid
                    n_basic_mid = int((df_lq_mid["lq"] > 1.0).sum())
                    top_lq_mid = (
                        df_lq_mid[df_lq_mid["lq"] > 1.0]
                        .nlargest(10, "basic_emp_estimate")
                        [["industry", "lq", "basic_emp_estimate"]]
                        .to_dict("records")
                    )
    except Exception:
        pass

    # --- Commute distortion detection ---
    # CI102のMSA前提では PER ≈ 1.7-2.0 / EBM ≈ 3-6 が健全レンジ。
    # 日本の単独市町村ではこれを外れることが多く、解釈に注意が必要。
    pop_basic = float(basics.get("population", 0))
    emp_to_pop = (total_emp / pop_basic) if pop_basic > 0 else 0.0
    if per > 0 and per < 1.2:
        # 人口より雇用が多い（PER<1.2 = 雇用/人口 > 83%） = 通勤流入で事業所が膨張
        commute_distortion = "inflow"
    elif ebm > 8.0 and basic_ratio < 12.0:
        # EBM が教科書範囲を大きく超え、基盤雇用比率が極端に低い
        # = 市内に基盤産業が乏しい（住居機能優位 = ベッドタウン）
        commute_distortion = "outflow"
    else:
        commute_distortion = "balanced"

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
        commute_distortion=commute_distortion,
        emp_to_pop_ratio=emp_to_pop,
        ebm_mid=ebm_mid,
        basic_ratio_mid=basic_ratio_mid,
        basic_emp_mid=basic_emp_mid,
        n_basic_industries_mid=n_basic_mid,
        top_lq_industries_mid=top_lq_mid,
    )


def generate_insights(sc: ScorecardData) -> list[dict]:
    """Generate auto-insights based on threshold rules.

    Returns list of {level: 'success'|'warning'|'info', text: str}.
    """
    insights: list[dict] = []

    # Commute distortion warning — geographic mismatch in single-municipality analysis
    # CI102のMSA前提と日本の市町村単位の不整合を明示する
    if sc.commute_distortion == "inflow":
        insights.append({
            "level": "warning",
            "text": (
                f"⚠️ 通勤流入による数値膨張: 雇用/人口 = {sc.emp_to_pop_ratio*100:.0f}%（PER {sc.per:.2f}）。"
                "e-Stat経済センサスは事業所所在地ベースのため、通勤者が雇用に算入され、"
                "EBM・基盤雇用・基盤雇用比率が住民あたりで見ると過大になります。"
                "CI102の本来の分析単位はMSA（経済圏）です。判断には都道府県全体や"
                "近隣市町村を合算した経済圏での再評価を推奨します。"
            ),
        })
    elif sc.commute_distortion == "outflow":
        insights.append({
            "level": "warning",
            "text": (
                f"⚠️ ベッドタウン特性: 雇用/人口 = {sc.emp_to_pop_ratio*100:.0f}%（PER {sc.per:.2f}）。"
                "住民の多くが都心へ通勤しており、市内事業所での雇用が薄いため、"
                "EBM が異常に大きく（{:.1f}倍）、基盤雇用比率が極めて低く出ています。"
                "都市圏全体（例: 東京圏・京阪神圏）での再評価を推奨します。"
            ).format(sc.ebm),
        })

    # 中分類版との比較で「業種粒度による基盤雇用過小評価」を可視化
    if sc.ebm_mid is not None and sc.basic_ratio_mid is not None:
        delta_ratio = sc.basic_ratio_mid - sc.basic_ratio
        if delta_ratio >= 5.0:
            insights.append({
                "level": "info",
                "text": (
                    f"💡 業種粒度補正: 大分類17業種 → 中分類95業種で再計算すると、"
                    f"基盤雇用比率は {sc.basic_ratio:.1f}% → {sc.basic_ratio_mid:.1f}%（+{delta_ratio:.1f}pt）、"
                    f"EBM は {sc.ebm:.2f} → {sc.ebm_mid:.2f} に変化。"
                    f"基盤産業数は {len(sc.top_lq_industries)}超 → {sc.n_basic_industries_mid} 業種へ。"
                    "細かい特化産業（例: 情報サービス業、機械器具卸売業）が大分類では"
                    "『卸売・小売』『情報通信』に埋もれて見えなくなっていることが原因です。"
                ),
            })

    # EBM thresholds — 正しい解釈
    # 数学的恒等式: EBM = 1 / 基盤雇用比率
    # 教科書 Orlando MSA: EBM 4.94 = 基盤雇用比率 20.2%
    # 全国市区町村中央値: EBM 4.99 = 基盤雇用比率 20.0%（大分類17業種計算）
    #
    # 健全レンジ: EBM 3-6 = 基盤雇用比率 17-33%（産業多角化＋輸出基盤バランス）
    # EBM > 8: 基盤雇用比率 < 12%。基盤が薄いため見かけ上の乗数が膨張
    # EBM < 2.5: 基盤過大。極端な特化 or 集計範囲が広すぎる可能性
    if 3.0 <= sc.ebm <= 6.0:
        insights.append({
            "level": "success",
            "text": (
                f"経済基盤乗数 EBM = {sc.ebm:.2f} — 教科書のMSA健全レンジ（3〜6）内。"
                "産業構造が適度に多角化し、輸出基盤と域内サービスのバランスが取れています。"
                "（参考: Orlando MSA = 4.94 / 全国市区町村中央値 = 4.99）"
            ),
        })
    elif sc.ebm > 8.0:
        insights.append({
            "level": "warning",
            "text": (
                f"経済基盤乗数 EBM = {sc.ebm:.2f} は教科書範囲（3〜6）を超えています。"
                f"これは基盤雇用比率 {sc.basic_ratio:.1f}% と低く、分母が小さいため乗数が"
                "機械的に膨張している状態です。**「EBMが大きい＝経済が強い」ではなく** "
                "「基盤産業が薄い」サインとして読みます。"
                "原因: ①業種粒度が荒く特化産業を捉えきれていない、"
                "②自治体境界が経済圏と不一致（通勤流出/流入）、"
                "③日本の産業構造（東京一極集中）。"
            ),
        })
    elif sc.ebm < 2.5 and sc.ebm > 0:
        insights.append({
            "level": "warning",
            "text": (
                f"経済基盤乗数 EBM = {sc.ebm:.2f} は教科書範囲（3〜6）を下回ります。"
                f"基盤雇用比率 {sc.basic_ratio:.1f}% と高すぎ、過度な産業特化または"
                "集計範囲が広すぎて多くの産業が『基盤』判定されている可能性。"
            ),
        })

    # Basic ratio — 教科書 Orlando 基盤雇用比率 20.2% を基準にする
    if sc.basic_ratio < 8.0:
        insights.append({
            "level": "warning",
            "text": (
                f"基盤雇用比率 {sc.basic_ratio:.1f}% — 教科書MSA健全レンジ（15〜25%）を"
                "下回ります。輸出基盤が弱く、外部から資金を呼び込む産業が限定的です。"
                "（注: 業種大分類17のみでの計算のため、中分類で再計算すれば"
                "細かい特化産業が見えて基盤雇用が増える可能性があります）"
            ),
        })
    elif 15.0 <= sc.basic_ratio <= 30.0:
        insights.append({
            "level": "success",
            "text": (
                f"基盤雇用比率 {sc.basic_ratio:.1f}% — 教科書MSA健全レンジ（15〜30%）内。"
                "輸出基盤と域内サービスのバランスが取れた経済構造です。"
                "（参考: Orlando MSA = 20.2% / 全国市区町村中央値 = 20.0%）"
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
