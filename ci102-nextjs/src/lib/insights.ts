/**
 * Auto-insight generation from scorecard data.
 * Port of scorecard.py generate_insights() + rich narrative generation.
 */

import type { PrefectureData } from "./use-prefecture-data";

/* ------------------------------------------------------------------ */
/*  Basic Insights (original)                                          */
/* ------------------------------------------------------------------ */

export interface Insight {
  level: "success" | "warning" | "info";
  text: string;
}

export interface InsightInput {
  ebm: number;
  basic_ratio: number;
  top_lq_industries: Array<{ industry: string; lq: number; basic_emp_estimate: number }>;
  rs_total: number;
  top_rs_industry: string;
  top_rs_value: number;
  aggregate_gap_factor: number;
  num_leakage_sectors: number;
  num_surplus_sectors: number;
  median_unit_price: number | null;
}

export function generateInsights(sc: InsightInput): Insight[] {
  const insights: Insight[] = [];

  if (sc.ebm >= 5.0) {
    insights.push({
      level: "success",
      text: `経済基盤乗数 EBM = ${sc.ebm.toFixed(2)} は非常に高い。基盤雇用1人の増減が地域経済に大きく波及します。`,
    });
  } else if (sc.ebm < 2.0) {
    insights.push({
      level: "warning",
      text: `経済基盤乗数 EBM = ${sc.ebm.toFixed(2)} は低め。非基盤部門が小さく、雇用増の波及効果が限定的です。`,
    });
  }

  if (sc.basic_ratio < 5.0) {
    insights.push({
      level: "warning",
      text: `基盤雇用比率 ${sc.basic_ratio.toFixed(1)}% — 域外から資金を呼び込む輸出基盤が弱い地域です。`,
    });
  } else if (sc.basic_ratio >= 20.0) {
    insights.push({
      level: "success",
      text: `基盤雇用比率 ${sc.basic_ratio.toFixed(1)}% — 強い輸出基盤を持ち、外部資金が安定的に流入しています。`,
    });
  }

  if (sc.top_lq_industries.length > 0) {
    const top = sc.top_lq_industries[0];
    if (top.lq > 3.0 && sc.top_lq_industries.length <= 2) {
      insights.push({
        level: "warning",
        text: `LQ上位が ${top.industry}（LQ=${top.lq.toFixed(2)}）に集中。一極集中リスクに注意してください。`,
      });
    }
  }

  if (sc.rs_total > 0) {
    insights.push({
      level: "success",
      text: `地域シフト(RS)合計 = ${sc.rs_total >= 0 ? "+" : ""}${sc.rs_total.toLocaleString()}人 — 全国平均を上回る競争優位。牽引産業: ${sc.top_rs_industry}（RS=${sc.top_rs_value >= 0 ? "+" : ""}${sc.top_rs_value.toLocaleString()}）`,
    });
  } else if (sc.rs_total < 0) {
    insights.push({
      level: "warning",
      text: `地域シフト(RS)合計 = ${sc.rs_total.toLocaleString()}人 — 全国の同産業と比べ雇用が減少傾向。競争力の低下に注意。`,
    });
  }

  if (sc.aggregate_gap_factor >= 10) {
    insights.push({
      level: "success",
      text: `小売漏損係数 +${sc.aggregate_gap_factor.toFixed(1)} — 購買力が域外に流出中。${sc.num_leakage_sectors}セクターに出店機会あり。`,
    });
  } else if (sc.aggregate_gap_factor <= -10) {
    insights.push({
      level: "warning",
      text: `小売余剰係数 ${sc.aggregate_gap_factor.toFixed(1)} — 供給過多。${sc.num_surplus_sectors}セクターが競争過多状態。`,
    });
  }

  if (sc.median_unit_price === null) {
    insights.push({
      level: "info",
      text: "MLIT取引価格データが取得できませんでした（APIキー未設定または対象期間にデータなし）。",
    });
  }

  return insights;
}

/* ------------------------------------------------------------------ */
/*  Rich Narrative Generation                                          */
/* ------------------------------------------------------------------ */

export interface NarrativeSection {
  icon: string;
  title: string;
  items: string[];
  level: "positive" | "neutral" | "negative";
}

export interface NarrativeResult {
  headline: string;
  economyType: string;
  sections: NarrativeSection[];
  clientTip: string;
  scoreInterpretation: string;
}

/**
 * Compute percentile rank of a value within all 47 prefectures.
 * Returns 0-100 (100 = highest).
 */
export function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const below = allValues.filter((v) => v < value).length;
  return Math.round((below / allValues.length) * 100);
}

/**
 * Get benchmark statistics for a metric across all prefectures.
 */
export interface BenchmarkStats {
  min: number;
  max: number;
  median: number;
  mean: number;
  percentile: number;
  rank: number; // 1 = best
}

