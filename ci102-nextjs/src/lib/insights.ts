/**
 * Auto-insight generation from scorecard data.
 * Port of scorecard.py generate_insights().
 */

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

  // EBM thresholds
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

  // Basic ratio
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

  // Top LQ concentration risk
  if (sc.top_lq_industries.length > 0) {
    const top = sc.top_lq_industries[0];
    if (top.lq > 3.0 && sc.top_lq_industries.length <= 2) {
      insights.push({
        level: "warning",
        text: `LQ上位が ${top.industry}（LQ=${top.lq.toFixed(2)}）に集中。一極集中リスクに注意してください。`,
      });
    }
  }

  // Shift-Share RS
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

  // Retail gap
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

  // MLIT availability
  if (sc.median_unit_price === null) {
    insights.push({
      level: "info",
      text: "MLIT取引価格データが取得できませんでした（APIキー未設定または対象期間にデータなし）。",
    });
  }

  return insights;
}
