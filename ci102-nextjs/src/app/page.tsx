"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PREFECTURES } from "@/lib/codes";
import {
  lq_table, total_basic_employment, economic_base_multiplier,
  population_employment_ratio, investment_suitability_score,
  estimate_daytime_population, gap_analysis_table, shift_share_table,
} from "@/lib/calculator";
import {
  TAKAMATSU, TAKAMATSU_EMP, NATIONAL_EMP, RETAIL_SECTORS,
  TAKAMATSU_EMP_T0, TAKAMATSU_EMP_T1, NATIONAL_EMP_T0, NATIONAL_EMP_T1,
} from "@/lib/sample-data";
import LqTab from "@/components/tabs/lq-tab";
import GapTab from "@/components/tabs/gap-tab";

// Color palette (SPEC_v2 compliant)
const COLORS = {
  primary: "#1B2A4A",
  accent: "#D4A843",
  positive: "#2A9D8F",
  negative: "#E76F51",
  neutral: "#6B7280",
  bg: "#F8F9FA",
};

function KpiCard({
  title,
  value,
  subtitle,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "flat";
}) {
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const arrowColor =
    trend === "up"
      ? COLORS.positive
      : trend === "down"
        ? COLORS.negative
        : COLORS.neutral;

  return (
    <Card className="text-center">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" style={{ color: COLORS.primary }}>
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">
            {trend && (
              <span style={{ color: arrowColor }} className="mr-1">
                {arrow}
              </span>
            )}
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ScorecardTab() {
  const lq = useMemo(() => lq_table(TAKAMATSU_EMP, NATIONAL_EMP), []);
  const basic = useMemo(() => total_basic_employment(lq), [lq]);
  const totalEmp = useMemo(() => lq.reduce((s, r) => s + r.local_emp, 0), [lq]);
  const ebm = useMemo(() => economic_base_multiplier(totalEmp, basic), [totalEmp, basic]);
  const per = useMemo(() => population_employment_ratio(TAKAMATSU.population, totalEmp), [totalEmp]);
  const basicRatio = totalEmp > 0 ? (basic / totalEmp) * 100 : 0;

  const ss = useMemo(() => shift_share_table(TAKAMATSU_EMP_T0, TAKAMATSU_EMP_T1, NATIONAL_EMP_T0, NATIONAL_EMP_T1), []);
  const rsTotal = useMemo(() => ss.reduce((s, r) => s + r.regional_shift, 0), [ss]);

  const gap = useMemo(() => gap_analysis_table(RETAIL_SECTORS), []);
  const totalDemand = gap.reduce((s, r) => s + r.demand, 0);
  const totalSupply = gap.reduce((s, r) => s + r.supply, 0);
  const aggGap = (totalDemand + totalSupply) > 0
    ? ((totalDemand - totalSupply) / (totalDemand + totalSupply)) * 100 : 0;

  const score = useMemo(() => investment_suitability_score(ebm, basicRatio, rsTotal, aggGap, totalEmp), [ebm, basicRatio, rsTotal, aggGap, totalEmp]);
  const daytime = estimate_daytime_population(TAKAMATSU.population, basic);

  const scoreColor = score.total_score >= 60 ? COLORS.positive : score.total_score >= 40 ? COLORS.accent : COLORS.negative;

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="text-center">
        <h2 className="text-4xl font-bold" style={{ color: scoreColor }}>
          投資適格スコア: {score.total_score.toFixed(0)} / 100
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {TAKAMATSU.name}（サンプルデータ）
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard title="EBM" value={ebm.toFixed(2)} subtitle="経済基盤乗数" />
        <KpiCard title="PER" value={per.toFixed(2)} subtitle="人口雇用比率" />
        <KpiCard title="基盤雇用比率" value={`${basicRatio.toFixed(1)}%`} />
        <KpiCard title="RS合計" value={rsTotal.toLocaleString(undefined, { maximumFractionDigits: 0, signDisplay: "always" })} subtitle="地域シフト" trend={rsTotal > 0 ? "up" : rsTotal < 0 ? "down" : "flat"} />
        <KpiCard title="漏損/余剰" value={aggGap.toFixed(1)} />
        <KpiCard title="㎡単価中央値" value="—" subtitle="MLIT API要" />
        <KpiCard title="昼間人口推計" value={daytime.toLocaleString()} />
      </div>

      <Separator />

      {/* Top LQ Industries */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">基盤産業 TOP 5</h3>
          <div className="space-y-2">
            {lq.filter((r) => r.lq > 1).sort((a, b) => b.lq - a.lq).slice(0, 5).map((r) => (
              <div key={r.industry} className="flex justify-between items-center rounded-lg border p-3">
                <span className="text-sm font-medium">{r.industry}</span>
                <div className="text-right">
                  <span className="text-lg font-bold" style={{ color: COLORS.positive }}>
                    LQ {r.lq.toFixed(2)}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    基盤雇用 {Math.round(r.basic_emp_estimate).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">投資シグナル</h3>
          <div className="space-y-2">
            {ebm >= 5 && (
              <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.positive, backgroundColor: "#f0fdf4" }}>
                <p className="text-sm">EBM {ebm.toFixed(2)} — 高い乗数効果。基盤雇用増加が大きく波及。</p>
              </div>
            )}
            {rsTotal > 0 && (
              <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.positive, backgroundColor: "#f0fdf4" }}>
                <p className="text-sm">RS合計 {rsTotal.toLocaleString()} — 全国を上回る競争優位。</p>
              </div>
            )}
            {rsTotal < 0 && (
              <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.negative, backgroundColor: "#fef2f2" }}>
                <p className="text-sm">RS合計 {rsTotal.toLocaleString()} — 全国平均を下回る。競争力低下に注意。</p>
              </div>
            )}
            {aggGap > 10 && (
              <div className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: COLORS.positive, backgroundColor: "#f0fdf4" }}>
                <p className="text-sm">小売漏損 +{aggGap.toFixed(1)} — 出店機会あり。</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Data disclaimer */}
      <div className="rounded-lg bg-slate-50 p-4 text-xs text-muted-foreground">
        <p className="font-medium mb-1">データの時点と制限</p>
        <p>経済センサス: 2021年6月時点 / 国勢調査: 2020年10月時点（人口は2015年組替値）</p>
        <p>MLIT取引価格: 選択四半期の実績 / すべて過去のスナップショット</p>
      </div>
    </div>
  );
}

