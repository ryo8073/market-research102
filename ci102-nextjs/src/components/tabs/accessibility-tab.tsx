"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis, CartesianGrid, ReferenceLine,
  ReferenceArea, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData, type MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";
import { InfoBox, CaseStudy, ClientTip, InterpTable } from "@/components/ui/callouts";

interface Props {
  prefCode: number;
  prefName: string;
  pref: PrefectureData;
  allData: Record<string, PrefectureData> | null;
}

/**
 * Transit Score: composite weighted index (0-100)
 * Based on ESRI/Walk Score methodology adapted for Japanese markets:
 * - Stations presence & ridership density
 * - Bus stop coverage
 * - Commercial facility proximity
 */
function transitScore(m: MunicipalityData): number {
  const stationScore = Math.min((m.num_stations ?? 0) * 12, 30);
  const riderScore = Math.min(((m.daily_riders ?? 0) / 10000) * 15, 30);
  const busScore = Math.min((m.num_bus_stops ?? 0) * 1.5, 20);
  const commercialScore = Math.min((m.num_commercial ?? 0) * 2, 20);
  return Math.round(stationScore + riderScore + busScore + commercialScore);
}

/** Ridership efficiency: riders per station (demand concentration) */
function ridersPerStation(m: MunicipalityData): number {
  if (!m.num_stations || m.num_stations === 0) return 0;
  return Math.round((m.daily_riders ?? 0) / m.num_stations);
}

