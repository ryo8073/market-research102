"use client";

import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";
import { InfoBox, RiskAlert } from "@/components/ui/callouts";

interface Props {
  prefCode: number;
  prefName: string;
  pref: PrefectureData;
  allData: Record<string, PrefectureData> | null;
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
        popMillion: pop / 10000,
      }))
      .sort((a, b) => a.year - b.year);
  }, [pref.pop_projection]);

  // DID summary
  const didData = useMemo(() => {
    return municipalities
      .filter((m) => (m.did_area_ha ?? 0) > 0)
      .sort((a, b) => (b.did_population ?? 0) - (a.did_population ?? 0))
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

  // Municipality 2050 population ranking
  const muniPop2050 = useMemo(() => {
    return municipalities
      .filter((m) => m.pop_2050 != null && m.pop_2050 > 0)
      .sort((a, b) => (b.pop_2050 ?? 0) - (a.pop_2050 ?? 0))
      .slice(0, 15);
  }, [municipalities]);

  // Location optimization plan count
  const locationPlanMunis = useMemo(() => {
    return municipalities.filter((m) => m.has_location_plan === true);
  }, [municipalities]);

  const hasData = popTimeSeries.length > 0 || didData.length > 0 || nationalPopChange.length > 0;

  return (
    <div className="space-y-6">
      <ReadingGuide
        steps={[
          { title: "人口推移を確認", description: "2050年までの将来推計人口で長期需要を予測" },
          { title: "DID（人口集中地区）", description: "都市化密度の高いエリアを把握" },
          { title: "立地適正化計画", description: "自治体の居住誘導方針を確認" },
        ]}
      />

      {!hasData ? (
        <InfoBox title="データ未取得">
          人口推計データは国土数値情報からダウンロードが必要です。
          <code className="text-xs block mt-1">python scripts/download_nlni.py --dataset mesh_pop did location_opt</code>
        </InfoBox>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">人口変動率（推計）</p>
                <p className={`text-2xl font-bold ${(pref.pop_change_pct ?? 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                  {pref.pop_change_pct != null ? `${pref.pop_change_pct > 0 ? "+" : ""}${pref.pop_change_pct}%` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">DID面積</p>
                <p className="text-2xl font-bold">
                  {pref.did_total_area_ha != null ? `${Math.round(pref.did_total_area_ha).toLocaleString()} ha` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">DID人口</p>
                <p className="text-2xl font-bold">
                  {pref.did_total_population != null
                    ? `${Math.round(pref.did_total_population / 10000)}万人`
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">立地適正化計画</p>
                <p className="text-2xl font-bold">
                  {pref.has_location_plan_count ?? locationPlanMunis.length}自治体
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Population projection chart */}
          {popTimeSeries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} 将来推計人口（2020〜2050年）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={popTimeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis
                      tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
                    />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString()}人`, "推計人口"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="population"
                      stroke="#2A9D8F"
                      fill="#2A9D8F"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  出典: 国土数値情報 1kmメッシュ別将来推計人口（H30国立社会保障・人口問題研究所）
                </p>
              </CardContent>
            </Card>
          )}

          {/* National population change ranking */}
          {nationalPopChange.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">全国比較 — 推計人口変動率</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={600}>
                  <BarChart data={nationalPopChange} layout="vertical" margin={{ left: 60 }}>
                    <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 9 }} />
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

          {/* DID ranking */}
          {didData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} 人口集中地区(DID) 人口上位</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, didData.length * 28)}>
                  <BarChart data={didData} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                    <YAxis type="category" dataKey="area_name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString()}人`, "DID人口"]}
                    />
                    <Bar dataKey="did_population" name="DID人口" fill="#6366F1" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Location optimization plan list */}
          {locationPlanMunis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} 立地適正化計画策定済み自治体</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {locationPlanMunis.map((m) => (
                    <span
                      key={m.area_code}
                      className="px-2 py-1 text-xs rounded bg-violet-100 text-violet-800"
                    >
                      {m.area_name}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  居住誘導区域が設定されたエリアは、自治体がインフラ投資を集中する方針。
                  不動産投資において中長期的な利便性維持が期待できる。
                </p>
              </CardContent>
            </Card>
          )}

          <RiskAlert title="将来推計人口の注意点">
            この推計は国立社会保障・人口問題研究所（H30推計）に基づくもので、
            地域間の社会増減（転入転出）を含みますが、大規模開発や政策変更は
            織り込まれていません。あくまで「現在のトレンドが続いた場合」の参考値です。
          </RiskAlert>
        </>
      )}
    </div>
  );
}
