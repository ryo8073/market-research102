"use client";

import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid, Legend,
  ScatterChart, Scatter, ZAxis, ReferenceArea, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData, type MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";
import { InfoBox, RiskAlert, CaseStudy, ClientTip, InterpTable } from "@/components/ui/callouts";

interface Props {
  prefCode: number;
  prefName: string;
  pref: PrefectureData;
  allData: Record<string, PrefectureData> | null;
}

/**
 * Housing demand cascade (EBM-style):
 * Pop → Households (÷世帯人員) → Housing units needed
 * CI102 PER (Population-Employment Ratio) concept applied to projections
 */
function estimateHousingDemand(pop: number, personsPerHH: number): number {
  if (personsPerHH <= 0) return 0;
  return Math.round(pop / personsPerHH);
}

export default function DemographicsTab({ prefCode, prefName, pref, allData }: Props) {
  const { data: municipalities } = useMunicipalityData(prefCode);

  // Population projection time series
  const popTimeSeries = useMemo(() => {
    if (!pref.pop_projection) return [];
    return Object.entries(pref.pop_projection)
      .map(([year, pop]) => ({
        year: parseInt(year),
        population: pop,
        households: estimateHousingDemand(pop, pref.persons_per_household),
      }))
      .sort((a, b) => a.year - b.year);
  }, [pref.pop_projection, pref.persons_per_household]);

  // Housing demand cascade from population projection
  const demandCascade = useMemo(() => {
    if (popTimeSeries.length < 2) return null;
    const earliest = popTimeSeries[0];
    const latest = popTimeSeries[popTimeSeries.length - 1];
    const popChange = latest.population - earliest.population;
    const hhChange = latest.households - earliest.households;
    return {
      baseYear: earliest.year,
      targetYear: latest.year,
      popChange,
      popChangePct: ((popChange / earliest.population) * 100).toFixed(1),
      hhChange,
      // Assume 1.05 vacancy rate buffer
      unitDemandChange: Math.round(hhChange * 1.05),
      personsPerHH: pref.persons_per_household,
    };
  }, [popTimeSeries, pref.persons_per_household]);

  // Location Plan × Population trend (strategic positioning matrix)
  const strategyMatrix = useMemo(() => {
    return municipalities
      .filter((m) => m.pop_2050 != null && m.pop_2030 != null && m.pop_2030 > 0)
      .map((m) => {
        const popChange = ((m.pop_2050! - m.pop_2030!) / m.pop_2030!) * 100;
        return {
          name: m.area_name,
          popChange: parseFloat(popChange.toFixed(1)),
          hasPlan: m.has_location_plan ? 1 : 0,
          did: m.did_area_ha ?? 0,
          landPrice: m.land_price_median ?? 0,
        };
      });
  }, [municipalities]);

  // Municipalities with plan + growing population (best quadrant)
  const bestPositioned = useMemo(() => {
    return strategyMatrix
      .filter((m) => m.hasPlan === 1 && m.popChange > -10)
      .sort((a, b) => b.popChange - a.popChange);
  }, [strategyMatrix]);
  const worstPositioned = useMemo(() => {
    return strategyMatrix
      .filter((m) => m.hasPlan === 0 && m.popChange < -20)
      .sort((a, b) => a.popChange - b.popChange);
  }, [strategyMatrix]);

  // DID urbanization intensity
  const didIntensity = useMemo(() => {
    return municipalities
      .filter((m) => (m.did_area_ha ?? 0) > 0 && (m.did_population ?? 0) > 0)
      .map((m) => ({
        name: m.area_name,
        density: Math.round((m.did_population ?? 0) / (m.did_area_ha ?? 1) * 100) / 100, // 人/ha
        area: m.did_area_ha!,
        pop: m.did_population!,
        hasPlan: m.has_location_plan ?? false,
      }))
      .sort((a, b) => b.density - a.density)
      .slice(0, 15);
  }, [municipalities]);

  // National population decline ranking
  const nationalPopChange = useMemo(() => {
    if (!allData) return [];
    return Object.values(allData)
      .filter((p) => p.pop_change_pct != null)
      .map((p) => ({
        name: p.pref_name,
        change: p.pop_change_pct!,
        isCurrent: p.pref_code === prefCode,
      }))
      .sort((a, b) => a.change - b.change);
  }, [allData, prefCode]);

  // Location optimization plan summary
  const locationPlanMunis = useMemo(() => {
    return municipalities.filter((m) => m.has_location_plan === true);
  }, [municipalities]);

  const hasData = popTimeSeries.length > 0 || didIntensity.length > 0 || nationalPopChange.length > 0;

  return (
    <div className="space-y-6">
      <ReadingGuide
        steps={[
          { title: "人口推計→住宅需要カスケード", description: "人口変動から世帯数→住宅需要への波及を数量的に把握" },
          { title: "立地戦略マトリクスで投資先を選定", description: "人口動態×立地適正化計画の4象限で将来性を判定" },
          { title: "DID密度で都市集約度を評価", description: "コンパクトシティの進行度が不動産価値の持続性を決める" },
        ]}
      />

      {/* So What? — 結論サマリー */}
      {hasData && (
        <Card className="border-2 border-[#1B2A4A] bg-[#1B2A4A]/5">
          <CardContent className="pt-4">
            <p className="text-sm font-bold text-[#1B2A4A] dark:text-white mb-1">
              {prefName}の人口動態判定
            </p>
            <p className="text-sm">
              {(() => {
                const change = pref.pop_change_pct ?? 0;
                const planCount = pref.has_location_plan_count ?? 0;
                if (change > 0) return `人口増加傾向（推計+${change.toFixed(1)}%）。住宅需要は堅調で、新築開発・バリューアップ両方が検討可能です。立地適正化計画${planCount}自治体が策定済みで、居住誘導区域内は特に有望。`;
                if (change > -10) return `緩やかな人口減少（推計${change.toFixed(1)}%）。全体の住宅需要は縮小傾向ですが、DID内の高密度エリアや立地適正化計画区域（${planCount}自治体）は需要維持が見込めます。選別投資が重要。`;
                if (change > -20) return `明確な人口減少（推計${change.toFixed(1)}%）。新規開発は原則回避し、既存高稼働物件のみ選別投資。立地適正化計画区域外は撤退・用途転換も視野に入れてください。`;
                return `急激な人口流出（推計${change.toFixed(1)}%）。不動産投資は原則回避。やむを得ない場合は医療・介護等のディフェンシブ用途に限定し、出口戦略を最初から計画してください。`;
              })()}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 構造矛盾の解説: 雇用増 × 人口減 */}
      {hasData && pref.actual_emp_change != null && (pref.pop_change_pct ?? 0) < 0 && (
        <Card className="border-l-4 border-l-[#D4A843]">
          <CardHeader>
            <CardTitle className="text-sm">なぜ雇用は増えているのに人口は減るのか？</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <p>
              {prefName}では2016→2021年に雇用が
              <strong className={pref.actual_emp_change > 0 ? "text-green-600" : "text-red-600"}>
                {pref.actual_emp_change > 0 ? "+" : ""}{pref.actual_emp_change.toLocaleString()}人
              </strong>
              {pref.actual_emp_change > 0 ? "増加" : "減少"}した一方、
              将来推計人口は2020→2040年で
              <strong className="text-red-600">{pref.pop_change_pct?.toFixed(1)}%</strong>の減少が見込まれています。
              {pref.actual_emp_change > 0 && " この一見矛盾する現象は、日本全体で起きている構造変化です。"}
            </p>

            {pref.actual_emp_change > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 px-2 font-semibold">要因</th>
                      <th className="text-left py-1.5 px-2 font-semibold">説明</th>
                      <th className="text-left py-1.5 px-2 font-semibold">投資への影響</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1.5 px-2 font-medium">労働参加率の上昇</td>
                      <td className="py-1.5 px-2">女性・高齢者の就業率が過去最高。人口減でも「働く人」は増加</td>
                      <td className="py-1.5 px-2">テナント需要は短期的に維持されるが、退職に伴う急減リスクあり</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2 font-medium">外国人労働者の増加</td>
                      <td className="py-1.5 px-2">2016→2021で約50万人増。住民票上の人口には反映されにくい</td>
                      <td className="py-1.5 px-2">工場・物流エリアの賃貸住宅需要を支える</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2 font-medium">パート・非正規の増加</td>
                      <td className="py-1.5 px-2">サービス業を中心に雇用者数は増加、1人あたり労働時間は横ばい</td>
                      <td className="py-1.5 px-2">雇用の「質」が低いと賃料負担力に限界がある</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2 font-medium">データの時点差</td>
                      <td className="py-1.5 px-2">雇用=2016-2021実績、人口=2020-2040推計。過去と将来が混在</td>
                      <td className="py-1.5 px-2">短期(雇用実績)は強気、長期(人口推計)は慎重に</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">投資判断への示唆</p>
              <p className="text-xs">
                {pref.actual_emp_change > 0
                  ? `短期（5-10年）では雇用増がテナント需要を支えますが、長期（20年超）では人口減少による住宅需要の構造的縮小が不可避です。「今の雇用成長」で買い、「人口減少が顕在化する前」に売る — 出口戦略を最初から計画した投資が合理的です。EBMタブの雇用分析は短期の需要見通し、この人口動態タブは長期の構造リスクを示しています。`
                  : `雇用も人口もともに減少傾向であり、需要の構造的縮小フェーズにあります。投資する場合は、立地適正化計画の居住誘導区域内に限定し、ディフェンシブ用途（医療・介護・生活必需品）を優先してください。`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasData ? (
        <InfoBox title="データ未取得">
          人口推計データは国土数値情報からダウンロードが必要です。
          <code className="text-xs block mt-1">python scripts/download_nlni.py --dataset mesh_pop did location_opt</code>
        </InfoBox>
      ) : (
        <>
          {/* Housing Demand Cascade (EBM-style) */}
          {demandCascade && (
            <Card className="border-l-4 border-l-[#2A9D8F]">
              <CardHeader>
                <CardTitle className="text-sm">住宅需要カスケード — 人口推計から住宅需要への波及</CardTitle>
                <p className="text-xs text-muted-foreground">
                  CI102 EBM×PER手法を将来推計に適用: 人口変動 → 世帯数変動 → 住宅需要変動
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 py-4">
                  {/* Step 1: Population */}
                  <div className="text-center px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border">
                    <p className="text-[10px] text-muted-foreground">人口変動</p>
                    <p className="text-[10px] text-muted-foreground">({demandCascade.baseYear}→{demandCascade.targetYear})</p>
                    <p className={`text-xl font-bold ${demandCascade.popChange < 0 ? "text-red-600" : "text-green-600"}`}>
                      {demandCascade.popChange > 0 ? "+" : ""}{(demandCascade.popChange / 10000).toFixed(1)}万人
                    </p>
                    <p className="text-[10px]">({demandCascade.popChangePct}%)</p>
                  </div>
                  <span className="text-2xl text-muted-foreground hidden md:block">→</span>
                  <span className="text-2xl text-muted-foreground md:hidden rotate-90">→</span>
                  {/* Step 2: Multiplier */}
                  <div className="text-center px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border">
                    <p className="text-[10px] text-muted-foreground">÷ 世帯人員</p>
                    <p className="text-xl font-bold">{demandCascade.personsPerHH.toFixed(2)}</p>
                    <p className="text-[10px]">人/世帯</p>
                  </div>
                  <span className="text-2xl text-muted-foreground hidden md:block">→</span>
                  <span className="text-2xl text-muted-foreground md:hidden rotate-90">→</span>
                  {/* Step 3: Household change */}
                  <div className="text-center px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border">
                    <p className="text-[10px] text-muted-foreground">世帯数変動</p>
                    <p className={`text-xl font-bold ${demandCascade.hhChange < 0 ? "text-red-600" : "text-green-600"}`}>
                      {demandCascade.hhChange > 0 ? "+" : ""}{(demandCascade.hhChange / 10000).toFixed(2)}万世帯
                    </p>
                  </div>
                  <span className="text-2xl text-muted-foreground hidden md:block">→</span>
                  <span className="text-2xl text-muted-foreground md:hidden rotate-90">→</span>
                  {/* Step 4: Housing demand */}
                  <div className="text-center px-4 py-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200">
                    <p className="text-[10px] text-muted-foreground">住宅需要変動</p>
                    <p className="text-[10px] text-muted-foreground">(×1.05空室バッファ)</p>
                    <p className={`text-xl font-bold ${demandCascade.unitDemandChange < 0 ? "text-red-600" : "text-green-600"}`}>
                      {demandCascade.unitDemandChange > 0 ? "+" : ""}{(demandCascade.unitDemandChange / 10000).toFixed(2)}万戸
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-center text-muted-foreground mt-2">
                  ※ シミュレーション: 現トレンドが続いた場合の推計値。大規模開発・政策変更は未考慮。
                </p>
              </CardContent>
            </Card>
          )}

          {/* Population projection chart */}
          {popTimeSeries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} 将来推計人口 × 世帯数</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={popTimeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis yAxisId="pop" tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                    <YAxis yAxisId="hh" orientation="right" tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                    <Tooltip
                      formatter={(value, name) => [
                        `${Number(value).toLocaleString()}${name === "population" ? "人" : "世帯"}`,
                        name === "population" ? "推計人口" : "推計世帯数"
                      ]}
                    />
                    <Legend formatter={(value) => value === "population" ? "推計人口" : "推計世帯数"} />
                    <Area yAxisId="pop" type="monotone" dataKey="population" stroke="#2A9D8F" fill="#2A9D8F" fillOpacity={0.15} strokeWidth={2} />
                    <Area yAxisId="hh" type="monotone" dataKey="households" stroke="#6366F1" fill="#6366F1" fillOpacity={0.1} strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  出典: 国土数値情報 1kmメッシュ別将来推計人口（H30国立社会保障・人口問題研究所推計）
                </p>
              </CardContent>
            </Card>
          )}

          {/* Strategic Positioning Matrix: Location Plan × Pop Trend */}
          {strategyMatrix.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">立地戦略マトリクス — 人口動態 × 立地適正化計画</CardTitle>
                <p className="text-xs text-muted-foreground">
                  横軸: 人口変動率(2030→2050)、色: 立地適正化計画の有無。計画ありで人口維持=最優位
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <ReferenceArea x1={-50} x2={0} y1={0} y2={1}
                      fill="#EF4444" fillOpacity={0.04}
                      label={{ value: "人口減少×計画なし\n（最も脆弱）", position: "insideBottomLeft", fontSize: 9, fill: "#DC2626" }} />
                    <ReferenceArea x1={0} x2={50} y1={0} y2={1}
                      fill="#F59E0B" fillOpacity={0.04}
                      label={{ value: "人口維持×計画なし", position: "insideBottomRight", fontSize: 9, fill: "#D97706" }} />
                    <ReferenceArea x1={-50} x2={0} y1={1} y2={2}
                      fill="#3B82F6" fillOpacity={0.04}
                      label={{ value: "人口減少×計画あり\n（行政支援期待）", position: "insideTopLeft", fontSize: 9, fill: "#2563EB" }} />
                    <ReferenceArea x1={0} x2={50} y1={1} y2={2}
                      fill="#22C55E" fillOpacity={0.06}
                      label={{ value: "人口維持×計画あり\n（最優位）", position: "insideTopRight", fontSize: 9, fill: "#16A34A" }} />
                    <ReferenceLine x={0} stroke="#6B7280" strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="popChange" name="人口変動率"
                      label={{ value: "人口変動率(2030→2050, %)", position: "bottom", fontSize: 11 }} />
                    <YAxis type="number" dataKey="hasPlan" domain={[-0.5, 1.5]} hide />
                    <ZAxis type="number" dataKey="did" range={[30, 150]} name="DID面積" />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                            <p className="font-bold">{d.name}</p>
                            <p>人口変動: {d.popChange > 0 ? "+" : ""}{d.popChange}%</p>
                            <p>立地適正化計画: {d.hasPlan ? "策定済" : "未策定"}</p>
                            <p>DID面積: {d.did.toFixed(0)} ha</p>
                            <p>地価: {d.landPrice > 0 ? `${d.landPrice.toLocaleString()}円/m²` : "—"}</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={strategyMatrix.filter((m) => m.hasPlan === 1)} fill="#2A9D8F" fillOpacity={0.7} name="計画あり" />
                    <Scatter data={strategyMatrix.filter((m) => m.hasPlan === 0)} fill="#E76F51" fillOpacity={0.5} name="計画なし" />
                    <Legend />
                  </ScatterChart>
                </ResponsiveContainer>

                {/* Best/Worst positioned summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {bestPositioned.length > 0 && (
                    <div className="p-3 rounded bg-green-50 dark:bg-green-950/20 border border-green-200">
                      <p className="text-xs font-semibold text-green-700 mb-1">最優位エリア（計画あり×人口維持）</p>
                      <div className="flex flex-wrap gap-1">
                        {bestPositioned.slice(0, 8).map((m) => (
                          <span key={m.name} className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded text-[10px]">
                            {m.name} ({m.popChange > 0 ? "+" : ""}{m.popChange}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {worstPositioned.length > 0 && (
                    <div className="p-3 rounded bg-red-50 dark:bg-red-950/20 border border-red-200">
                      <p className="text-xs font-semibold text-red-700 mb-1">脆弱エリア（計画なし×人口急減）</p>
                      <div className="flex flex-wrap gap-1">
                        {worstPositioned.slice(0, 8).map((m) => (
                          <span key={m.name} className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded text-[10px]">
                            {m.name} ({m.popChange}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* DID Urbanization Intensity */}
          {didIntensity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">都市集約度 — DID人口密度ランキング</CardTitle>
                <p className="text-xs text-muted-foreground">
                  DID（人口集中地区）の密度が高い＝コンパクトに都市化＝インフラ効率が良く不動産価値が持続しやすい
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, didIntensity.length * 28)}>
                  <BarChart data={didIntensity} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" label={{ value: "人/ha", position: "bottom", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                            <p className="font-bold">{d.name}</p>
                            <p>DID密度: {d.density.toFixed(1)} 人/ha</p>
                            <p>DID面積: {d.area.toFixed(0)} ha</p>
                            <p>DID人口: {d.pop.toLocaleString()}人</p>
                            <p>立地適正化計画: {d.hasPlan ? "✓ 策定済" : "— 未策定"}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="density" name="DID密度(人/ha)">
                      {didIntensity.map((entry, i) => (
                        <Cell key={i} fill={entry.hasPlan ? "#6366F1" : "#94A3B8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#6366F1] inline-block rounded" />立地適正化計画あり</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-[#94A3B8] inline-block rounded" />計画なし</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* National comparison */}
          {nationalPopChange.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">全国比較 — 推計人口変動率（全47都道府県）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={600}>
                  <BarChart data={nationalPopChange} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 9 }} />
                    <ReferenceLine x={0} stroke="#6B7280" />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "人口変動率"]} />
                    <Bar dataKey="change" name="変動率">
                      {nationalPopChange.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.isCurrent ? "#2A9D8F" : entry.change < 0 ? "#EF4444" : "#22C55E"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Interpretation */}
          <InterpTable
            headers={["人口変動率", "市場影響", "投資戦略", "リスク"]}
            rows={[
              ["+5%以上", "需要拡大・地価上昇圧力", "開発型投資、新築", "過熱・バブルリスク"],
              ["0〜+5%", "安定需要", "既存物件のバリューアップ", "低い"],
              ["-10〜0%", "緩やかな縮小", "高稼働物件のみ選別投資", "空室率上昇"],
              ["-20〜-10%", "明確な縮小", "撤退または用途転換", "テナント流出"],
              ["-20%以下", "急激な人口流出", "原則投資回避", "資産価値毀損"],
            ]}
          />

          <ClientTip>
            「{prefName}の推計人口変動率は{pref.pop_change_pct != null ? `${pref.pop_change_pct > 0 ? "+" : ""}${pref.pop_change_pct}%` : "—"}です。
            {(pref.pop_change_pct ?? 0) < -10
              ? "人口減少が顕著なため、立地適正化計画のエリア内に投資を集中し、計画外エリアは慎重に判断することをお勧めします。"
              : (pref.pop_change_pct ?? 0) < 0
              ? "緩やかな減少傾向ですが、DID内の高密度エリアは需要が維持されやすい傾向があります。"
              : "人口維持・増加傾向にあり、住宅需要は堅調と考えられます。"}」
          </ClientTip>

          <CaseStudy title="CI102 EBMカスケードとの接続">
            CI102で学ぶ Economic Base Multiplier (EBM) → PER → 住宅需要 のカスケードは、
            「雇用増が人口増を引き起こし、住宅需要に波及する」メカニズムを定量化する手法です。
            本タブの住宅需要カスケードは、国立社会保障・人口問題研究所の人口推計を入力として
            同様のロジックを適用しています。EBMタブでは「基盤雇用がN人増えたら」のWhat-If分析、
            本タブでは「人口推計に基づく長期需要トレンド」と、両面から住宅市場を評価できます。
          </CaseStudy>

          <RiskAlert title="将来推計の限界（遅行指標）">
            本推計はH30（2018年）時点の社人研推計に基づき、2015年国勢調査の人口を基準としています。
            以下の要因は織り込まれていません: 大規模開発（IR/新幹線延伸等）、COVID-19後の地方移住、
            自治体の積極的な子育て支援策。あくまで「過去のトレンドが続いた場合」の参考値として
            利用し、直近の転入超過データ等と併せて判断してください。
          </RiskAlert>
        </>
      )}
    </div>
  );
}
