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
import { calcPrefScore, ebmHealthScore, economicBaseScore } from "@/lib/calc-score";

export async function GET(request: NextRequest) {
  const prefCode = request.nextUrl.searchParams.get("pref");
  const cityCode = request.nextUrl.searchParams.get("city");
  const zoneParam = request.nextUrl.searchParams.get("zone");

  if (!prefCode || !/^\d{1,2}$/.test(prefCode)) {
    return NextResponse.json({ error: "pref パラメータが必要です（1-47の数字）" }, { status: 400 });
  }
  if (cityCode && !/^\d{5}$/.test(cityCode)) {
    return NextResponse.json({ error: "city パラメータは5桁の数字で指定してください" }, { status: 400 });
  }
  if (zoneParam && !/^\d{5}(,\d{5})*$/.test(zoneParam)) {
    return NextResponse.json({ error: "zone パラメータは5桁コードのカンマ区切りで指定してください" }, { status: 400 });
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

    // 経済圏（複数市区町村合算）モード: 中分類マトリクスからEBM/基盤比率を集計（改善⑥）
    let econEbm: number | null = null;
    let econBasicRatio: number | null = null;
    let econTotalEmp: number | null = null;
    let econSupply: number | null = null;
    if (zoneParam) {
      const codes = zoneParam.split(",").filter((s) => /^\d{5}$/.test(s));
      const mRes = await fetch(`${baseUrl}/data/muni_industry_matrix_mid.json`);
      if (mRes.ok && codes.length > 0) {
        const matrix = (await mRes.json()) as Record<string, { employment: Record<string, number> }>;
        const national = matrix["00000"]?.employment ?? {};
        const totalNational = Object.values(national).reduce((s, v) => s + Number(v), 0);
        const local: Record<string, number> = {};
        for (const code of codes) {
          const emp = matrix[code]?.employment;
          if (!emp) continue;
          for (const [ind, cnt] of Object.entries(emp)) local[ind] = (local[ind] ?? 0) + Number(cnt);
        }
        const totalLocal = Object.values(local).reduce((s, v) => s + v, 0);
        if (totalLocal > 0 && totalNational > 0) {
          let totalBasic = 0;
          for (const [ind, e] of Object.entries(local)) {
            const E = national[ind] ?? 0;
            if (!E) continue;
            const lq = (e / totalLocal) / (E / totalNational);
            if (lq > 1) totalBasic += e * (1 - 1 / lq);
          }
          econTotalEmp = totalLocal;
          econEbm = totalBasic > 0 ? totalLocal / totalBasic : 0;
          econBasicRatio = (totalBasic / totalLocal) * 100;
          econSupply = economicBaseScore(econEbm, econBasicRatio, totalLocal);
        }
      }
    }

    // 経済基盤スコア（zone優先）と、それに整合する総合スコア・スタンス
    const supplyFinal = econSupply ?? score.supply;
    const overallFinal = econSupply != null
      ? Math.round(0.4 * score.demand + 0.3 * supplyFinal + 0.3 * score.future)
      : score.overall;
    const stanceFinal = overallFinal >= 70 ? "積極取得" : overallFinal >= 55 ? "選別取得" : overallFinal >= 40 ? "様子見" : "見送り";

    // 物件タイプ別スコア（共通モジュールの中間値を使用）
    const eH = econEbm != null ? ebmHealthScore(econEbm) : score._ebmHealth;
    const rS = econBasicRatio != null ? Math.min(100, Math.max(0, econBasicRatio * 4)) : score._ratioScore;
    const sS = econTotalEmp != null ? Math.min(100, Math.max(0, Math.log10(Math.max(1, econTotalEmp)) * 20 - 20)) : score._scaleScore;
    const transit = Math.min(100, (pref.total_daily_riders ?? 0) / 500);
    // 0-100 にクランプ（浸水率>33% で負値になり物件スコアを引き下げる不具合を防止・P2）
    const floodSafe = Math.max(0, Math.min(100, 100 - (pref.flood_risk_avg_pct ?? 0) * 3));

    return NextResponse.json({
      area,
      overall: overallFinal,
      demand: score.demand,
      economicBase: supplyFinal,
      supply: supplyFinal,
      future: score.future,
      stance: stanceFinal,
      scope: zoneParam ? "経済圏（複数市区町村合算）" : cityCode ? "市区町村" : "都道府県",
      ebm: econEbm != null ? Math.round(econEbm * 100) / 100 : parseFloat(score.ebm),
      basicRatio: econBasicRatio != null ? Math.round(econBasicRatio * 10) / 10 : parseFloat(score.basicRatio),
      population: score._population,
      popChangePct: score._popChangePct,
      propertyScores: [
        { type: "residential", label: "住居系", score: Math.round(0.15 * eH + 0.30 * score.demand + 0.20 * floodSafe + 0.20 * transit + 0.15 * score.future), verdict: "" },
        // demand の二重計上を解消（旧: 0.12+0.10 の2項）。重複分は経済基盤健全度(eH)へ振替（P2）
        { type: "commercial", label: "商業系", score: Math.round(0.22 * Math.max(0, Math.min(100, 50 + agg * 3)) + 0.18 * rS + 0.18 * transit + 0.12 * score.demand + 0.10 * score.future + 0.10 * floodSafe + 0.10 * eH), verdict: "" },
        { type: "office", label: "オフィス", score: Math.round(0.30 * rS + 0.20 * eH + 0.20 * score.future + 0.15 * sS + 0.15 * transit), verdict: "" },
        { type: "industrial", label: "物流・工業", score: Math.round(0.25 * rS + 0.15 * eH + 0.20 * Math.max(0, 100 - (pref.land_price_median_l01 ?? 0) / 5000) + 0.20 * sS + 0.20 * floodSafe), verdict: "" },
        { type: "medical", label: "医療・介護", score: Math.round(0.25 * rS + 0.30 * Math.max(0, Math.min(100, -(c?.pop_change_pct ?? 0) * 4 + 40)) + 0.15 * transit + 0.15 * sS + 0.15 * floodSafe), verdict: "" },
      ].map(s => ({ ...s, score: Math.max(0, Math.min(100, s.score)) }))
        .map(s => ({ ...s, verdict: s.score >= 70 ? "推奨" : s.score >= 50 ? "条件付推奨" : s.score >= 30 ? "様子見" : "回避" }))
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
