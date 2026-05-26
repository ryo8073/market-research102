/**
 * CCIM CI102 Market Analysis Core Mathematical Models.
 *
 * Pure functions only, decoupled from data source layer for testability.
 * Follows the formulas specified in the roadmap:
 *   - LQ (Location Quotient)
 *   - EBM (Economic Base Multiplier)
 *   - PER (Population to Employment Ratio)
 *   - Shift-Share Analysis
 *   - Gap Analysis (Leakage / Surplus Factor)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LQRow {
  industry: string;
  local_emp: number;
  national_emp: number;
  lq: number;
  basic_emp_estimate: number;
}

export interface ShiftShareResult {
  industry: string;
  actual_change: number;
  national_growth: number;
  industry_mix: number;
  regional_shift: number;
  total_share: number;
}

export interface GapRow {
  sector: string;
  demand: number;
  supply: number;
  gap: number;
  factor: number;
  verdict: string;
}

export interface OfficeIndustrialGapRow {
  property_type: string;
  local_emp: number;
  expected_emp: number;
  gap: number;
  gap_pct: number;
}

export interface InvestmentSuitabilityResult {
  total_score: number;
  ebm_score: number;
  ratio_score: number;
  rs_score: number;
  gap_score: number;
  scale_score: number;
}

export interface DevelopmentFeasibilityResult {
  front_door: {
    required_area_m2: number;
    total_dev_cost: number;
    required_annual_rent: number;
  };
  back_door: {
    monthly_rent_per_m2: number;
    max_price_per_unit: number;
    land_cost_ratio: number;
  };
}

// ---------------------------------------------------------------------------
// 1. Location Quotient (LQ)
// ---------------------------------------------------------------------------

/**
 * LQ = (e_i / e) / (E_i / E)
 *
 * Values above 1.0 indicate the region specializes in that industry.
 * Returns 0.0 when denominator is zero (division error guard).
 */
export function location_quotient(
  local_industry_emp: number,
  local_total_emp: number,
  national_industry_emp: number,
  national_total_emp: number,
): number {
  if (local_total_emp <= 0 || national_industry_emp <= 0 || national_total_emp <= 0) {
    return 0.0;
  }
  const local_share = local_industry_emp / local_total_emp;
  const national_share = national_industry_emp / national_total_emp;
  if (national_share === 0) {
    return 0.0;
  }
  return local_share / national_share;
}

/**
 * Build an LQ table from industry employment dicts.
 * Returns array sorted by LQ descending.
 */
export function lq_table(
  local: Record<string, number>,
  national: Record<string, number>,
): LQRow[] {
  const local_total = Object.values(local).reduce((a, b) => a + b, 0);
  const national_total = Object.values(national).reduce((a, b) => a + b, 0);
  const rows: LQRow[] = [];

  for (const [industry, l_emp] of Object.entries(local)) {
    const n_emp = national[industry] ?? 0.0;
    const lq = location_quotient(l_emp, local_total, n_emp, national_total);
    const basic = lq > 1.0 ? l_emp * (1 - 1 / lq) : 0.0;
    rows.push({
      industry,
      local_emp: l_emp,
      national_emp: n_emp,
      lq,
      basic_emp_estimate: basic,
    });
  }

  return rows.sort((a, b) => b.lq - a.lq);
}

/**
 * Total basic employment from LQ table output (sum of basic_emp_estimate).
 */
export function total_basic_employment(lq_rows: LQRow[]): number {
  return lq_rows.reduce((sum, row) => sum + row.basic_emp_estimate, 0);
}

// ---------------------------------------------------------------------------
// 2. Economic Base Multiplier (EBM)
// ---------------------------------------------------------------------------

/**
 * EBM = Total Employment / Basic Employment
 */
export function economic_base_multiplier(total_emp: number, basic_emp: number): number {
  if (basic_emp <= 0) {
    return 0.0;
  }
  return total_emp / basic_emp;
}

/**
 * Forecast total employment change from basic employment change and EBM.
 */
export function forecast_total_employment_change(basic_emp_change: number, ebm: number): number {
  return basic_emp_change * ebm;
}