export default function AccessibilityTab({ prefCode, prefName, pref, allData }: Props) {
  const { data: municipalities } = useMunicipalityData(prefCode);

  // Transit Score × Land Price scatter (accessibility premium analysis)
  const accessPriceScatter = useMemo(() => {
    return municipalities
      .filter((m) => (m.num_stations ?? 0) > 0 || (m.num_bus_stops ?? 0) > 0)
      .filter((m) => m.land_price_median != null && m.land_price_median > 0)
      .map((m) => ({
        name: m.area_name,
        score: transitScore(m),
        price: Math.round(m.land_price_median! / 1000), // 千円/m²
        riders: m.daily_riders ?? 0,
        stations: m.num_stations ?? 0,
      }));
  }, [municipalities]);

  // Station efficiency ranking (riders per station = demand concentration)
  const efficiencyRanking = useMemo(() => {
    return municipalities
      .filter((m) => (m.num_stations ?? 0) > 0 && (m.daily_riders ?? 0) > 0)
      .map((m) => ({
        name: m.area_name,
        efficiency: ridersPerStation(m),
        stations: m.num_stations!,
        riders: m.daily_riders!,
        score: transitScore(m),
      }))
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 15);
  }, [municipalities]);

  // Commercial density per 10k population (trade area saturation)
  const commercialDensity = useMemo(() => {
    return municipalities
      .filter((m) => (m.num_commercial ?? 0) > 0 && m.total_emp > 0)
      .map((m) => ({
        name: m.area_name,
        density: parseFloat(((m.num_commercial ?? 0) / m.total_emp * 10000).toFixed(1)),
        commercial: m.num_commercial ?? 0,
        transitScore: transitScore(m),
      }))
      .sort((a, b) => b.density - a.density)
      .slice(0, 15);
  }, [municipalities]);

  // Transit score distribution for the prefecture
  const scoreDistribution = useMemo(() => {
    const scored = municipalities
      .filter((m) => (m.num_stations ?? 0) > 0 || (m.num_bus_stops ?? 0) > 0)
      .map((m) => ({ name: m.area_name, score: transitScore(m) }))
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 20);
  }, [municipalities]);

  // National comparison: Transit density (riders / prefecture population)
  const nationalTransit = useMemo(() => {
    if (!allData) return [];
    return Object.values(allData)
      .filter((p) => (p.total_daily_riders ?? 0) > 0 && p.population > 0)
      .map((p) => ({
        name: p.pref_name,
        density: parseFloat(((p.total_daily_riders ?? 0) / p.population * 100).toFixed(1)),
        isCurrent: p.pref_code === prefCode,
      }))
      .sort((a, b) => b.density - a.density)
      .slice(0, 20);
  }, [allData, prefCode]);

  const hasData = accessPriceScatter.length > 0 || efficiencyRanking.length > 0;

  return (
    <div className="space-y-6">
      <ReadingGuide
        steps={[
          { title: "交通スコア×地価で立地価値を評価", description: "アクセス性が地価にどう織り込まれているかを散布図で確認" },
          { title: "駅効率で需要密度を把握", description: "1駅あたり乗降客数が高い=そのエリアの交通需要は集中している" },
          { title: "商業密度で商圏飽和度を判定", description: "商業施設が多すぎるエリアは競争が激しく、テナントリスクが高い" },
        ]}
      />

      {!hasData ? (
        <InfoBox title="データ未取得">
          交通データは国土数値情報からダウンロードが必要です。
          <code className="text-xs block mt-1">python scripts/download_nlni.py --dataset railways ridership bus_stops</code>
        </InfoBox>
      ) : (
        <>
          {/* Summary KPIs with analytical context */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">交通利用密度</p>
                <p className="text-2xl font-bold">
                  {pref.total_daily_riders != null && pref.population > 0
                    ? `${((pref.total_daily_riders / pref.population) * 100).toFixed(0)}%`
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">乗降客数/人口比</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">駅効率（平均）</p>
                <p className="text-2xl font-bold">
                  {pref.num_stations && pref.total_daily_riders
                    ? `${Math.round(pref.total_daily_riders / pref.num_stations).toLocaleString()}`
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">人/日/駅</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">公共交通カバー率</p>
                <p className="text-2xl font-bold">
                  {municipalities.length > 0
                    ? `${Math.round(municipalities.filter((m) => (m.num_stations ?? 0) > 0 || (m.num_bus_stops ?? 0) > 3).length / municipalities.length * 100)}%`
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">駅orバス3+の自治体比率</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">商業施設密度</p>
                <p className="text-2xl font-bold">
                  {pref.num_commercial != null && pref.population > 0
                    ? (pref.num_commercial / pref.population * 10000).toFixed(1)
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">施設/万人</p>
              </CardContent>
            </Card>
          </div>

          {/* Transit Score × Land Price (accessibility premium) */}
          {accessPriceScatter.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">アクセス性プレミアム分析 — 交通スコア × 地価</CardTitle>
                <p className="text-xs text-muted-foreground">
                  右上に位置するほど「アクセス良好＋高地価」。線形関係が強ければ、アクセスが地価に正しく織り込まれている
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="score" name="交通スコア" domain={[0, 100]}
                      label={{ value: "交通スコア (0-100)", position: "bottom", fontSize: 11 }} />
                    <YAxis type="number" dataKey="price" name="地価"
                      label={{ value: "地価(千円/m²)", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <ZAxis type="number" dataKey="riders" range={[30, 200]} name="乗降客数" />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                            <p className="font-bold">{d.name}</p>
                            <p>交通スコア: {d.score}/100</p>
                            <p>地価: {d.price}千円/m²</p>
                            <p>乗降客数: {d.riders.toLocaleString()}人/日</p>
                            <p>駅数: {d.stations}</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={accessPriceScatter} fill="#1B2A4A" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Station Efficiency (demand concentration) */}
          {efficiencyRanking.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">駅効率ランキング — 需要集中度</CardTitle>
                <p className="text-xs text-muted-foreground">
                  1駅あたり乗降客数が高い＝交通需要が集中＝商業立地として有望（CI102 Trade Area概念）
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, efficiencyRanking.length * 28)}>
                  <BarChart data={efficiencyRanking} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}千人`} />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                            <p className="font-bold">{d.name}</p>
                            <p>効率: {d.efficiency.toLocaleString()}人/日/駅</p>
                            <p>駅数: {d.stations} / 総乗降客: {d.riders.toLocaleString()}</p>
                            <p>交通スコア: {d.score}/100</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="efficiency" name="乗降客数/駅">
                      {efficiencyRanking.map((entry, i) => (
                        <Cell key={i} fill={entry.efficiency > 50000 ? "#1B2A4A" : entry.efficiency > 20000 ? "#2A9D8F" : "#94A3B8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Commercial Density (trade area saturation) */}
          {commercialDensity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">商圏飽和度 — 商業施設密度</CardTitle>
                <p className="text-xs text-muted-foreground">
                  従業者1万人あたり商業施設数。高すぎると過当競争、低すぎると出店余地あり（Gap分析的視点）
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, commercialDensity.length * 28)}>
                  <BarChart data={commercialDensity} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}施設/万人`, "商業密度"]} />
                    <Bar dataKey="density" name="商業密度">
                      {commercialDensity.map((entry, i) => (
                        <Cell key={i} fill={entry.density > 50 ? "#E76F51" : entry.density > 20 ? "#F59E0B" : "#2A9D8F"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Transit Score Distribution */}
          {scoreDistribution.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} 交通スコア分布（上位20）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, scoreDistribution.length * 24)}>
                  <BarChart data={scoreDistribution} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" domain={[0, 100]} />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => [`${value}/100`, "交通スコア"]} />
                    <Bar dataKey="score" name="交通スコア" fill="#6366F1" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* National comparison */}
          {nationalTransit.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">全国比較 — 交通利用密度（乗降客数/人口比）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={500}>
                  <BarChart data={nationalTransit} layout="vertical" margin={{ left: 60 }}>
                    <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "交通利用密度"]} />
                    <Bar dataKey="density" name="交通利用密度(%)">
                      {nationalTransit.map((entry, i) => (
                        <Cell key={i} fill={entry.isCurrent ? "#1B2A4A" : "#94A3B8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Interpretation */}
          <InterpTable
            headers={["交通スコア", "立地評価", "想定テナント", "投資示唆"]}
            rows={[
              ["80-100", "最上位（ターミナル駅圏）", "全業種可能", "低利回りでも安定稼働"],
              ["60-79", "良好（急行停車駅圏）", "オフィス・商業・住居", "標準利回りで堅実"],
              ["40-59", "中程度（各停駅圏）", "住居主体・近隣商業", "利回り重視で選択"],
              ["20-39", "限定的（バス主体）", "住居・物流・医療", "車依存度を加味"],
              ["0-19", "不便（公共交通不足）", "倉庫・農業関連", "独自集客力が必須"],
            ]}
          />

          <ClientTip>
            「この地域の交通利用密度は人口比{pref.total_daily_riders && pref.population
              ? `${((pref.total_daily_riders / pref.population) * 100).toFixed(0)}%`
              : "—"}で、
            1駅あたり平均{pref.num_stations && pref.total_daily_riders
              ? `${Math.round(pref.total_daily_riders / pref.num_stations).toLocaleString()}人`
              : "—"}が利用しています。
            交通アクセスは不動産の賃料プレミアムに直結し、
            徒歩10分圏内で10-30%の価格差が一般的です。」
          </ClientTip>

          <CaseStudy title="CI102 Trade Area分析との接続">
            CI102で学ぶDriving Distance（商圏距離）分析は、「ある施設からどの範囲に顧客が存在するか」を定量化する手法です。
            本タブの交通スコアは、その逆方向—「ある地点からどれだけ多くの施設・人にアクセスできるか」—を評価しています。
            駅効率が高いエリアは、自然と商圏が形成されやすく、テナント誘致において優位性があります。
            データ出典: 国土数値情報 鉄道(N02)・駅別乗降客数(S12)・バス停留所(P11)・商業施設(P33)
          </CaseStudy>
        </>
      )}
    </div>
  );
}
