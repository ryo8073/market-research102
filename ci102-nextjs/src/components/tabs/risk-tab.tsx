"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis, CartesianGrid, ReferenceArea, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData, type MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";
import { RiskAlert, InfoBox, CaseStudy, ClientTip, InterpTable } from "@/components/ui/callouts";

interface Props {
  prefCode: number;
  prefName: string;
  pref: PrefectureData;
  allData: Record<string, PrefectureData> | null;
}

/** Cap Rate adjustment by flood risk level (basis points) */
function floodRiskPremiumBps(riskPct: number): number {
  if (riskPct >= 50) return 200;
  if (riskPct >= 30) return 150;
  if (riskPct >= 15) return 100;
  if (riskPct >= 5) return 50;
  return 0;
}

/** Infrastructure resilience score (0-100) */
function resilienceScore(m: MunicipalityData): number {
  const medicalPts = Math.min((m.num_medical ?? 0) * 10, 40);
  const busPts = Math.min((m.num_bus_stops ?? 0) * 2, 30);
  const stationPts = Math.min((m.num_stations ?? 0) * 15, 30);
  return Math.round(medicalPts + busPts + stationPts);
}

export default function RiskTab({ prefCode, prefName, pref, allData }: Props) {
  const { data: municipalities } = useMunicipalityData(prefCode);

  // Risk × Land Price scatter data (investment decision matrix)
  const riskPriceScatter = useMemo(() => {
    return municipalities
      .filter((m) => m.flood_risk_pct != null && m.land_price_median != null && m.land_price_median > 0)
      .map((m) => ({
        name: m.area_name,
        risk: m.flood_risk_pct!,
        price: Math.round(m.land_price_median! / 1000), // 千円/m²
        resilience: resilienceScore(m),
        premium: floodRiskPremiumBps(m.flood_risk_pct!),
      }));
  }, [municipalities]);

  // Median values for quadrant reference lines
  const medianRisk = useMemo(() => {
    const risks = riskPriceScatter.map((d) => d.risk).sort((a, b) => a - b);
    return risks.length > 0 ? risks[Math.floor(risks.length / 2)] : 15;
  }, [riskPriceScatter]);
  const medianPrice = useMemo(() => {
    const prices = riskPriceScatter.map((d) => d.price).sort((a, b) => a - b);
    return prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 100;
  }, [riskPriceScatter]);

  // Cap Rate adjustment table by municipality
  const capRateAdjustment = useMemo(() => {
    return municipalities
      .filter((m) => m.flood_risk_pct != null && m.flood_risk_pct > 0)
      .map((m) => ({
        name: m.area_name,
        floodRisk: m.flood_risk_pct!,
        premium: floodRiskPremiumBps(m.flood_risk_pct!),
        landPrice: m.land_price_median ?? 0,
        resilience: resilienceScore(m),
      }))
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 15);
  }, [municipalities]);

  // Risk × Resilience: municipalities with high risk but low infrastructure
  const vulnerableMunis = useMemo(() => {
    return municipalities
      .filter((m) => (m.flood_risk_pct ?? 0) > 10)
      .map((m) => ({
        name: m.area_name,
        risk: m.flood_risk_pct ?? 0,
        resilience: resilienceScore(m),
        medical: m.num_medical ?? 0,
        busStops: m.num_bus_stops ?? 0,
      }))
      .sort((a, b) => b.risk - a.risk - (b.resilience - a.resilience))
      .slice(0, 10);
  }, [municipalities]);

  // National comparison
  const nationalFloodData = useMemo(() => {
    if (!allData) return [];
    return Object.values(allData)
      .filter((p) => p.flood_risk_avg_pct != null)
      .map((p) => ({
        name: p.pref_name,
        value: p.flood_risk_avg_pct ?? 0,
        isCurrent: p.pref_code === prefCode,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }, [allData, prefCode]);

  const hasFloodData = capRateAdjustment.length > 0 || nationalFloodData.length > 0;

  return (
    <div className="space-y-6">
      <ReadingGuide
        steps={[
          { title: "リスク×地価を可視化", description: "散布図で高リスク＋高地価エリア（危険ゾーン）を特定" },
          { title: "利回り調整幅を確認", description: "浸水リスク度に応じたCap Rate上乗せ幅を把握" },
          { title: "インフラ回復力を評価", description: "医療・交通インフラの充実度で被災後の回復力を判定" },
        ]}
      />

      {/* So What? — 結論サマリー */}
      {hasFloodData && (
        <Card className="border-2 border-[#1B2A4A] bg-[#1B2A4A]/5">
          <CardContent className="pt-4">
            <p className="text-sm font-bold text-[#1B2A4A] dark:text-white mb-1">
              {prefName}の災害リスク判定
            </p>
            <p className="text-sm">
              {(pref.flood_risk_avg_pct ?? 0) >= 20
                ? `浸水リスクが高い地域です（平均${pref.flood_risk_avg_pct?.toFixed(1)}%）。RC造高層階・1F非居住設計を条件とし、Cap Rate +${floodRiskPremiumBps(pref.flood_risk_avg_pct ?? 0)}bps以上の利回りが取れない物件は回避を推奨します。`
                : (pref.flood_risk_avg_pct ?? 0) >= 5
                ? `中程度の浸水リスク（平均${pref.flood_risk_avg_pct?.toFixed(1)}%）。個別物件ごとにハザードマップを確認し、Cap Rate +${floodRiskPremiumBps(pref.flood_risk_avg_pct ?? 0)}bpsのリスクプレミアムを織り込んだ投資判断を行ってください。`
                : `浸水リスクは低い水準です（平均${pref.flood_risk_avg_pct?.toFixed(1) ?? "—"}%）。リスクプレミアムの上乗せは不要ですが、局所的な低地の確認は必要です。`}
              {" "}医療施設密度{pref.num_medical != null && pref.population > 0
                ? `${(pref.num_medical / pref.population * 10000).toFixed(1)}施設/万人`
                : "—"}で、被災時の回復力は{(pref.num_medical ?? 0) / Math.max(pref.population, 1) * 10000 > 5 ? "良好" : "限定的"}。
            </p>
          </CardContent>
        </Card>
      )}

      {!hasFloodData ? (
        <InfoBox title="データ未取得">
          災害リスクデータは国土数値情報からダウンロードが必要です。
          <code className="text-xs block mt-1">python scripts/download_nlni.py --dataset flood land_prices</code>
        </InfoBox>
      ) : (
        <>
          {/* Summary KPIs with investment context */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">平均浸水リスク</p>
                <p className={`text-2xl font-bold ${(pref.flood_risk_avg_pct ?? 0) > 15 ? "text-red-600" : (pref.flood_risk_avg_pct ?? 0) > 5 ? "text-amber-600" : "text-green-600"}`}>
                  {pref.flood_risk_avg_pct != null ? `${pref.flood_risk_avg_pct}%` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  想定利回り調整: +{floodRiskPremiumBps(pref.flood_risk_avg_pct ?? 0)}bps
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">高リスク自治体</p>
                <p className="text-2xl font-bold text-red-600">
                  {municipalities.filter((m) => (m.flood_risk_pct ?? 0) > 30).length}
                </p>
                <p className="text-xs text-muted-foreground">浸水率30%超</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">医療施設密度</p>
                <p className="text-2xl font-bold">
                  {pref.num_medical != null && pref.population > 0
                    ? (pref.num_medical / pref.population * 10000).toFixed(1)
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">施設/万人（回復力指標）</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">全国順位</p>
                <p className="text-2xl font-bold">
                  {nationalFloodData.length > 0
                    ? `${nationalFloodData.findIndex((d) => d.isCurrent) + 1}/${nationalFloodData.length}`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">リスクが高い順</p>
              </CardContent>
            </Card>
          </div>

          {/* Risk × Land Price Investment Matrix (4 quadrants) */}
          {riskPriceScatter.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">投資判断マトリクス — 浸水リスク × 地価</CardTitle>
                <p className="text-xs text-muted-foreground">
                  4象限で各市区町村の投資ポジションを可視化。右上が最もリスクの高い「危険ゾーン」
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    {/* 4 quadrant backgrounds */}
                    <ReferenceArea x1={0} x2={medianRisk} y1={medianPrice} y2={999}
                      fill="#22C55E" fillOpacity={0.06} label={{ value: "優良立地", position: "insideTopLeft", fontSize: 10, fill: "#16A34A" }} />
                    <ReferenceArea x1={medianRisk} x2={100} y1={medianPrice} y2={999}
                      fill="#EF4444" fillOpacity={0.06} label={{ value: "危険ゾーン", position: "insideTopRight", fontSize: 10, fill: "#DC2626" }} />
                    <ReferenceArea x1={0} x2={medianRisk} y1={0} y2={medianPrice}
                      fill="#3B82F6" fillOpacity={0.06} label={{ value: "バリュー", position: "insideBottomLeft", fontSize: 10, fill: "#2563EB" }} />
                    <ReferenceArea x1={medianRisk} x2={100} y1={0} y2={medianPrice}
                      fill="#F59E0B" fillOpacity={0.06} label={{ value: "利回り狙い", position: "insideBottomRight", fontSize: 10, fill: "#D97706" }} />
                    <ReferenceLine x={medianRisk} stroke="#6B7280" strokeDasharray="3 3" />
                    <ReferenceLine y={medianPrice} stroke="#6B7280" strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="risk" name="浸水リスク" unit="%"
                      label={{ value: "浸水リスク(%)", position: "bottom", fontSize: 11 }} />
                    <YAxis type="number" dataKey="price" name="地価" unit="千円"
                      label={{ value: "地価(千円/m²)", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <ZAxis type="number" dataKey="resilience" range={[40, 200]} name="回復力" />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                            <p className="font-bold">{d.name}</p>
                            <p>浸水リスク: {d.risk}%</p>
                            <p>地価: {d.price}千円/m²</p>
                            <p>利回り上乗せ: +{d.premium}bps</p>
                            <p>回復力スコア: {d.resilience}/100</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={riskPriceScatter} fill="#2A9D8F" fillOpacity={0.7} />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Cap Rate Adjustment Table */}
          {capRateAdjustment.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Cap Rate 調整モデル — 災害リスクプレミアム</CardTitle>
                <p className="text-xs text-muted-foreground">
                  浸水リスクが高いエリアは、利回り上乗せ（リスクプレミアム）を織り込んだ投資判断が必要
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-1">市区町村</th>
                        <th className="text-right py-2 px-1">浸水率</th>
                        <th className="text-right py-2 px-1">利回り上乗せ</th>
                        <th className="text-right py-2 px-1">地価(円/m²)</th>
                        <th className="text-right py-2 px-1">回復力</th>
                        <th className="text-center py-2 px-1">判定</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capRateAdjustment.map((row) => (
                        <tr key={row.name} className="border-b hover:bg-muted/50">
                          <td className="py-1.5 px-1">{row.name}</td>
                          <td className="text-right py-1.5 px-1">
                            <span className={row.floodRisk > 30 ? "text-red-600 font-bold" : row.floodRisk > 10 ? "text-amber-600" : ""}>
                              {row.floodRisk.toFixed(1)}%
                            </span>
                          </td>
                          <td className="text-right py-1.5 px-1 font-mono">+{row.premium}bps</td>
                          <td className="text-right py-1.5 px-1">{row.landPrice > 0 ? row.landPrice.toLocaleString() : "—"}</td>
                          <td className="text-right py-1.5 px-1">
                            <span className={row.resilience >= 50 ? "text-green-600" : row.resilience >= 25 ? "text-amber-600" : "text-red-600"}>
                              {row.resilience}/100
                            </span>
                          </td>
                          <td className="text-center py-1.5 px-1">
                            {row.floodRisk > 30 && row.resilience < 30
                              ? <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">回避推奨</span>
                              : row.floodRisk > 15
                              ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">要検討</span>
                              : <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">許容</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vulnerability Analysis: High Risk + Low Infrastructure */}
          {vulnerableMunis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">脆弱性分析 — 高リスク × 低インフラ</CardTitle>
                <p className="text-xs text-muted-foreground">
                  浸水リスクが高く、かつ医療・交通インフラが不足しているエリア。被災時の回復に時間を要する
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(250, vulnerableMunis.length * 28)}>
                  <BarChart data={vulnerableMunis} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                            <p className="font-bold">{d.name}</p>
                            <p>浸水リスク: {d.risk}% / 回復力: {d.resilience}/100</p>
                            <p>医療施設: {d.medical} / バス停: {d.busStops}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="risk" name="浸水リスク(%)" fill="#EF4444" fillOpacity={0.7} stackId="a" />
                    <Bar dataKey="resilience" name="回復力スコア" fill="#22C55E" fillOpacity={0.5} stackId="b" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 inline-block rounded" />浸水リスク(%)</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 inline-block rounded" />回復力スコア</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* National comparison */}
          {nationalFloodData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">全国比較 — 平均浸水リスク上位20</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={500}>
                  <BarChart data={nationalFloodData} layout="vertical" margin={{ left: 60 }}>
                    <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "平均浸水率"]} />
                    <Bar dataKey="value" name="平均浸水率">
                      {nationalFloodData.map((entry, i) => (
                        <Cell key={i} fill={entry.isCurrent ? "#2A9D8F" : "#94A3B8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Interpretation guide */}
          <InterpTable
            headers={["浸水率", "利回り上乗せ", "投資判断", "根拠"]}
            rows={[
              ["50%以上", "+200bps", "原則回避", "建物価値の大幅毀損リスク、保険料高騰"],
              ["30-50%", "+150bps", "慎重検討", "RC造限定、1F非居住設計が条件"],
              ["15-30%", "+100bps", "条件付き可", "ハザードマップ・地盤調査で個別判断"],
              ["5-15%", "+50bps", "通常範囲", "一般的な保険付保で対応可能"],
              ["5%未満", "+0bps", "良好", "リスクプレミアム不要"],
            ]}
          />

          <ClientTip>
            「この地域の浸水リスクは{pref.flood_risk_avg_pct?.toFixed(1) ?? "—"}%です。
            不動産鑑定では、災害リスクに応じて利回りに{floodRiskPremiumBps(pref.flood_risk_avg_pct ?? 0)}bps
            （{(floodRiskPremiumBps(pref.flood_risk_avg_pct ?? 0) / 100).toFixed(2)}%）の上乗せを想定します。
            これは保険料コストや将来の修繕リスクを織り込んだ数値です。」
          </ClientTip>

          <RiskAlert title="災害リスクデータの限界">
            浸水想定区域データは「想定最大規模降雨」に基づくシミュレーション結果であり、
            実際の被災確率とは異なります。Cap Rate調整幅は教育目的の参考値であり、
            実務では地盤調査・過去の災害履歴・保険見積もりに基づいて個別判断してください。
            データ出典: 国土数値情報 洪水浸水想定区域（国土交通省, H24）
          </RiskAlert>
        </>
      )}
    </div>
  );
}