export function computeBenchmark(
  value: number,
  allValues: number[],
  higherIsBetter = true
): BenchmarkStats {
  const sorted = [...allValues].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0] ?? 0;
  const max = sorted[n - 1] ?? 0;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const pct = percentileRank(value, allValues);
  const rank = higherIsBetter
    ? sorted.filter((v) => v > value).length + 1
    : sorted.filter((v) => v < value).length + 1;
  return { min, max, median, mean, percentile: pct, rank };
}

/**
 * Classify economy type based on base industry diversity and dominance.
 */
function classifyEconomyType(pref: PrefectureData): string {
  const baseIndustries = pref.top_lq_industries.filter((i) => i.lq > 1.0);
  const totalBaseEmp = baseIndustries.reduce((s, i) => s + i.basic_emp_estimate, 0);
  const topShare = baseIndustries.length > 0
    ? baseIndustries[0].basic_emp_estimate / Math.max(totalBaseEmp, 1)
    : 0;

  if (baseIndustries.length >= 4 && topShare < 0.4) return "多角化型経済";
  if (baseIndustries.length >= 3 && topShare < 0.5) return "やや多角化型";
  if (baseIndustries.length <= 2 && topShare > 0.6) return "一極集中型経済";
  if (pref.basic_ratio < 8) return "内需依存型経済";
  return "中程度の多角化経済";
}

/**
 * Generate a comprehensive narrative for a prefecture.
 * No AI needed — pure rule-based logic for offline, fast generation.
 */