// ---------------------------------------------------------------------------
// 3. Population to Employment Ratio (PER)
// ---------------------------------------------------------------------------

/**
 * PER = Total Population / Total Employment
 */
export function population_employment_ratio(population: number, total_emp: number): number {
  if (total_emp <= 0) {
    return 0.0;
  }
  return population / total_emp;
}

/**
 * Forecast population change from employment change and PER.
 */
export function forecast_population_change(emp_change: number, per: number): number {
  return emp_change * per;
}

/**
 * Forecast required housing units from population change and persons per household.
 */
export function forecast_housing_units(population_change: number, persons_per_household: number): number {
  if (persons_per_household <= 0) {
    return 0.0;
  }
  return population_change / persons_per_household;
}

// ---------------------------------------------------------------------------
// 4. Shift-Share Analysis
// ---------------------------------------------------------------------------

function _growth(t0: number, t1: number): number {
  if (t0 <= 0) {
    return 0.0;
  }
  return (t1 - t0) / t0;
}

/**
 * Single-industry shift-share analysis.
 *
 * NS  = e_i,t0 * g_national
 * IM  = e_i,t0 * (g_industry - g_national)
 * RS  = e_i,t0 * (g_local - g_industry)
 */
export function shift_share(
  local_emp_t0: number,
  local_emp_t1: number,
  national_industry_emp_t0: number,
  national_industry_emp_t1: number,
  national_total_emp_t0: number,
  national_total_emp_t1: number,
  industry: string = "",
): ShiftShareResult {
  const g_national = _growth(national_total_emp_t0, national_total_emp_t1);
  const g_industry = _growth(national_industry_emp_t0, national_industry_emp_t1);
  const g_local = _growth(local_emp_t0, local_emp_t1);

  const ns = local_emp_t0 * g_national;
  const im = local_emp_t0 * (g_industry - g_national);
  const rs = local_emp_t0 * (g_local - g_industry);

  return {
    industry,
    actual_change: local_emp_t1 - local_emp_t0,
    national_growth: ns,
    industry_mix: im,
    regional_shift: rs,
    total_share: ns + im + rs,
  };
}

/**
 * Multi-industry shift-share analysis. Returns array sorted by regional_shift descending.
 */
export function shift_share_table(
  local_t0: Record<string, number>,
  local_t1: Record<string, number>,
  national_t0: Record<string, number>,
  national_t1: Record<string, number>,
): ShiftShareResult[] {
  const nt0 = Object.values(national_t0).reduce((a, b) => a + b, 0);
  const nt1 = Object.values(national_t1).reduce((a, b) => a + b, 0);
  const rows: ShiftShareResult[] = [];

  for (const [industry, l0] of Object.entries(local_t0)) {
    const l1 = local_t1[industry] ?? 0.0;
    const n0 = national_t0[industry] ?? 0.0;
    const n1 = national_t1[industry] ?? 0.0;
    const r = shift_share(l0, l1, n0, n1, nt0, nt1, industry);
    rows.push(r);
  }

  return rows.sort((a, b) => b.regional_shift - a.regional_shift);
}

// ---------------------------------------------------------------------------
// 5. Gap Analysis (Leakage / Surplus Factor)
// ---------------------------------------------------------------------------

/**
 * Leakage/Surplus Factor.
 *
 * +100 (complete leakage: zero sales) to -100 (complete surplus: zero demand).
 * Esri definition: Factor = (Demand - Supply) / (Demand + Supply) * 100
 */
export function leakage_surplus_factor(demand: number, supply: number): number {
  if (demand + supply <= 0) {
    return 0.0;
  }
  return ((demand - supply) / (demand + supply)) * 100.0;
}

