/**
 * CI102 textbook numerical verification for calculator.ts
 *
 * Test data sources:
 *   - Activity 4-1: LQ (Orlando MSA, p.206)
 *   - Activity 4-2: Basic Employment (p.207)
 *   - Activity 4-3: EBM (p.208)
 *   - Activity 4-4: PER (p.208)
 *   - Activity 4-5: Forecast (p.209)
 *   - Self-Assessment 1b: Denver MSA (p.211)
 *   - Self-Assessment 3: Shift-Share (Baton Rouge, p.212-213)
 *   - Gwinnett County example from roadmap
 */
import { describe, it, expect } from "vitest";
import {
  location_quotient,
  lq_table,
  total_basic_employment,
  economic_base_multiplier,
  forecast_total_employment_change,
  population_employment_ratio,
  forecast_population_change,
  forecast_housing_units,
  shift_share,
  shift_share_table,
  leakage_surplus_factor,
  gap_analysis_table,
  office_industrial_gap,
  investment_suitability_score,
  estimate_daytime_population,
  development_feasibility,
  forecast_required_floor_area,
  forecast_building_count,
} from "../src/lib/calculator";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ORLANDO_LOCAL: Record<string, number> = {
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
};

const ORLANDO_NATIONAL: Record<string, number> = {
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
};

const ORLANDO_TOTAL_LOCAL = 1_050_091;
const ORLANDO_TOTAL_NATIONAL = 142_795_200;

const BATON_ROUGE_LOCAL_T0: Record<string, number> = {
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
};

const BATON_ROUGE_LOCAL_T1: Record<string, number> = {
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
};

const BATON_ROUGE_NATIONAL_T0: Record<string, number> = {
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
};

const BATON_ROUGE_NATIONAL_T1: Record<string, number> = {
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
};

// ---------------------------------------------------------------------------
// LQ
// ---------------------------------------------------------------------------

describe("LocationQuotient", () => {
  it("textbook education example: local 20% / national 9% -> LQ ~ 2.22", () => {
    const lq = location_quotient(20, 100, 9, 100);
    expect(lq).toBeCloseTo(20 / 9, 6);
  });

  it("LQ below one", () => {
    const lq = location_quotient(5, 100, 10, 100);
    expect(lq).toBe(0.5);
  });

  it("LQ equals one when proportions match", () => {
    expect(location_quotient(15, 100, 15, 100)).toBe(1.0);
  });

  it("zero local total returns 0", () => {
    expect(location_quotient(10, 0, 100, 1000)).toBe(0.0);
  });

  it("zero national industry returns 0", () => {
    expect(location_quotient(10, 100, 0, 1000)).toBe(0.0);
  });
});

