/**
 * ヘルスチェック + データ整合性検証エンドポイント
 *
 * GET /api/health
 * → データ鮮度、スコア整合性、API依存関係のステータスを返す
 *
 * モニタリング: 外部cronで日次チェック可能
 * 例: curl https://ci102-market-analysis.vercel.app/api/health
 */

import { NextResponse } from "next/server";

export async function GET() {
  const checks: Array<{ name: string; status: "ok" | "warn" | "fail"; detail: string }> = [];
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

  // 1. prefectures.json の読み込み
  try {
    const res = await fetch(`${baseUrl}/data/prefectures.json`);
    if (res.ok) {
      const data = await res.json();
      const prefCount = Object.keys(data).length;
      const tokyo = data["13"];
      if (prefCount === 47 && tokyo?.ebm_mid != null) {
        checks.push({ name: "prefectures_data", status: "ok", detail: `${prefCount}県, 東京EBM_mid=${tokyo.ebm_mid}` });
      } else {
        checks.push({ name: "prefectures_data", status: "warn", detail: `${prefCount}県 (期待:47)` });
      }
    } else {
      checks.push({ name: "prefectures_data", status: "fail", detail: `HTTP ${res.status}` });
    }
  } catch (e) {
    checks.push({ name: "prefectures_data", status: "fail", detail: String(e) });
  }

  // 2. スコアAPIの整合性
  try {
    const res = await fetch(`${baseUrl}/api/score?pref=13`);
    if (res.ok) {
      const score = await res.json();
      const overall = score.overall;
      if (typeof overall === "number" && overall >= 0 && overall <= 100 && !isNaN(overall)) {
        checks.push({ name: "score_api", status: "ok", detail: `東京 overall=${overall}` });
      } else {
        checks.push({ name: "score_api", status: "fail", detail: `異常値: overall=${overall}` });
      }
      // propertyScoresのNaNチェック
      const propScores = score.propertyScores ?? [];
      const nanScores = propScores.filter((s: { score: number }) => isNaN(s.score));
      if (nanScores.length > 0) {
        checks.push({ name: "score_nan_check", status: "fail", detail: `${nanScores.length}件のNaN検出` });
      } else {
        checks.push({ name: "score_nan_check", status: "ok", detail: `${propScores.length}タイプ全て正常` });
      }
    } else {
      checks.push({ name: "score_api", status: "fail", detail: `HTTP ${res.status}` });
    }
  } catch (e) {
    checks.push({ name: "score_api", status: "fail", detail: String(e) });
  }

  // 3. 通勤経済圏APIの動作
  try {
    const res = await fetch(`${baseUrl}/api/commute-zone?center=13101&threshold=10`);
    if (res.ok) {
      const data = await res.json();
      const n = data.zone?.length ?? 0;
      if (n > 1) {
        checks.push({ name: "commute_zone_api", status: "ok", detail: `千代田区10%→${n}市区町村` });
      } else {
        checks.push({ name: "commute_zone_api", status: "warn", detail: `${n}市区町村のみ` });
      }
    } else {
      checks.push({ name: "commute_zone_api", status: "fail", detail: `HTTP ${res.status}` });
    }
  } catch (e) {
    checks.push({ name: "commute_zone_api", status: "fail", detail: String(e) });
  }

  // 4. データ鮮度
  const dataVintage = {
    economic_census: "2021",
    population_census: "2025速報",
    mlit_transactions: "2026Q1",
    commute_od: "2020国勢調査",
    louvain: "2020国勢調査OD",
  };
  checks.push({ name: "data_vintage", status: "ok", detail: JSON.stringify(dataVintage) });

  // 結果
  const overallStatus = checks.some(c => c.status === "fail") ? "fail" : checks.some(c => c.status === "warn") ? "warn" : "ok";

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  }, {
    headers: { "Cache-Control": "no-cache" },
  });
}