function _verdict(factor: number): string {
  if (factor >= 50) {
    return "\u6DF1\u523B\u306A\u6F0F\u640D\uFF08\u51FA\u5E97\u4F59\u5730\u5927\uFF09"; // 深刻な漏損（出店余地大）
  }
  if (factor >= 10) {
    return "\u6F0F\u640D\uFF08\u51FA\u5E97\u4F59\u5730\u3042\u308A\uFF09"; // 漏損（出店余地あり）
  }
  if (factor > -10) {
    return "\u5747\u8861\u72B6\u614B"; // 均衡状態
  }
  if (factor > -50) {
    return "\u4F59\u5270\uFF08\u7AF6\u4E89\u904E\u591A\uFF09"; // 余剰（競争過多）
  }
  return "\u6DF1\u523B\u306A\u4F59\u5270\uFF08\u98FD\u548C\u5E02\u5834\uFF09"; // 深刻な余剰（飽和市場）
}

/**
 * Gap analysis table for retail sectors.
 * Returns array sorted by factor descending.
 */
export function gap_analysis_table(
  sectors: Array<{ sector: string; demand: number; supply: number }>,
): GapRow[] {
  const rows: GapRow[] = [];

  for (const s of sectors) {
    const demand = Number(s.demand);
    const supply = Number(s.supply);
    const gap = demand - supply;
    const factor = leakage_surplus_factor(demand, supply);
    const verdict = _verdict(factor);
    rows.push({ sector: s.sector, demand, supply, gap, factor, verdict });
  }

  return rows.sort((a, b) => b.factor - a.factor);
}

// ---------------------------------------------------------------------------
// Property Scale Conversion
// ---------------------------------------------------------------------------

const _PROPERTY_INDUSTRIES: Record<string, string[]> = {
  "\u30AA\u30D5\u30A3\u30B9": ["\u60C5\u5831\u901A\u4FE1\u696D", "\u91D1\u878D\u696D\uFF0C\u4FDD\u967A\u696D", "\u5B66\u8853\u7814\u7A76\uFF0C\u5C02\u9580\u30FB\u6280\u8853\u30B5\u30FC\u30D3\u30B9\u696D", "\u4E0D\u52D5\u7523\u696D\uFF0C\u7269\u54C1\u8CC3\u8CB8\u696D"],
  "\u5009\u5EAB\u30FB\u7269\u6D41": ["\u904B\u8F38\u696D\uFF0C\u90F5\u4FBF\u696D", "\u5378\u58F2\u696D\uFF0C\u5C0F\u58F2\u696D"],
  "\u5546\u696D\u65BD\u8A2D": ["\u5BBF\u6CCA\u696D\uFF0C\u98F2\u98DF\u30B5\u30FC\u30D3\u30B9\u696D", "\u751F\u6D3B\u95A2\u9023\u30B5\u30FC\u30D3\u30B9\u696D\uFF0C\u5A2F\u697D\u696D"],
  "\u5DE5\u5834\u30FB\u88FD\u9020": ["\u88FD\u9020\u696D", "\u5EFA\u8A2D\u696D"],
  "\u533B\u7642\u30FB\u798F\u7949": ["\u533B\u7642\uFF0C\u798F\u7949"],
};

/**
 * Estimate office/industrial demand gap by property type.
 */
export function office_industrial_gap(
  local_emp: Record<string, number>,
  national_emp: Record<string, number>,
  population: number,
  national_population: number,
): OfficeIndustrialGapRow[] {
  const pop_share = national_population > 0 ? population / national_population : 0;
  const results: OfficeIndustrialGapRow[] = [];

  for (const [prop_type, industries] of Object.entries(_PROPERTY_INDUSTRIES)) {
    const local_total = industries.reduce((sum, ind) => sum + (local_emp[ind] ?? 0), 0);
    const national_total = industries.reduce((sum, ind) => sum + (national_emp[ind] ?? 0), 0);
    const expected = national_total * pop_share;
    const gap = local_total - expected;
    const gap_pct = expected > 0 ? (gap / expected) * 100 : 0.0;

    results.push({
      property_type: prop_type,
      local_emp: local_total,
      expected_emp: expected,
      gap,
      gap_pct,
    });
  }

  return results;
}

function _clamp(v: number, lo: number = 0.0, hi: number = 100.0): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute 0-100 investment suitability score from CI102 metrics.
 *
 * Weights: EBM(20%), basic_ratio(20%), RS(25%), gap(20%), scale(15%).
 *
 * EBMスコアは『教科書MSA健全レンジ 3-6 を最高点』とする山形関数。
 * EBM>8 (基盤雇用が薄く分母小=機械的膨張) は減点。
 * 旧版 (EBM 10で満点) は『高EBM=経済強い』の誤解釈バグだったため修正。
 */
