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
import { calcPrefScore, ebmHealthScore } from "@/lib/calc-score";

export async function GET(request: NextRequest) {
  const prefCode = request.nextUrl.searchParams.get("pref");
  const cityCode = request.nextUrl.searchParams.get("city");

  if (!prefCode || !/^\d{1,2}$/.test(prefCode)) {
    return NextResponse.json({ error: "pref パラメータが必要です（1-47の数字）" }, { status: 400 });
  }
  if (cityCode && !/^\d{5}$/.test(cityCode)) {
    return NextResponse.json({ error: "city パラメータは5桁の数字で指定してください" }, { status: 400 });
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

    // スコア計算（共通モジュール calcPrefScore を使用）
    const score = calcPrefScore(pref);
    const c = (city as any)?.census2025 ?? pref.census2025;
    const agg = pref.aggregate_gap_factor ?? 0;
    const area = city ? `${pref.pref_name} ${(city as any).area_name}` : pref.pref_name;

    // 物件タイプ別スコア（共通モジュールの中間値を使用）
    const eH = score._ebmHealth;
    const rS = score._ratioScore;
    const sS = score._scaleScore;
    const transit = Math.min(100, (pref.total_daily_riders ?? 0) / 500);
    const floodSafe = 100 - (pref.flood_risk_avg_pct ?? 0) * 3;

    return NextResponse.json({
      area,
      overall: score.overall,
      demand: score.demand,
      economicBase: score.supply,
      supply: score.supply,
      future: score.future,
      stance: score.stance,
      ebm: parseFloat(score.ebm),
      basicRatio: parseFloat(score.basicRatio),
      population: score._population,
      popChangePct: score._popChangePct,
      propertyScores: [
        { type: "residential", label: "住居系", score: Math.round(0.15 * eH + 0.30 * score.demand + 0.20 * floodSafe + 0.20 * transit + 0.15 * score.future), verdict: "" },
        { type: "commercial", label: "商業系", score: Math.round(0.22 * Math.max(0, Math.min(100, 50 + agg * 3)) + 0.18 * rS + 0.18 * transit + 0.12 * score.demand + 0.10 * score.future + 0.10 * floodSafe + 0.10 * score.demand), verdict: "" },
        { type: "office", label: "オフィス", score: Math.round(0.30 * rS + 0.20 * eH + 0.20 * score.future + 0.15 * sS + 0.15 * transit), verdict: "" },
        { type: "industrial", label: "物流・工業", score: Math.round(0.25 * rS + 0.15 * eH + 0.20 * Math.max(0, 100 - (pref.land_price_median_l01 ?? 0) / 5000) + 0.20 * sS + 0.20 * floodSafe), verdict: "" },
        { type: "medical", label: "医療・介護", score: Math.round(0.25 * rS + 0.30 * Math.max(0, Math.min(100, -(c?.pop_change_pct ?? 0) * 4 + 40)) + 0.15 * transit + 0.15 * sS + 0.15 * floodSafe), verdict: "" },
      ].map(s => ({ ...s, verdict: s.score >= 70 ? "推奨" : s.score >= 50 ? "条件付推奨" : s.score >= 30 ? "様子見" : "回避" }))
        .sort((a, b) => b.score - a.score),
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