describe("LQTable", () => {
  it("table structure has correct keys and length", () => {
    const local = { "\u88FD\u9020\u696D": 200, "\u30B5\u30FC\u30D3\u30B9\u696D": 800 };
    const national = { "\u88FD\u9020\u696D": 1000, "\u30B5\u30FC\u30D3\u30B9\u696D": 9000 };
    const rows = lq_table(local, national);
    const keys = Object.keys(rows[0]);
    expect(keys).toEqual(["industry", "local_emp", "national_emp", "lq", "basic_emp_estimate"]);
    expect(rows.length).toBe(2);
  });

  it("basic_emp_estimate only when LQ > 1", () => {
    const local = { "\u88FD\u9020\u696D": 200, "\u30B5\u30FC\u30D3\u30B9\u696D": 800 };
    const national = { "\u88FD\u9020\u696D": 1000, "\u30B5\u30FC\u30D3\u30B9\u696D": 9000 };
    const rows = lq_table(local, national);
    const mfg = rows.find((r) => r.industry === "\u88FD\u9020\u696D")!;
    const svc = rows.find((r) => r.industry === "\u30B5\u30FC\u30D3\u30B9\u696D")!;
    expect(mfg.lq).toBeCloseTo(2.0, 5);
    expect(mfg.basic_emp_estimate).toBeCloseTo(100.0, 5);
    expect(svc.lq).toBeLessThan(1.0);
    expect(svc.basic_emp_estimate).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// EBM
// ---------------------------------------------------------------------------

describe("EconomicBaseMultiplier", () => {
  it("Gwinnett County: 541584 / 108974 ~ 4.97", () => {
    const ebm = economic_base_multiplier(541_584, 108_974);
    expect(ebm).toBeCloseTo(4.97, 1);
  });

  it("forecast employment change: +100 * 4.97 = 497", () => {
    expect(forecast_total_employment_change(100, 4.97)).toBeCloseTo(497.0, 1);
  });

  it("zero basic emp returns 0", () => {
    expect(economic_base_multiplier(1000, 0)).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// PER & derived
// ---------------------------------------------------------------------------

describe("PopulationEmploymentRatio", () => {
  it("Gwinnett County PER: 936250 / 541584 ~ 1.73", () => {
    const per = population_employment_ratio(936_250, 541_584);
    expect(per).toBeCloseTo(1.73, 1);
  });

  it("forecast population: 497 * 2.5 ~ 1242.5", () => {
    const delta = forecast_population_change(497, 2.5);
    expect(delta).toBeCloseTo(1242.5, 0);
  });

  it("housing units: 1243 / 2.2 ~ 565", () => {
    const units = forecast_housing_units(1243, 2.2);
    expect(units).toBeCloseTo(565.0, -1);
  });
});

// ---------------------------------------------------------------------------
// Shift-Share
// ---------------------------------------------------------------------------

describe("ShiftShare", () => {
  it("construction industry example", () => {
    const result = shift_share(
      100_000, 98_000,
      1_000_000, 1_080_000,
      10_000_000, 10_500_000,
      "\u5EFA\u8A2D\u696D",
    );
    expect(result.national_growth).toBeCloseTo(5_000.0, -1);
    expect(result.industry_mix).toBeCloseTo(3_000.0, -1);
    expect(result.regional_shift).toBeCloseTo(-10_000.0, -1);
    expect(result.actual_change).toBeCloseTo(-2_000.0, 0);
    // NS + IM + RS = actual change (identity)
    expect(result.total_share).toBeCloseTo(result.actual_change, -1);
  });

  it("total share identity holds", () => {
    const result = shift_share(
      5_000, 6_200,
      500_000, 550_000,
      10_000_000, 10_200_000,
    );
    expect(result.total_share).toBeCloseTo(result.actual_change, 6);
  });
});

describe("ShiftShareTable", () => {
  it("table has correct keys and length", () => {
    const local_t0 = { "\u88FD\u9020\u696D": 1000, "\u60C5\u5831\u901A\u4FE1": 500 };
    const local_t1 = { "\u88FD\u9020\u696D": 950, "\u60C5\u5831\u901A\u4FE1": 650 };
    const national_t0 = { "\u88FD\u9020\u696D": 100_000, "\u60C5\u5831\u901A\u4FE1": 80_000 };
    const national_t1 = { "\u88FD\u9020\u696D": 102_000, "\u60C5\u5831\u901A\u4FE1": 95_000 };
    const rows = shift_share_table(local_t0, local_t1, national_t0, national_t1);
    const keys = new Set(Object.keys(rows[0]));
    expect(keys).toEqual(new Set([
      "industry", "actual_change", "national_growth",
      "industry_mix", "regional_shift", "total_share",
    ]));
    expect(rows.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Gap Analysis
// ---------------------------------------------------------------------------

describe("LeakageSurplusFactor", () => {
  it("food beverage: demand $15.5M / supply $12M -> +12.7", () => {
    expect(leakage_surplus_factor(15_500_000, 12_000_000)).toBeCloseTo(12.7, 0);
  });

  it("electronics: demand $3.8M / supply $0.5M -> +76.7", () => {
    expect(leakage_surplus_factor(3_800_000, 500_000)).toBeCloseTo(76.7, 0);
  });

  it("apparel surplus: demand $5.2M / supply $8.5M -> -24.0", () => {
    expect(leakage_surplus_factor(5_200_000, 8_500_000)).toBeCloseTo(-24.0, 0);
  });

  it("balanced market", () => {
    expect(leakage_surplus_factor(1000, 1000)).toBe(0.0);
  });

  it("complete leakage (zero supply) -> +100", () => {
    expect(leakage_surplus_factor(1000, 0)).toBe(100.0);
  });

  it("complete surplus (zero demand) -> -100", () => {
    expect(leakage_surplus_factor(0, 1000)).toBe(-100.0);
  });
});

describe("GapAnalysisTable", () => {
  it("table with textbook sectors", () => {
    const sectors = [
      { sector: "\u98DF\u54C1\u30FB\u98F2\u6599\u30B9\u30FC\u30D1\u30FC", demand: 15_500_000, supply: 12_000_000 },
      { sector: "\u30A2\u30D1\u30EC\u30EB", demand: 5_200_000, supply: 8_500_000 },
      { sector: "\u5BB6\u96FB\u91CF\u8CA9\u5E97", demand: 3_800_000, supply: 500_000 },
      { sector: "\u98F2\u98DF\u5E97", demand: 8_400_000, supply: 8_000_000 },
    ];
    const rows = gap_analysis_table(sectors);
    // Highest leakage is electronics store
    expect(rows[0].sector).toBe("\u5BB6\u96FB\u91CF\u8CA9\u5E97");
    // Apparel is surplus (negative)
    const apparel = rows.find((r) => r.sector === "\u30A2\u30D1\u30EC\u30EB")!;
    expect(apparel.factor).toBeLessThan(0);
    // Food is balanced
    const food = rows.find((r) => r.sector === "\u98F2\u98DF\u5E97")!;
    expect(food.verdict).toBe("\u5747\u8861\u72B6\u614B");
  });
});

// ===========================================================================
// Orlando MSA Activity 4-1 ~ 4-5
// ===========================================================================

describe("OrlandoMSA_Activity4_1", () => {
  const cases: Array<[string, number, number, number]> = [
    ["Construction", 61_673, 7_269_400, 1.1537],
    ["Financial", 111_735, 8_723_700, 1.7417],
    ["Leisure", 171_246, 13_326_700, 1.7474],
    ["Transportation", 61_349, 5_555_100, 1.5018],
    ["Professional", 201_785, 20_245_700, 1.3553],
    ["Information", 20_254, 2_694_400, 1.0222],
    ["OtherServices", 54_176, 6_048_800, 1.2179],
    ["Manufacturing", 38_232, 12_179_100, 0.4269],
    ["NaturalResources", 1_262, 573_100, 0.2994],
    ["RetailTrade", 93_527, 14_853_100, 0.8563],
  ];

  for (const [name, local_emp, national_emp, expected_lq] of cases) {
    it(`LQ ${name}`, () => {
      const lq = location_quotient(
        local_emp, ORLANDO_TOTAL_LOCAL, national_emp, ORLANDO_TOTAL_NATIONAL,
      );
      expect(lq).toBeCloseTo(expected_lq, 2);
    });
  }
});

describe("OrlandoMSA_Activity4_2", () => {
  const cases: Array<[string, number, number, number]> = [
    ["Construction", 61_673, 1.1537, 8_215],
    ["Transportation", 61_349, 1.5018, 20_498],
    ["Information", 20_254, 1.0222, 440],
    ["Financial", 111_735, 1.7417, 47_582],
    ["Professional", 201_785, 1.3553, 52_902],
    ["Leisure", 171_246, 1.7474, 73_244],
    ["OtherServices", 54_176, 1.2179, 9_694],
  ];

  for (const [name, local_emp, lq, expected_basic] of cases) {
    it(`basic employment ${name}`, () => {
      const basic = local_emp * (1 - 1 / lq);
      expect(basic).toBeCloseTo(expected_basic, -2);
    });
  }

  it("total basic from lq_table = 212575", () => {
    const rows = lq_table(ORLANDO_LOCAL, ORLANDO_NATIONAL);
    expect(total_basic_employment(rows)).toBeCloseTo(212_575, -3);
  });

  it("seven basic industries identified", () => {
    const rows = lq_table(ORLANDO_LOCAL, ORLANDO_NATIONAL);
    const basicIndustries = new Set(rows.filter((r) => r.lq > 1.0).map((r) => r.industry));
    const expected = new Set([
      "Construction",
      "Transportation and Warehousing",
      "Information",
      "Financial Activities",
      "Professional and Business Services",
      "Leisure and Hospitality",
      "Other Services",
    ]);
    expect(basicIndustries).toEqual(expected);
  });
});

describe("OrlandoMSA_Activity4_3", () => {
  it("EBM = 1050091 / 212575 = 4.94", () => {
    const ebm = economic_base_multiplier(1_050_091, 212_575);
    expect(ebm).toBeCloseTo(4.94, 1);
  });
});

describe("OrlandoMSA_Activity4_4", () => {
  it("PER = 2002000 / 1050091 = 1.91", () => {
    const per = population_employment_ratio(2_002_000, 1_050_091);
    expect(per).toBeCloseTo(1.91, 1);
  });
});

describe("OrlandoMSA_Activity4_5", () => {
  it("forecast total employment: 3000 * 4.94 = 14820", () => {
    expect(forecast_total_employment_change(3_000, 4.94)).toBeCloseTo(14_820, -1);
  });

  it("forecast population: 14820 * 1.91 = 28306.2", () => {
    expect(forecast_population_change(14_820, 1.91)).toBeCloseTo(28_306.2, -1);
  });

  it("full cascade: basic 3000 -> total 14820 -> pop 28306", () => {
    const total_emp = forecast_total_employment_change(3_000, 4.94);
    const pop = forecast_population_change(total_emp, 1.91);
    expect(total_emp).toBeCloseTo(14_820, -1);
    expect(pop).toBeCloseTo(28_306.2, -1);
  });
});

// ===========================================================================
// Denver MSA Self-Assessment 1b
// ===========================================================================

describe("DenverMSA", () => {
  it("Denver LQ", () => {
    const lq = location_quotient(202_639, 1_006_879, 16_489_216, 106_946_360);
    expect(lq).toBeCloseTo(1.3054, 2);
  });

  it("Denver basic employment = 47418", () => {
    const lq = location_quotient(202_639, 1_006_879, 16_489_216, 106_946_360);
    const basic = 202_639 * (1 - 1 / lq);
    expect(basic).toBeCloseTo(47_418, -2);
  });
});

// ===========================================================================
// Baton Rouge Shift-Share (Self-Assessment 3)
// ===========================================================================

describe("BatonRougeShiftShare", () => {
  it("national growth total = 9374", () => {
    const rows = shift_share_table(
      BATON_ROUGE_LOCAL_T0, BATON_ROUGE_LOCAL_T1,
      BATON_ROUGE_NATIONAL_T0, BATON_ROUGE_NATIONAL_T1,
    );
    const total = rows.reduce((s, r) => s + r.national_growth, 0);
    expect(total).toBeCloseTo(9_374, -2);
  });

  it("industry mix total = 2111", () => {
    const rows = shift_share_table(
      BATON_ROUGE_LOCAL_T0, BATON_ROUGE_LOCAL_T1,
      BATON_ROUGE_NATIONAL_T0, BATON_ROUGE_NATIONAL_T1,
    );
    const total = rows.reduce((s, r) => s + r.industry_mix, 0);
    expect(total).toBeCloseTo(2_111, -2);
  });

  it("regional shift total = 8676", () => {
    const rows = shift_share_table(
      BATON_ROUGE_LOCAL_T0, BATON_ROUGE_LOCAL_T1,
      BATON_ROUGE_NATIONAL_T0, BATON_ROUGE_NATIONAL_T1,
    );
    const total = rows.reduce((s, r) => s + r.regional_shift, 0);
    expect(total).toBeCloseTo(8_676, -2);
  });

  it("actual change total = 20161", () => {
    const rows = shift_share_table(
      BATON_ROUGE_LOCAL_T0, BATON_ROUGE_LOCAL_T1,
      BATON_ROUGE_NATIONAL_T0, BATON_ROUGE_NATIONAL_T1,
    );
    const total = rows.reduce((s, r) => s + r.actual_change, 0);
    expect(total).toBeCloseTo(20_161, -1);
  });

  it("decomposition identity: NS + IM + RS = actual change for each industry", () => {
    const rows = shift_share_table(
      BATON_ROUGE_LOCAL_T0, BATON_ROUGE_LOCAL_T1,
      BATON_ROUGE_NATIONAL_T0, BATON_ROUGE_NATIONAL_T1,
    );
    for (const row of rows) {
      const computed = row.national_growth + row.industry_mix + row.regional_shift;
      expect(computed).toBeCloseTo(row.actual_change, -1);
    }
  });

  it("Education and Health regional shift = 7741", () => {
    const rows = shift_share_table(
      BATON_ROUGE_LOCAL_T0, BATON_ROUGE_LOCAL_T1,
      BATON_ROUGE_NATIONAL_T0, BATON_ROUGE_NATIONAL_T1,
    );
    const edu = rows.find((r) => r.industry === "Education and Health Services")!;
    expect(edu).toBeDefined();
    expect(edu.regional_shift).toBeCloseTo(7_741, -2);
  });
});

// ---------------------------------------------------------------------------
// Property Scale Conversion
// ---------------------------------------------------------------------------

describe("PropertyScale", () => {
  it("floor area basic: 100 * 65 = 6500", () => {
    expect(forecast_required_floor_area(100, 65.0)).toBe(6500.0);
  });

  it("floor area zero units", () => {
    expect(forecast_required_floor_area(0, 65.0)).toBe(0.0);
  });

  it("building count basic: 100 / (5*4) = 5", () => {
    expect(forecast_building_count(100, 5, 4)).toBe(5.0);
  });

  it("building count remainder: 50 / (5*4) = 2.5", () => {
    expect(forecast_building_count(50, 5, 4)).toBeCloseTo(2.5, 5);
  });

  it("building count zero floors", () => {
    expect(forecast_building_count(100, 0, 4)).toBe(0.0);
  });

  it("building count zero units per floor", () => {
    expect(forecast_building_count(100, 5, 0)).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// Additional function tests (office_industrial_gap, investment_suitability,
// estimate_daytime_population, development_feasibility)
// ---------------------------------------------------------------------------

describe("OfficeIndustrialGap", () => {
  it("returns 5 property types", () => {
    const local: Record<string, number> = { "\u88FD\u9020\u696D": 1000, "\u5EFA\u8A2D\u696D": 500 };
    const national: Record<string, number> = { "\u88FD\u9020\u696D": 100000, "\u5EFA\u8A2D\u696D": 50000 };
    const rows = office_industrial_gap(local, national, 100000, 10000000);
    expect(rows.length).toBe(5);
    expect(rows[0].property_type).toBeDefined();
  });

  it("gap_pct is 0 when expected is 0", () => {
    const rows = office_industrial_gap({}, {}, 100000, 0);
    for (const row of rows) {
      expect(row.gap_pct).toBe(0.0);
    }
  });
});

describe("InvestmentSuitabilityScore", () => {
  it("score is between 0 and 100", () => {
    const result = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000);
    expect(result.total_score).toBeGreaterThanOrEqual(0);
    expect(result.total_score).toBeLessThanOrEqual(100);
  });

  it("has all component scores", () => {
    const result = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000);
    expect(result.ebm_score).toBeDefined();
    expect(result.ratio_score).toBeDefined();
    expect(result.rs_score).toBeDefined();
    expect(result.gap_score).toBeDefined();
    expect(result.scale_score).toBeDefined();
  });
});

describe("EstimateDaytimePopulation", () => {
  it("nighttime + basic employment", () => {
    expect(estimate_daytime_population(400000, 50000)).toBe(450000.0);
  });
});

describe("DevelopmentFeasibility", () => {
  it("returns front_door and back_door", () => {
    const result = development_feasibility(100, 65, 300000);
    expect(result.front_door).toBeDefined();
    expect(result.back_door).toBeDefined();
    expect(result.front_door.required_area_m2).toBe(6500);
    expect(result.front_door.total_dev_cost).toBeGreaterThan(0);
  });

  it("zero demand produces zero area", () => {
    const result = development_feasibility(0, 65, 300000);
    expect(result.front_door.required_area_m2).toBe(0);
  });
});