export function investment_suitability_score(
  ebm: number,
  basic_ratio: number,
  rs_total: number,
  gap_factor: number,
  total_emp: number,
): InvestmentSuitabilityResult {
  // EBM 山形関数: 3-6で100点、離れるほど減点
  let ebm_score: number;
  if (ebm >= 3.0 && ebm <= 6.0) {
    ebm_score = 100.0;
  } else {
    const dist = Math.abs(ebm - 4.5);
    ebm_score = _clamp(100 - (dist - 1.5) * 20);
  }

  // 基盤雇用比率 山形関数: 15-25%で100点
  let ratio_score: number;
  if (basic_ratio >= 15.0 && basic_ratio <= 25.0) {
    ratio_score = 100.0;
  } else {
    const dist = Math.abs(basic_ratio - 20.0);
    ratio_score = _clamp(100 - (dist - 5.0) * 6);
  }

  const rs_score = _clamp(50 + rs_total / 200);
  const gap_score = _clamp(50 + gap_factor);
  const scale_score = _clamp(total_emp / 10_000);

  const total =
    ebm_score * 0.20 +
    ratio_score * 0.20 +
    rs_score * 0.25 +
    gap_score * 0.20 +
    scale_score * 0.15;

  return {
    total_score: Math.round(total * 10) / 10,
    ebm_score: Math.round(ebm_score * 10) / 10,
    ratio_score: Math.round(ratio_score * 10) / 10,
    rs_score: Math.round(rs_score * 10) / 10,
    gap_score: Math.round(gap_score * 10) / 10,
    scale_score: Math.round(scale_score * 10) / 10,
  };
}

/**
 * Estimate daytime population using basic employment as commuter proxy.
 */
export function estimate_daytime_population(
  nighttime_population: number,
  basic_employment: number,
): number {
  return nighttime_population + basic_employment;
}

/**
 * CI102 Front-door/Back-door feasibility analysis.
 */
export function development_feasibility(
  housing_demand: number,
  avg_unit_size_m2: number,
  land_price_per_m2: number,
  construction_cost_per_m2: number = 250_000,
  target_yield: number = 0.05,
): DevelopmentFeasibilityResult {
  const required_area = housing_demand * avg_unit_size_m2;
  const total_dev_cost = required_area * (construction_cost_per_m2 + land_price_per_m2);
  const required_annual_rent = total_dev_cost * target_yield;

  const monthly_rent_per_m2 =
    required_area > 0 ? required_annual_rent / 12 / required_area : 0;
  const max_price_per_unit =
    target_yield > 0 ? (monthly_rent_per_m2 * 12 * avg_unit_size_m2) / target_yield : 0;

  const land_cost_ratio =
    land_price_per_m2 + construction_cost_per_m2 > 0
      ? Math.round(
          (land_price_per_m2 / (land_price_per_m2 + construction_cost_per_m2)) * 100 * 10,
        ) / 10
      : 0;

  return {
    front_door: {
      required_area_m2: Math.round(required_area),
      total_dev_cost: Math.round(total_dev_cost),
      required_annual_rent: Math.round(required_annual_rent),
    },
    back_door: {
      monthly_rent_per_m2: Math.round(monthly_rent_per_m2),
      max_price_per_unit: Math.round(max_price_per_unit),
      land_cost_ratio,
    },
  };
}

/**
 * Forecast total required residential floor area in m2.
 */
export function forecast_required_floor_area(
  housing_units: number,
  avg_unit_size_m2: number,
): number {
  return housing_units * avg_unit_size_m2;
}

/**
 * Forecast number of buildings needed.
 */
export function forecast_building_count(
  housing_units: number,
  floors_per_building: number,
  units_per_floor: number,
): number {
  const capacity = floors_per_building * units_per_floor;
  if (capacity <= 0) {
    return 0.0;
  }
  return housing_units / capacity;
}
