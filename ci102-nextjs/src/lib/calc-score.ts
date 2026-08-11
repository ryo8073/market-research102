/**
 * スコア計算の共通モジュール
 *
 * page.tsx (TOP3/比較) と /api/score の両方からimportされる。
 * スコア計算ロジックの重複を排除し、整合性を保証する。
 */

import type { PrefectureData } from "./use-prefecture-data";

export const DCLASS: Record<string, number> = {
  growth: 85, resilient: 70, outperform_decline: 55, decline: 38, severe_decline: 20,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ebmHealthScore(ebm: number): number {
  if (ebm >= 3 && ebm <= 6) return 100;
  if (ebm >= 2 && ebm <= 8) return 75;
  if (ebm >= 1.5 && ebm <= 10) return 55;
  return 35;
}

/**
 * 経済基盤スコア（0-100）の唯一の定義。
 * TOP3/比較(page.tsx)・スコアAPI・エリア診断パネルの全モード
 * （都道府県/市区町村/経済圏）で必ずこの関数を使う。重み・閾値の重複定義を禁止。
 *   EBM健全度 ×50% + 基盤比率 ×35% + 雇用規模 ×15%
 */
export function economicBaseScore(ebm: number, basicRatio: number, totalEmp: number): number {
  const ebmH = ebmHealthScore(ebm);
  const ratioScore = Math.min(100, Math.max(0, basicRatio * 4));
  const scaleScore = Math.min(100, Math.max(0, Math.log10(Math.max(1, totalEmp)) * 20 - 20));
  return Math.round(0.5 * ebmH + 0.35 * ratioScore + 0.15 * scaleScore);
}

/**
 * 現在需要スコア（0-100）。
 * 離散的な momentum_class 加点を廃止し、人口・世帯・小売需給を連続値で評価する。
 * 将来性スコアと入力を重複させないため、長期人口推計とRSはここに含めない。
 */
export function currentDemandScore(
  popChangePct: number | null | undefined,
  hhChangePct: number | null | undefined,
  momentumGap: number | null | undefined,
  aggregateGapFactor: number | null | undefined,
): number {
  const pop = popChangePct ?? 0;
  const hh = hhChangePct ?? 0;
  const gap = momentumGap ?? 0;
  const retailGap = aggregateGapFactor ?? 0;
  const populationScore = clamp(50 + pop * 5 + gap * 4, 0, 100);
  const householdScore = clamp(50 + hh * 5, 0, 100);
  const retailScore = clamp(50 + retailGap * 1.5, 0, 100);
  return Math.round(0.55 * populationScore + 0.30 * householdScore + 0.15 * retailScore);
}

/**
 * 将来性スコア（0-100）。
 * 現在需要との二重計上を避け、産業競争力（RS/同一スコープ雇用）と
 * 長期人口推計のみを使用する。人口縮小側をやや重く見る非対称レンジは、
 * 出口流動性の下振れを保守的に評価するため。
 */
export function futureOutlookScore(rsSharePct: number, projectedPopChangePct: number | null): number {
  const projection = projectedPopChangePct ?? 0;
  return Math.round(clamp(
    50 + clamp(rsSharePct * 10, -20, 20) + clamp(projection * 1.5, -25, 15),
    0,
    100,
  ));
}

export function calcPrefScore(p: PrefectureData) {
  const c2 = p.census2025;
  const demand = currentDemandScore(
    c2?.pop_change_pct,
    c2?.hh_change_pct,
    c2?.momentum_gap,
    p.aggregate_gap_factor,
  );

  const ebm = p.ebm_mid ?? p.ebm ?? 0;
  const ebmH = ebmHealthScore(ebm);
  const basicRatio = p.basic_ratio_mid ?? p.basic_ratio ?? 0;
  const ratioScore = Math.min(100, Math.max(0, basicRatio * 4));
  const totalEmp = p.total_employment ?? 0;
  const scaleScore = Math.min(100, Math.max(0, Math.log10(Math.max(1, totalEmp)) * 20 - 20));
  const supply = economicBaseScore(ebm, basicRatio, totalEmp);

  const rs = p.rs_total_mid ?? p.rs_total ?? 0;
  const rsShare = totalEmp > 0 ? (rs / totalEmp) * 100 : 0;
  const pp = p.pop_projection;
  const dPct = pp?.["2035"] && pp?.["2025"]
    ? ((pp["2035"] - pp["2025"]) / pp["2025"]) * 100
    : 0;

  const future = futureOutlookScore(rsShare, dPct);

  const overall = Math.round(0.4 * demand + 0.3 * supply + 0.3 * future);
  const stance = overall >= 70 ? "積極取得" : overall >= 55 ? "選別取得" : overall >= 40 ? "様子見" : "見送り";

  return {
    name: p.pref_name, code: p.pref_code, overall, demand, supply, future, stance,
    ebm: ebm.toFixed(1),
    basicRatio: basicRatio.toFixed(1),
    popPct: c2?.pop_change_pct?.toFixed(1) ?? "—",
    rentedPct: p.housing_tenure?.rented_pct?.toFixed(0) ?? "—",
    // APIで使う生値
    _ebmRaw: ebm,
    _basicRatioRaw: basicRatio,
    _population: c2?.population,
    _popChangePct: c2?.pop_change_pct,
    _ebmHealth: ebmH,
    _ratioScore: ratioScore,
    _scaleScore: scaleScore,
  };
}