function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-64 rounded-lg border border-dashed">
      <p className="text-muted-foreground">{title} — 実装中</p>
    </div>
  );
}

export default function Dashboard() {
  const [prefCode, setPrefCode] = useState(13);

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      {/* Header */}
      <header
        className="text-white px-6 py-4 shadow-md"
        style={{ backgroundColor: COLORS.primary }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">
            CI102 不動産市場分析ダッシュボード
          </h1>
          <div className="flex items-center gap-3">
            <select
              value={prefCode}
              onChange={(e) => setPrefCode(Number(e.target.value))}
              className="rounded px-3 py-1.5 text-sm text-gray-900 bg-white"
            >
              {Object.entries(PREFECTURES).map(([code, name]) => (
                <option key={code} value={code}>
                  {String(code).padStart(2, "0")} {name}
                </option>
              ))}
            </select>
            <Badge variant="outline" className="text-white border-white/30">
              {PREFECTURES[prefCode]}
            </Badge>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs defaultValue="scorecard" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="scorecard">⓪ スコアカード</TabsTrigger>
            <TabsTrigger value="lq">① 経済基盤</TabsTrigger>
            <TabsTrigger value="ebm">② 需要予測</TabsTrigger>
            <TabsTrigger value="shift">③ シフトシェア</TabsTrigger>
            <TabsTrigger value="gap">④ 小売市場</TabsTrigger>
            <TabsTrigger value="realestate">⑤ 不動産取引</TabsTrigger>
            <TabsTrigger value="map">⑥ 地図分析</TabsTrigger>
            <TabsTrigger value="cross">⑦ クロス分析</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="scorecard">
              <ScorecardTab />
            </TabsContent>
            <TabsContent value="lq">
              <LqTab
                localEmp={TAKAMATSU_EMP}
                nationalEmp={NATIONAL_EMP}
                localT0={TAKAMATSU_EMP_T0}
                localT1={TAKAMATSU_EMP_T1}
                nationalT0={NATIONAL_EMP_T0}
                nationalT1={NATIONAL_EMP_T1}
              />
            </TabsContent>
            <TabsContent value="ebm">
              <PlaceholderTab title="② 需要予測（EBM/PER + ウォーターフォール + フィジビリティ）" />
            </TabsContent>
            <TabsContent value="shift">
              <PlaceholderTab title="③ シフトシェア分析" />
            </TabsContent>
            <TabsContent value="gap">
              <GapTab sectors={RETAIL_SECTORS} />
            </TabsContent>
            <TabsContent value="realestate">
              <PlaceholderTab title="⑤ 不動産取引 + Mueller サイクル（MLIT API接続後に表示）" />
            </TabsContent>
            <TabsContent value="map">
              <PlaceholderTab title="⑥ 地図分析（GeoJSON読込後に表示）" />
            </TabsContent>
            <TabsContent value="cross">
              <PlaceholderTab title="⑦ クロス分析（全都道府県データ取得後に表示）" />
            </TabsContent>
          </div>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto px-6 py-3">
        <p className="text-xs text-muted-foreground text-center max-w-7xl mx-auto">
          分析手法: 経済基盤分析（LQ/EBM/PER）、シフトシェア分析、ギャップ分析 |
          データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ
        </p>
      </footer>
    </div>
  );
}
