"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";
import { InfoBox, CaseStudy } from "@/components/ui/callouts";

interface Props {
  prefCode: number;
  prefName: string;
  pref: PrefectureData;
  allData: Record<string, PrefectureData> | null;
}

export default function AccessibilityTab({ prefCode, prefName, pref, allData }: Props) {
  const { data: municipalities } = useMunicipalityData(prefCode);

  // Top municipalities by station count
  const stationRanking = useMemo(() => {
    return municipalities
      .filter((m) => (m.num_stations ?? 0) > 0)
      .sort((a, b) => (b.daily_riders ?? 0) - (a.daily_riders ?? 0))
      .slice(0, 15);
  }, [municipalities]);

  // National station comparison
  const nationalAccess = useMemo(() => {
    if (!allData) return [];
    return Object.values(allData)
      .filter((p) => (p.num_stations ?? 0) > 0)
      .map((p) => ({
        name: p.pref_name,
        stations: p.num_stations ?? 0,
        riders: Math.round((p.total_daily_riders ?? 0) / 1000),
        isCurrent: p.pref_code === prefCode,
      }))
      .sort((a, b) => b.riders - a.riders)
      .slice(0, 20);
  }, [allData, prefCode]);

  // Bus coverage by municipality
  const busCoverage = useMemo(() => {
    return municipalities
      .filter((m) => (m.num_bus_stops ?? 0) > 0)
      .sort((a, b) => (b.num_bus_stops ?? 0) - (a.num_bus_stops ?? 0))
      .slice(0, 15);
  }, [municipalities]);

  const hasData = stationRanking.length > 0 || nationalAccess.length > 0;

  return (
    <div className="space-y-6">
      <ReadingGuide
        steps={[
          { title: "鉄道アクセスを把握", description: "駅数・乗降客数で交通利便性を評価" },
          { title: "バスカバー率を確認", description: "バス停数で公共交通のカバー範囲を判定" },
          { title: "テナント誘致に活用", description: "アクセス良好エリアは商業・オフィス需要が高い" },
        ]}
      />

      {!hasData ? (
        <InfoBox title="データ未取得">
          交通データは国土数値情報からダウンロードが必要です。
          <code className="text-xs block mt-1">python scripts/download_nlni.py --dataset railways ridership bus_stops</code>
        </InfoBox>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">鉄道駅数</p>
                <p className="text-2xl font-bold">{pref.num_stations?.toLocaleString() ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">1日乗降客数</p>
                <p className="text-2xl font-bold">
                  {pref.total_daily_riders != null
                    ? `${Math.round(pref.total_daily_riders / 10000)}万人`
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">バス停数</p>
                <p className="text-2xl font-bold">{pref.total_bus_stops?.toLocaleString() ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-muted-foreground">商業施設数</p>
                <p className="text-2xl font-bold">{pref.num_commercial?.toLocaleString() ?? "—"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Station ridership ranking */}
          {stationRanking.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} 乗降客数上位（市区町村別）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, stationRanking.length * 28)}>
                  <BarChart data={stationRanking} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}千人`} />
                    <YAxis type="category" dataKey="area_name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString()}人/日`, "乗降客数"]}
                    />
                    <Bar dataKey="daily_riders" name="乗降客数" fill="#1B2A4A" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Bus coverage */}
          {busCoverage.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{prefName} バス停数上位（市区町村別）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(300, busCoverage.length * 28)}>
                  <BarChart data={busCoverage} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="area_name" width={75} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [`${Number(value)}箇所`, "バス停数"]} />
                    <Bar dataKey="num_bus_stops" name="バス停数" fill="#2A9D8F" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* National comparison */}
          {nationalAccess.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">全国比較 — 鉄道乗降客数上位20</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={500}>
                  <BarChart data={nationalAccess} layout="vertical" margin={{ left: 60 }}>
                    <XAxis type="number" tickFormatter={(v) => `${v}千人`} />
                    <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => [`${Number(value).toLocaleString()}千人/日`, "乗降客数"]} />
                    <Bar dataKey="riders" name="乗降客数(千人)">
                      {nationalAccess.map((entry, i) => (
                        <Cell key={i} fill={entry.isCurrent ? "#2A9D8F" : "#94A3B8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <CaseStudy title="交通アクセスと不動産">
            駅徒歩10分圏内は賃料プレミアムが10-30%、徒歩15分超は急激に減価します。
            バス停のみの地域は自家用車依存度が高く、テナント業種が限定されます。
            データ出典: 国土数値情報 鉄道(N02)・駅別乗降客数(S12)・バス停留所(P11)
          </CaseStudy>
        </>
      )}
    </div>
  );
}