export function generateNarrative(
  pref: PrefectureData,
  allData: Record<string, PrefectureData> | null
): NarrativeResult {
  const allPrefs = allData ? Object.values(allData) : [];
  const economyType = classifyEconomyType(pref);

  // Compute benchmarks
  const ebmBench = computeBenchmark(pref.ebm, allPrefs.map((p) => p.ebm));
  const rsBench = computeBenchmark(pref.rs_total, allPrefs.map((p) => p.rs_total));
  const ratioBench = computeBenchmark(pref.basic_ratio, allPrefs.map((p) => p.basic_ratio));
  const scoreBench = computeBenchmark(
    pref.suitability_score.total_score,
    allPrefs.map((p) => p.suitability_score.total_score)
  );

  // Headline
  const scoreLabel = pref.suitability_score.total_score >= 80 ? "優良"
    : pref.suitability_score.total_score >= 60 ? "良好"
    : pref.suitability_score.total_score >= 40 ? "標準"
    : "要注意";
  const headline = `${pref.pref_name}は${economyType}（投資適格: ${scoreLabel}）`;

  // --- Section: 経済の特徴 ---
  const economyItems: string[] = [];
  const baseCount = pref.top_lq_industries.filter((i) => i.lq > 1.0).length;
  if (baseCount >= 3) {
    economyItems.push(
      `基盤産業が${baseCount}業種に分散 — 特定産業への依存度が低く、景気変動に対して耐性があります。`
    );
  } else {
    economyItems.push(
      `基盤産業は${baseCount}業種に限定 — 主力産業の動向が地域経済に大きく影響します。`
    );
  }
  const topInd = pref.top_lq_industries[0];
  if (topInd) {
    economyItems.push(
      `最大の基盤産業は「${topInd.industry}」（LQ=${topInd.lq.toFixed(2)}、基盤雇用 ${Math.round(topInd.basic_emp_estimate).toLocaleString()}人）。`
    );
  }
  economyItems.push(
    `EBM = ${pref.ebm.toFixed(2)} — 基盤雇用が100人増えると、非基盤を含め約${Math.round(pref.ebm * 100).toLocaleString()}人の雇用増が見込まれます。` +
    `（全国中央値 ${ebmBench.median.toFixed(2)}、${ebmBench.rank}位/47）`
  );
  economyItems.push(
    `基盤雇用比率 ${pref.basic_ratio.toFixed(1)}% — ` +
    (pref.basic_ratio >= 20 ? "域外需要に支えられた強い経済基盤。"
     : pref.basic_ratio >= 10 ? "中程度の外部基盤。テナント需要は安定的。"
     : "外部基盤が弱め。地場消費に依存した構造です。") +
    `（全国${ratioBench.rank}位）`
  );

  // --- Section: 投資判断のポイント ---
  const investItems: string[] = [];
  if (pref.rs_total > 0) {
    const starIndustries = pref.shift_share_table
      .filter((r) => r.regional_shift > 0 && r.actual_change > 0)
      .sort((a, b) => b.regional_shift - a.regional_shift)
      .slice(0, 3)
      .map((r) => r.industry);
    investItems.push(
      `RS合計 +${pref.rs_total.toLocaleString()} — 全国同産業と比べ雇用が成長。` +
      (starIndustries.length > 0 ? `牽引産業: ${starIndustries.join("、")}。` : "") +
      `（全国${rsBench.rank}位）`
    );
  } else {
    investItems.push(
      `RS合計 ${pref.rs_total.toLocaleString()} — 全国の同産業と比べ雇用が減少傾向。構造的な競争力に課題。` +
      `（全国${rsBench.rank}位）`
    );
  }

  if (pref.num_leakage_sectors > 0) {
    const leakageSectors = pref.gap_table
      .filter((r) => r.factor > 10)
      .sort((a, b) => b.factor - a.factor)
      .slice(0, 3)
      .map((r) => r.sector);
    investItems.push(
      `小売漏損${pref.num_leakage_sectors}セクター — 域内の購買力が域外に流出中。` +
      (leakageSectors.length > 0 ? `特に ${leakageSectors.join("、")} に出店機会。` : "")
    );
  }
  if (pref.num_surplus_sectors > 0) {
    investItems.push(
      `供給過多${pref.num_surplus_sectors}セクター — 競争が激しく、新規出店には注意が必要です。`
    );
  }

  if (pref.actual_emp_change > 0) {
    investItems.push(
      `2016→2021で雇用 +${pref.actual_emp_change.toLocaleString()}人の実績増。需要基盤が拡大しています。`
    );
  }

  // --- Section: リスク要因 ---
  const riskItems: string[] = [];
  if (topInd && topInd.lq > 3.0) {
    const topBaseShare = topInd.basic_emp_estimate / Math.max(pref.basic_emp, 1);
    if (topBaseShare > 0.5) {
      riskItems.push(
        `「${topInd.industry}」に基盤雇用の${Math.round(topBaseShare * 100)}%が集中（LQ=${topInd.lq.toFixed(2)}）。この産業が衰退した場合、地域経済への影響が甚大です。`
      );
    }
  }
  if (pref.actual_emp_change < 0) {
    riskItems.push(
      `2016→2021で雇用が${Math.abs(pref.actual_emp_change).toLocaleString()}人減少。構造的な縮小トレンドの中での投資には慎重な判断が必要です。`
    );
  }
  if (pref.ebm < 2.0) {
    riskItems.push(
      `EBMが${pref.ebm.toFixed(2)}と低い — 新規雇用の波及効果が限定的で、テナント需要の拡大を見込みにくい構造です。`
    );
  }
  if (pref.basic_ratio < 5) {
    riskItems.push(
      `基盤雇用比率が${pref.basic_ratio.toFixed(1)}%と非常に低い — 域外からの資金流入が乏しく、内需のみに依存しています。`
    );
  }
  if (riskItems.length === 0) {
    riskItems.push("現時点で顕著なリスク要因は検出されていません。ただし、データは2021年経済センサス時点のスナップショットです。");
  }

  // --- Client Tip ---
  let clientTip: string;
  if (pref.suitability_score.total_score >= 60 && pref.rs_total > 0) {
    const topBase = pref.top_lq_industries.slice(0, 2).map((i) => i.industry).join("と");
    clientTip = `「${pref.pref_name}は${topBase}を中心とした${economyType}で、全国平均を上回る雇用成長が確認されています。` +
      `経済基盤乗数${pref.ebm.toFixed(1)}倍の波及効果により、基盤産業の成長がテナント需要・住宅需要の拡大につながりやすい構造です。」`;
  } else if (pref.suitability_score.total_score >= 40) {
    clientTip = `「${pref.pref_name}の経済構造は全国標準並みです。` +
      (pref.num_leakage_sectors > 0
        ? `小売の漏損セクター${pref.num_leakage_sectors}件が出店機会を示唆していますが、`
        : "") +
      `投資判断には物件個別のキャッシュフロー分析との組み合わせが重要です。」`;
  } else {
    clientTip = `「${pref.pref_name}は経済基盤の面で課題を抱えています。` +
      `投資を検討する場合は、物件のキャッシュフローが地域経済の変動に耐えうるかを重点的に検証してください。` +
      `ディフェンシブな用途（医療・介護・生活必需品）の物件が相対的に安全です。」`;
  }

  // --- Score interpretation ---
  const ss = pref.suitability_score;
  const scoreBreakdown = [
    { name: "EBM", score: ss.ebm_score, weight: 20 },
    { name: "基盤比率", score: ss.ratio_score, weight: 20 },
    { name: "RS", score: ss.rs_score, weight: 25 },
    { name: "Gap", score: ss.gap_score, weight: 15 },
    { name: "規模", score: ss.scale_score, weight: 20 },
  ];
  const strongest = scoreBreakdown.reduce((a, b) => (a.score > b.score ? a : b));
  const weakest = scoreBreakdown.reduce((a, b) => (a.score < b.score ? a : b));
  const scoreInterpretation =
    `総合${ss.total_score.toFixed(0)}点（${scoreLabel}）。` +
    `最大の強み: ${strongest.name}（${strongest.score.toFixed(0)}点/${strongest.weight}点満点）。` +
    `改善余地: ${weakest.name}（${weakest.score.toFixed(0)}点/${weakest.weight}点満点）。` +
    `全国${scoreBench.rank}位/47都道府県。`;

  const sections: NarrativeSection[] = [
    { icon: "chart", title: "経済の特徴", items: economyItems, level: "neutral" },
    { icon: "target", title: "投資判断のポイント", items: investItems, level: "positive" },
    { icon: "alert", title: "リスク要因", items: riskItems, level: "negative" },
  ];

  return { headline, economyType, sections, clientTip, scoreInterpretation };
}
