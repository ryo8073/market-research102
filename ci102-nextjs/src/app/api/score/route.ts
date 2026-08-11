/**
 * Proformer連携用 スコアAPIエンドポイント
 *
 * GET /api/score?pref=13
 * GET /api/score?pref=13&city=13103
 *
 * レスポンス:
 * {
 *   area: "東京都 港区",
 *   overall: 72,
 *   demand: 68,
 *   supply: 75,
 *   future: 73,
 *   stance: "積極取得を検討",
 *   headline: "人口が増えている...",
 *   propertyScores: [
 *     { type: "residential", label: "住居系", score: 78, verdict: "推奨" },
 *     ...
 *   ],
 *   dataVintage: { economic_census: "2021", population_census: "2025速報", mlit: "2026Q1" }
 * }
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const prefCode = request.nextUrl.searchParams.get("pref");
  const cityCode = request.nextUrl.searchParams.get("city");

  if (!prefCode) {
    return NextResponse.json({ error: "pref パラメータが必要です" }, { status: 400 });
  }

  const baseUrl = request.nextUrl.origin;

  try {
    // 都道府県データを取得
    const prefRes = await fetch(`${baseUrl}/data/prefectures.json`);
    if (!prefRes.ok) {
      return NextResponse.json({ error: "データ取得失敗" }, { status: 500 });
    }
    const allPrefs = await prefRes.json();
    const pref = allPrefs[prefCode];
    if (!pref) {
      return NextResponse.json({ error: `都道府県コード ${prefCode} が見つかりません` }, { status: 404 });
    }

    // 市区町村データ（指定時）
    let city = null;
    if (cityCode) {
      const muniRes = await fetch(`${baseUrl}/data/municipalities/${prefCode}.json`);
      if (muniRes.ok) {
        const munis = await muniRes.json();
        city = (munis as Array<{ area_code: string }>).find((m) => m.area_code === cityCode) ?? null;
      }
    }

    // スコア計算（簡易版 — decision-hub-tabのcalculatePropertyScoresと同等ロジック）
    const ebm = pref.ebm_mid ?? pref.ebm ?? 0;
    const basicRatio = pref.basic_ratio_mid ?? pref.basic_ratio ?? 0;
    const rs = pref.rs_total_mid ?? pref.rs_total ?? 0;

    const c = (city as any)?.census2025 ?? pref.census2025;
    const gap = c?.momentum_gap ?? 0;
    const agg = pref.aggregate_gap_factor ?? 0;
    const leak = pref.num_leakage_sectors ?? 0;
    const totalEmp = (city as any)?.total_emp ?? pref.total_employment ?? 0;
    const rsShare = totalEmp > 0 ? (rs / totalEmp) * 100 : 0;

    // 需要スコア
    const DCLASS: Record<string, number> = { growth: 85, resilient: 70, outperform_decline: 55, decline: 38, severe_decline: 20 };
    const demand = Math.min(100, (DCLASS[c?.momentum_class ?? "decline"] ?? 40) + Math.min(10, leak * 3) + (agg > 10 ? 5 : 0));

    // 経済基盤スコア
    const ebmHealth = ebm >= 3 && ebm <= 6 ? 100 : ebm >= 2 && ebm <= 8 ? 75 : ebm >= 1.5 && ebm <= 10 ? 55 : 35;
    const ratioScore = Math.min(100, Math.max(0, basicRatio * 4));
    const scaleScore = Math.min(100, Math.max(0, Math.log10(Math.max(1, totalEmp)) * 20 - 20));
    const supply = Math.round(0.5 * ebmHealth + 0.35 * ratioScore + 0.15 * scaleScore);

    // 将来性スコア
    const popProj = pref.pop_projection;
    const dPct = popProj?.["2035"] && popProj?.["2025"]
      ? ((popProj["2035"] - popProj["2025"]) / popProj["2025"]) * 100
      : 0;
    let future = 50 + Math.max(-24, Math.min(24, gap * 4)) + Math.max(-12, Math.min(12, rsShare * 8)) + Math.max(-18, Math.min(12, dPct * 1.2));
    future = Math.round(Math.max(0, Math.min(100, future)));

    const overall = Math.round(0.4 * demand + 0.3 * supply + 0.3 * future);

    // 投資スタンス
    let stance = "取得は原則見送り";
    if (overall >= 70) stance = "積極取得を検討";
    else if (overall >= 55) stance = demand >= supply ? "選別取得（需要先行）" : "条件付取得（出口前提）";
    else if (overall >= 40) stance = "様子見・厳選";

    const area = city ? `${pref.pref_name} ${(city as any).area_name}` : pref.pref_name;

    return NextResponse.json({
      area,
      overall,
      demand,
      supply,
      future,
      stance,
      ebm: Math.round(ebm * 100) / 100,
      basicRatio: Math.round(basicRatio * 10) / 10,
      population: c?.population,
      popChangePct: c?.pop_change_pct,
      dataVintage: {
        economic_census: "2021",
        population_census: "2025速報",
        mlit: "2026Q1",
        projection: "社人研2025→2050",
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
