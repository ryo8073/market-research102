"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData, type MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";
import { RiskAlert, InfoBox } from "@/components/ui/callouts";

interface Props {
  prefCode: number;
  prefName: string;
  pref: PrefectureData;
  allData: Record<string, PrefectureData> | null;
}

export default function RiskTab({ prefCode, prefName, pref, allData }: Props) {
  const { data: municipalities } = useMunicipalityData(prefCode);

  // Sort municipalities by flood risk
  const floodRanking = useMemo(() => {
    return municipalities
      .filter((m) => m.flood_risk_pct != null && m.flood_risk_pct > 0)
      .sort((a, b) => (b.flood_risk_pct ?? 0) - (a.flood_risk_pct ?? 0))
      .slice(0, 20);
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

  const hasFloodData = floodRanking.length > 0 || nationalFloodData.length > 0;

  return (
    <div className="space-y-6">
      <ReadingGuide
        steps={[
          { title: "浸水リスクを確認", description: "市区町村ごとの浸水想定面積割合を確認" },
          { title: "全国比較", description: "都道府県の平均浸水リスクを全国と比較" },
          { title: "投資判断に反映", description: "高リスク地域は利回り上乗せや回避を検討" },
        ]}
      />

      {!hasFloodData ? (
        <InfoBox title="データ未取得">
          災害リスクデータは国土数値情報からダウンロードが必要です。
          <code className="text-xs block mt-1">python scripts/download_nlni.py --dataset flood</code>
        </InfoBox>
      ) : (
        <>
          {/* Prefecture summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">平均浸水リスク</p>
                <p className="text-2xl font-bold">
                  {pref.flood_risk_avg_pct != null ? `${pref.flood_risk_avg_pct}%` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">リスクあり自治体</p>
                <p className="text-2xl font-bold">{floodRanking.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">医療施設数</p>
                <p className="text-2xl font-bold">{pref.num_medical?.toLocaleString() ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">道路セグメント</p>
                <p className="text-2xl font-bold">{pref.total_road_segments?.toLocaleString() ?? "—"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Municipality flood risk ranking */}
          {floodRanking.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} 浸水リスク上位（市区町村別）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, floodRanking.length * 28)}>
                  <BarChart data={floodRanking} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="area_name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "浸水面積率"]} />
                    <Bar dataKey="flood_risk_pct" name="浸水面積率">
                      {floodRanking.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={(entry.flood_risk_pct ?? 0) > 30 ? "#EF4444" : (entry.flood_risk_pct ?? 0) > 10 ? "#F59E0B" : "#3B82F6"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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

          <RiskAlert title="災害リスクの解釈">
            浸水想定区域データは「想定最大規模降雨」に基づくシミュレーション結果です。
            実際の被災確率とは異なります。投資判断には地盤情報・ハザードマップ・保険料率も
            併せて確認してください。データ出典: 国土数値情報 洪水浸水想定区域（国土交通省）
          </RiskAlert>
        </>
      )}
    </div>
  );
}
