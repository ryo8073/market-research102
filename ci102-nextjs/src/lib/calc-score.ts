/**
 * スコア計算の共通モジュール
 *
 * page.tsx (TOP3/比較) と /api/score の両方からimportされる。
 * スコア計算ロジックの重複を排除し、整合性を保証する。
 */

import type { PrefectureData } from "./use-prefecture-data";

const DCLASS: Record<string, number> = {
  growth: 85, resilient: 70, outperform_decline: 55, decline: 38, severe_decline: 20,
};

export function ebmHealthScore(ebm: number): number {
  if (ebm >= 3 && ebm <= 6) return 100;
  if (ebm >= 2 && ebm <= 8) return 75;
  if (ebm >= 1.5 && ebm <= 10) return 55;
  return 35;
}

export function calcPrefScore(p: PrefectureData) {
  const c2 = p.census2025;
  const demand = Math.min(100,
    (DCLASS[c2?.momentum_class ?? "decline"] ?? 40) +
    Math.min(10, (p.num_leakage_sectors ?? 0) * 3) +
    ((p.aggregate_gap_factor ?? 0) > 10 ? 5 : 0)
  );

  const ebm = p.ebm_mid ?? p.ebm ?? 0;
  const ebmH = ebmHealthScore(ebm);
  const basicRatio = p.basic_ratio_mid ?? p.basic_ratio ?? 0;
  const ratioScore = Math.min(100, Math.max(0, basicRatio * 4));
  const totalEmp = p.total_employment ?? 0;
  const scaleScore = Math.min(100, Math.max(0, Math.log10(Math.max(1, totalEmp)) * 20 - 20));
  const supply = Math.round(0.5 * ebmH + 0.35 * ratioScore + 0.15 * scaleScore);

  const rs = p.rs_total_mid ?? p.rs_total ?? 0;
  const rsShare = totalEmp > 0 ? (rs / totalEmp) * 100 : 0;
  const gap = c2?.momentum_gap ?? 0;
  const pp = p.pop_projection;
  const dPct = pp?.["2035"] && pp?.["2025"]
    ? ((pp["2035"] - pp["2025"]) / pp["2025"]) * 100
    : 0;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const future = Math.round(clamp(
    50 + clamp(gap * 4, -24, 24) + clamp(rsShare * 8, -12, 12) + clamp(dPct * 1.2, -18, 12),
    0, 100,
  ));

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
