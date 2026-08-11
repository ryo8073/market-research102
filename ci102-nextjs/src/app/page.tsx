"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { ClientTip, RiskAlert } from "@/components/ui/callouts";
import { DataVintageBadge } from "@/components/ui/data-vintage-badge";
import { PREFECTURES } from "@/lib/codes";
import { usePrefectureData, usePrefDetailMid, type PrefectureData } from "@/lib/use-prefecture-data";
import { useMuniIndustryMatrixMid } from "@/lib/use-muni-industry";
import { useMunicipalityData, type MunicipalityData } from "@/lib/use-municipality-data";
import { generateNarrative, computeBenchmark, type NarrativeResult } from "@/lib/insights";

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  );
}

const LqTab = dynamic(() => import("@/components/tabs/lq-tab"), {
  loading: () => <TabSkeleton />,
});
const EbmTab = dynamic(() => import("@/components/tabs/ebm-tab"), {
  loading: () => <TabSkeleton />,
});
const ShiftShareTab = dynamic(() => import("@/components/tabs/shift-share-tab"), {
  loading: () => <TabSkeleton />,
});
const GapTab = dynamic(() => import("@/components/tabs/gap-tab"), {
  loading: () => <TabSkeleton />,
});
const RealEstateTab = dynamic(() => import("@/components/tabs/realestate-tab"), {
  loading: () => <TabSkeleton />,
});
const MapTab = dynamic(() => import("@/components/tabs/map-tab"), {
  loading: () => <TabSkeleton />,
});
const CrossTab = dynamic(() => import("@/components/tabs/cross-tab"), {
  loading: () => <TabSkeleton />,
});
const RiskTab = dynamic(() => import("@/components/tabs/risk-tab"), {
  loading: () => <TabSkeleton />,
});
const AccessibilityTab = dynamic(() => import("@/components/tabs/accessibility-tab"), {
  loading: () => <TabSkeleton />,
});
const DemographicsTab = dynamic(() => import("@/components/tabs/demographics-tab"), {
  loading: () => <TabSkeleton />,
});
const MetroTab = dynamic(() => import("@/components/tabs/metro-tab"), {
  loading: () => <TabSkeleton />,
});
const CustomMetroTab = dynamic(() => import("@/components/tabs/custom-metro-tab"), {
  loading: () => <TabSkeleton />,
});
const TradeAreaTab = dynamic(() => import("@/components/tabs/trade-area-tab"), {
  loading: () => <TabSkeleton />,
});
const DecisionHubTab = dynamic(() => import("@/components/tabs/decision-hub-tab"), {
  loading: () => <TabSkeleton />,
});

const COLORS = {
  primary: "#1B2A4A",
  accent: "#D4A843",
  positive: "#2A9D8F",
  negative: "#E76F51",
  neutral: "#6B7280",
  bg: "#F8F9FA",
};

function KpiCard({ title, value, subtitle, trend, tooltip }: {
  title: string; value: string; subtitle?: string;
  trend?: "up" | "down" | "flat";
  tooltip?: string;
}) {
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : trend === "flat" ? "→" : "";
  const color = trend === "up" ? COLORS.positive : trend === "down" ? COLORS.negative : COLORS.neutral;
  const card = (
    <Card className="text-center">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-[#1B2A4A] dark:text-white">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{arrow && <span style={{ color }} className="mr-1">{arrow}</span>}{subtitle}</p>}
      </CardContent>
    </Card>
  );
  if (!tooltip) return card;
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        {card}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <Card key={i} className="text-center">
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-20 mx-auto" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16 mx-auto" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Score Gauge (SVG semi-circle)                                      */
/* ------------------------------------------------------------------ */

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 80 ? "#2A9D8F" : pct >= 60 ? "#2A9D8F" : pct >= 40 ? "#D4A843" : "#E76F51";

  // CSS conic-gradient semicircle gauge — no SVG arc math needed.
  // The gauge is a half-circle (180°) where pct maps to 0°–180°.
  const scoreDeg = (pct / 100) * 180;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 200, height: 110 }}>
        {/* Half-circle gauge container */}
        <div
          style={{
            width: 180,
            height: 90,
            margin: "0 auto",
            borderRadius: "90px 90px 0 0",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Full circle with conic-gradient, clipped to upper half */}
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: `conic-gradient(from 270deg, ${color} 0deg ${scoreDeg}deg, #e5e7eb ${scoreDeg}deg 180deg, transparent 180deg 360deg)`,
            }}
          />
          {/* Inner cutout (donut hole) */}
          <div
            className="bg-background"
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              width: 152,
              height: 152,
              borderRadius: "50%",
            }}
          />
        </div>
        {/* Zone labels */}
        <span className="absolute text-xs text-muted-foreground" style={{ left: 4, bottom: 0 }}>要注意</span>
        <span className="absolute text-xs text-muted-foreground" style={{ left: 52, top: 8 }}>標準</span>
        <span className="absolute text-xs text-muted-foreground" style={{ right: 52, top: 8 }}>良好</span>
        <span className="absolute text-xs text-muted-foreground" style={{ right: 4, bottom: 0 }}>優良</span>
        {/* Score number */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-3xl font-bold" style={{ color }}>{Math.round(score)}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <p className="text-sm font-semibold mt-1" style={{ color }}>{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Benchmark Bar (mini inline percentile)                             */
/* ------------------------------------------------------------------ */

function BenchmarkBar({ value, min, max, median, label, unit, higherIsBetter = true }: {
  value: number; min: number; max: number; median: number;
  label: string; unit?: string; higherIsBetter?: boolean;
}) {
  const range = max - min || 1;
  const valPct = Math.max(0, Math.min(100, ((value - min) / range) * 100));
  const medPct = Math.max(0, Math.min(100, ((median - min) / range) * 100));
  const isGood = higherIsBetter ? value >= median : value <= median;
  const color = isGood ? "#2A9D8F" : "#E76F51";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-bold" style={{ color }}>{typeof value === "number" && !isNaN(value) ? (unit ? `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}` : value.toLocaleString(undefined, { maximumFractionDigits: 2 })) : "—"}</span>
      </div>
      <div className="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="absolute h-2 rounded-full" style={{ width: `${valPct}%`, backgroundColor: color, opacity: 0.7 }} />
        {/* Median marker */}
        <div className="absolute top-0 w-0.5 h-2 bg-gray-500 dark:bg-gray-400" style={{ left: `${medPct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>最低 {min.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        <span>中央値 {median.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        <span>最高 {max.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Spatial Risk/Access Adjustment                                     */
/* ------------------------------------------------------------------ */

function SpatialAdjustment({ pref }: { pref: PrefectureData }) {
  const adj = pref.score_adjustments!;
  const enhanced = pref.enhanced_score!;
  const diff = enhanced - adj.base;

  const items = [
    { label: "経済スコア（CI102）", value: adj.base, color: "#1B2A4A", desc: "EBM・基盤比率・RS・ギャップ・規模の5要素" },
    { label: "洪水リスク", value: adj.risk_penalty, color: adj.risk_penalty < 0 ? "#E76F51" : "#6B7280", desc: "浸水想定区域の面積比率に基づくペナルティ" },
    { label: "交通アクセス", value: adj.access_bonus, color: adj.access_bonus > 0 ? "#2A9D8F" : "#6B7280", desc: "鉄道乗降客数÷人口（公共交通利用密度）" },
    { label: "人口動態", value: adj.pop_adjustment, color: adj.pop_adjustment >= 0 ? "#2A9D8F" : "#E76F51", desc: "20年間の推計人口変動率" },
  ];

  return (
    <Card className="border-l-4 border-l-[#6366F1]">
      <CardHeader>
        <CardTitle className="text-sm">空間データ補正 — CI102経済スコアへの実地調整</CardTitle>
        <p className="text-xs text-muted-foreground">
          CI102の経済分析（第1-6章）に対し、国土数値情報の空間データで実地リスク/利便性を補正。
          投資適格スコアとは別軸の参考情報です。
        </p>
      </CardHeader>
      <CardContent>
        {/* Waterfall-style breakdown */}
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs w-28 shrink-0 text-right font-medium">{item.label}</span>
              <div className="flex-1 relative h-6 bg-gray-100 dark:bg-gray-800 rounded">
                {/* Bar from center or left */}
                {item.label === "経済スコア（CI102）" ? (
                  <div
                    className="absolute top-0 left-0 h-6 rounded"
                    style={{ width: `${Math.min(100, item.value)}%`, backgroundColor: item.color, opacity: 0.7 }}
                  />
                ) : (
                  <div
                    className="absolute top-0 h-6 rounded"
                    style={{
                      left: item.value >= 0 ? "50%" : `${50 + item.value * 2.5}%`,
                      width: `${Math.min(50, Math.abs(item.value) * 2.5)}%`,
                      backgroundColor: item.color,
                      opacity: 0.6,
                    }}
                  />
                )}
              </div>
              <span className={`text-xs font-bold w-14 text-right ${item.value > 0 && item.label !== "経済スコア（CI102）" ? "text-green-600" : item.value < 0 ? "text-red-600" : ""}`}>
                {item.label === "経済スコア（CI102）" ? item.value.toFixed(1) : `${item.value > 0 ? "+" : ""}${item.value.toFixed(1)}`}
              </span>
            </div>
          ))}
          {/* Result */}
          <div className="flex items-center gap-3 border-t pt-2 mt-1">
            <span className="text-xs w-28 shrink-0 text-right font-bold">補正後スコア</span>
            <div className="flex-1 relative h-6 bg-gray-100 dark:bg-gray-800 rounded">
              <div
                className="absolute top-0 left-0 h-6 rounded"
                style={{ width: `${Math.min(100, enhanced)}%`, backgroundColor: "#6366F1", opacity: 0.7 }}
              />
            </div>
            <span className="text-xs font-bold w-14 text-right">
              {enhanced.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Interpretation */}
        <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 text-xs space-y-1">
          <p className="font-semibold">
            経済スコア {adj.base.toFixed(1)} → 補正後 {enhanced.toFixed(1)}
            <span className={`ml-2 ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
              （{diff >= 0 ? "+" : ""}{diff.toFixed(1)}点）
            </span>
          </p>
          <p className="text-muted-foreground">
            {adj.risk_penalty < -5
              ? "洪水リスクが大きく、Cap Rateの上乗せ（リスクプレミアム）を検討してください。"
              : adj.risk_penalty < -1
              ? "一定の浸水リスクがあります。物件個別のハザードマップ確認を推奨します。"
              : "浸水リスクは低い地域です。"}
            {adj.access_bonus >= 3
              ? " 公共交通の利便性が高く、駅近物件は賃料プレミアムが期待できます。"
              : adj.access_bonus >= 1
              ? " 公共交通は一定の利用があります。"
              : " 公共交通の利用密度が低く、車依存度の高い地域です。"}
            {adj.pop_adjustment >= 0
              ? " 人口動態はプラスまたは横ばいで、住宅需要は維持される見通しです。"
              : adj.pop_adjustment > -5
              ? " 緩やかな人口減少が見込まれ、長期保有時の出口戦略に注意が必要です。"
              : " 人口減少が顕著で、長期投資には慎重な判断が求められます。"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Scorecard Radar Chart                                              */
/* ------------------------------------------------------------------ */

function ScorecardRadar({ pref, allData }: { pref: PrefectureData; allData: Record<string, PrefectureData> | null }) {
  const allPrefs = allData ? Object.values(allData) : [];

  // Normalize each sub-score to 5-100 using min-max across all prefs.
  // Floor of 5 prevents the polygon from collapsing when a value is at minimum.
  function norm(val: number, getter: (p: PrefectureData) => number): number {
    const vals = allPrefs.map(getter);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === min) return 50;
    return 5 + ((val - min) / (max - min)) * 95;
  }

  const medianVal = (getter: (p: PrefectureData) => number): number => {
    const sorted = allPrefs.map(getter).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const data = [
    { axis: "EBM", value: norm(pref.ebm, (p) => p.ebm), median: norm(medianVal((p) => p.ebm), (p) => p.ebm) },
    { axis: "基盤比率", value: norm(pref.basic_ratio, (p) => p.basic_ratio), median: norm(medianVal((p) => p.basic_ratio), (p) => p.basic_ratio) },
    { axis: "RS", value: norm(pref.rs_total, (p) => p.rs_total), median: norm(medianVal((p) => p.rs_total), (p) => p.rs_total) },
    { axis: "Gap", value: norm(pref.aggregate_gap_factor, (p) => p.aggregate_gap_factor), median: norm(medianVal((p) => p.aggregate_gap_factor), (p) => p.aggregate_gap_factor) },
    { axis: "規模", value: norm(pref.total_employment, (p) => p.total_employment), median: norm(medianVal((p) => p.total_employment), (p) => p.total_employment) },
  ];

  return (
    <div>
      <p className="text-sm font-semibold text-center mb-1">スコア構成（5要素）</p>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="全国中央値" dataKey="median" stroke="#9CA3AF" fill="#9CA3AF" fillOpacity={0.15} strokeDasharray="4 4" />
          <Radar name={pref.pref_name} dataKey="value" stroke="#2A9D8F" fill="#2A9D8F" fillOpacity={0.25} strokeWidth={2} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground text-center">
        各指標を全47都道府県のmin-maxで0-100にスケーリング。外側ほど高い値。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Narrative Panel                                                    */
/* ------------------------------------------------------------------ */

function NarrativePanel({ narrative }: { narrative: NarrativeResult }) {
  const iconMap: Record<string, string> = {
    chart: "📊", target: "🎯", alert: "⚠️",
  };
  const bgMap: Record<string, string> = {
    positive: "bg-green-50 dark:bg-green-950/20 border-[#2A9D8F]",
    neutral: "bg-blue-50 dark:bg-blue-950/20 border-blue-500",
    negative: "bg-red-50 dark:bg-red-950/20 border-[#E76F51]",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-[#1B2A4A]/20 bg-[#1B2A4A]/5 dark:bg-white/5 p-4">
        <p className="text-lg font-bold text-[#1B2A4A] dark:text-white">{narrative.headline}</p>
        <p className="text-sm text-muted-foreground mt-1">{narrative.scoreInterpretation}</p>
      </div>

      {narrative.sections.map((section) => (
        <div key={section.title} className={`rounded-lg border-l-4 p-4 space-y-2 ${bgMap[section.level]}`}>
          <p className="font-semibold text-sm">{iconMap[section.icon] ?? "📋"} {section.title}</p>
          <ul className="space-y-1.5">
            {section.items.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-40" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <ClientTip>
        <p className="text-sm leading-relaxed">{narrative.clientTip}</p>
      </ClientTip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Municipality Detail Panel                                          */
/* ------------------------------------------------------------------ */

function MunicipalityRankBar({ label, value, allValues, unit, higherIsBetter = true }: {
  label: string; value: number; allValues: number[]; unit?: string; higherIsBetter?: boolean;
}) {
  const sorted = [...allValues].sort((a, b) => a - b);
  const n = sorted.length;
  const rank = higherIsBetter
    ? sorted.filter((v) => v > value).length + 1
    : sorted.filter((v) => v < value).length + 1;
  const pct = n > 0 ? Math.round(((n - rank) / n) * 100) : 50;
  const color = pct >= 70 ? "#2A9D8F" : pct >= 40 ? "#D4A843" : "#E76F51";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="font-semibold" style={{ color }}>
          {value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{unit ?? ""} — {rank}位/{n}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="absolute h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/** 人口長期予測グラフ（2020-2070、社人研データ） */
function PopulationProjectionPanel({ pref }: { pref: PrefectureData }) {
  if (!pref.pop_projection) return null;
  const data = Object.entries(pref.pop_projection)
    .map(([year, pop]) => ({ year: parseInt(year, 10), 人口: pop }))
    .sort((a, b) => a.year - b.year);
  const base = pref.pop_projection["2020"] ?? data[0]?.人口 ?? 0;
  const dataNormalized = data.map((d) => ({ ...d, 指数: base > 0 ? (d.人口 / base) * 100 : 100 }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold">📉 人口長期予測 (2020→2070、社人研)</h3>
        <div className="text-xs space-x-3">
          {pref.pop_change_10y_pct != null && (
            <span>
              10年(2020→2030):{" "}
              <strong className={pref.pop_change_10y_pct >= 0 ? "text-emerald-700" : "text-rose-700"}>
                {pref.pop_change_10y_pct >= 0 ? "+" : ""}{pref.pop_change_10y_pct.toFixed(1)}%
              </strong>
            </span>
          )}
          {pref.pop_change_pct != null && (
            <span>
              20年(2020→2040):{" "}
              <strong className={pref.pop_change_pct >= 0 ? "text-emerald-700" : "text-rose-700"}>
                {pref.pop_change_pct >= 0 ? "+" : ""}{pref.pop_change_pct.toFixed(1)}%
              </strong>
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={dataNormalized} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="year" fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `${v}`} domain={["dataMin - 5", 110]} />
          <RechartsTooltip formatter={(value, name) => [name === "指数" ? `${Number(value).toFixed(1)} (2020=100)` : Number(value).toLocaleString(), String(name)]} />
          <ReferenceLine y={100} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: "2020水準", position: "right", fontSize: 10, fill: "#6b7280" }} />
          <Line type="monotone" dataKey="指数" stroke="#1B2A4A" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-500">
        ※ 2020年=100 として指数化。グラフはコホート要因法による国立社会保障・人口問題研究所の地域別将来推計（H30推計）。
        物件耐用年数（RC造50年）の範囲で需要動態を把握する基礎データ。
      </p>
    </div>
  );
}

/** セグメント分類から物件投資レコメンドを生成 */
function PropertyRecommendation({ segment, city }: { segment: string; city: MunicipalityData }) {
  const recommendations: Record<string, { primary: string; secondary: string; caveat?: string }> = {
    "都市サービス集積型": {
      primary: "オフィスビル・賃貸マンション・高層住宅",
      secondary: "サービス業テナント向け商業ビル",
      caveat: city.basic_ratio < 8 ? "通勤流出ベッドタウンの可能性。職住の地理的整合を確認" : undefined,
    },
    "工業基盤型": {
      primary: "物流倉庫・工業用地・社員寮",
      secondary: "工場周辺の飲食店・社宅向け賃貸住宅",
      caveat: "製造業の業績変動リスクを物件タイプの選定で分散検討",
    },
    "商業・観光型": {
      primary: "店舗ビル・ホテル・観光客向け商業施設",
      secondary: "繁華街周辺の賃貸住宅",
      caveat: city.flood_risk_pct != null && city.flood_risk_pct > 10
        ? `浸水リスク${city.flood_risk_pct.toFixed(0)}%。営業中断リスクを保険でカバー`
        : undefined,
    },
    "公務・教育型": {
      primary: "賃貸住宅（公務員官舎・学生向け）",
      secondary: "学校・病院周辺の商業施設",
      caveat: "公的セクター依存で景気下振れリスクは小だが、上昇余地も限定的",
    },
    "高齢縮小型": {
      primary: "医療・介護施設・サービス付き高齢者住宅",
      secondary: "コンパクト商業（最低限の生活インフラ）",
      caveat: city.pop_2050 != null && city.pop_2030 != null && city.pop_2050 < city.pop_2030 * 0.7
        ? "2030→2050で30%以上人口減少見込み。出口戦略を入口で明確化"
        : "出口戦略を入口で計画。長期保有よりも事業価値変動を見込んだ運営",
    },
    "均衡型": {
      primary: "汎用的な住居・小規模商業の組合せ",
      secondary: "リスク分散型ポートフォリオの一部に",
      caveat: "突出した強みが少ないため、立地・物件単体の競争力で勝負",
    },
  };
  const rec = recommendations[segment];
  if (!rec) return null;
  return (
    <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-xs">
      <p className="font-semibold mb-1">💡 セグメント「{segment}」への投資物件タイプ提案</p>
      <p><strong>推奨</strong>: {rec.primary}</p>
      <p><strong>サブ</strong>: {rec.secondary}</p>
      {rec.caveat && <p className="mt-1 text-amber-700">⚠ <strong>留意点</strong>: {rec.caveat}</p>}
      {city.has_location_plan && (
        <p className="mt-1 text-purple-700">
          🎯 立地適正化計画策定済 — 居住誘導/都市機能誘導区域内なら追い風
        </p>
      )}
    </div>
  );
}

function MunicipalityDetail({ city, municipalities, prefName, granularity }: {
  city: MunicipalityData;
  municipalities: MunicipalityData[];
  prefName: string;
  granularity?: "major" | "mid" | "extended";
}) {
  // 粒度に応じてアクティブな指標を切替
  const activeBasicRatio =
    granularity === "extended" && city.basic_ratio_mid_extended != null ? city.basic_ratio_mid_extended :
    granularity === "mid" && city.basic_ratio_mid != null ? city.basic_ratio_mid :
    city.basic_ratio;
  const activeBasicEmp =
    granularity === "extended" && city.basic_emp_mid_extended != null ? city.basic_emp_mid_extended :
    granularity === "mid" && city.basic_emp_mid != null ? city.basic_emp_mid :
    city.basic_emp;
  const activeNBasic =
    granularity === "extended" && city.n_basic_industries_extended != null ? city.n_basic_industries_extended :
    granularity === "mid" && city.n_basic_industries_mid != null ? city.n_basic_industries_mid :
    city.num_basic;
  const activeTopLq =
    granularity === "extended" && city.top_lq_industries_extended ? city.top_lq_industries_extended :
    granularity === "mid" && city.top_lq_industries_mid ? city.top_lq_industries_mid :
    null;
  const granularitySuffix = granularity === "mid" ? "（中分類95業種）"
    : granularity === "extended" ? "（+農林業補完）"
    : "（大分類17業種）";
  // Peer comparison: similar scale (±50% of total employment)
  const peers = municipalities
    .filter((m) => m.area_code !== city.area_code && m.total_emp >= city.total_emp * 0.5 && m.total_emp <= city.total_emp * 2)
    .sort((a, b) => b.basic_ratio - a.basic_ratio)
    .slice(0, 5);

  const allEmp = municipalities.map((m) => m.total_emp);
  const allBasicRatio = municipalities.map((m) => m.basic_ratio);
  const allMaxLq = municipalities.map((m) => m.max_lq);

  // Determine segment interpretation
  const segmentDesc: Record<string, string> = {
    "高基盤・高LQ": "基盤産業が集積し、域外収入が多い。テナント需要が安定。",
    "高基盤・低LQ": "基盤雇用は多いが分散型。特定産業への依存度は低い。",
    "低基盤・高LQ": "特定産業が突出しているが、基盤雇用の総量は少ない。",
    "低基盤・低LQ": "域内消費中心の経済。外部需要に支えられにくい。",
  };

  return (
    <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800 p-5 bg-sky-50/50 dark:bg-sky-950/20 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-lg">{city.area_name}</h3>
        {city.segment && (
          <span className="text-xs px-2.5 py-1 rounded-full border font-medium"
            style={{
              borderColor: city.basic_ratio >= 10 ? "#2A9D8F40" : "#D4A84340",
              backgroundColor: city.basic_ratio >= 10 ? "#2A9D8F10" : "#D4A84310",
              color: city.basic_ratio >= 10 ? "#2A9D8F" : "#D4A843",
            }}
          >
            {city.segment}
          </span>
        )}
      </div>

      {/* 粒度連動の注記 */}
      {granularity && granularity !== "major" && (
        <p className="text-xs text-amber-700 -mt-2">
          ℹ️ 粒度{granularitySuffix}: KPI と TOP 産業がスコアカードのトグルに連動
        </p>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="総雇用" value={city.total_emp.toLocaleString()} />
        <KpiCard
          title="基盤雇用"
          value={Math.round(activeBasicEmp).toLocaleString()}
          subtitle={granularity && granularity !== "major" ? `大分類: ${Math.round(city.basic_emp).toLocaleString()}` : undefined}
        />
        <KpiCard
          title="基盤雇用比率"
          value={`${activeBasicRatio.toFixed(1)}%`}
          subtitle={granularity && granularity !== "major" ? `大分類: ${city.basic_ratio.toFixed(1)}%` : undefined}
        />
        <KpiCard title="最大LQ産業" value={`${city.max_lq.toFixed(2)}`} subtitle={city.max_lq_industry} />
        <KpiCard
          title="基盤産業数"
          value={String(activeNBasic)}
          subtitle={granularity && granularity !== "major" ? `大分類: ${city.num_basic}` : undefined}
        />
      </div>

      {/* 市区町村のリスク・アクセス・将来予測サマリ（NLNI 未活用フィールド表示） */}
      <div className="rounded-lg border bg-white dark:bg-slate-900 p-3 space-y-2">
        <p className="text-xs font-semibold">📊 市区町村の補助指標（リスク・アクセス・人口動態）</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {city.flood_risk_pct != null && (
            <div className="rounded border p-2">
              <div className="text-slate-500">浸水リスク面積率</div>
              <div className="font-semibold">{city.flood_risk_pct.toFixed(1)}%</div>
              {city.max_flood_depth != null && (
                <div className="text-xs text-rose-700">
                  最大浸水深: {city.max_flood_depth === 11 ? "0.5m未満" :
                              city.max_flood_depth === 12 ? "0.5-3m" :
                              city.max_flood_depth === 13 ? "3-5m" :
                              city.max_flood_depth === 14 ? "5-10m" :
                              city.max_flood_depth === 15 ? "10-20m" :
                              city.max_flood_depth === 16 ? "20m以上" : `ランク${city.max_flood_depth}`}
                </div>
              )}
            </div>
          )}
          {city.nearest_station_min != null && (
            <div className="rounded border p-2">
              <div className="text-slate-500">最寄り駅まで</div>
              <div className="font-semibold">車{city.nearest_station_min.toFixed(0)}分</div>
              {city.nearest_station_name && (
                <div className="text-xs text-slate-500 truncate" title={city.nearest_station_name}>
                  {city.nearest_station_name}駅
                </div>
              )}
            </div>
          )}
          {city.car_dependency_score != null && (
            <div className="rounded border p-2">
              <div className="text-slate-500">車依存度スコア</div>
              <div className="font-semibold">{city.car_dependency_score.toFixed(0)}</div>
              <div className="text-xs text-slate-500">
                {city.car_dependency_score >= 70 ? "高（山間・離島型）" :
                 city.car_dependency_score >= 50 ? "中（地方郊外）" :
                 city.car_dependency_score >= 30 ? "低（都市型）" : "極低"}
              </div>
            </div>
          )}
          {(city.pop_2030 != null || city.pop_2050 != null) && (
            <div className="rounded border p-2">
              <div className="text-slate-500">人口予測 (国立社人研)</div>
              {city.pop_2030 != null && (
                <div className="text-xs">2030: <span className="font-semibold">{city.pop_2030.toLocaleString()}</span></div>
              )}
              {city.pop_2050 != null && (
                <div className="text-xs">2050: <span className="font-semibold">{city.pop_2050.toLocaleString()}</span></div>
              )}
            </div>
          )}
          {city.did_area_ha != null && city.did_area_ha > 0 && (
            <div className="rounded border p-2">
              <div className="text-slate-500">DID面積 / 人口</div>
              <div className="font-semibold">{city.did_area_ha.toFixed(0)} ha</div>
              <div className="text-xs text-slate-500">
                {city.did_population != null ? `${city.did_population.toLocaleString()}人` : ""}
              </div>
            </div>
          )}
          {city.has_location_plan && (
            <div className="rounded border p-2 bg-purple-50">
              <div className="text-slate-500">立地適正化計画</div>
              <div className="font-semibold text-purple-700">策定済み</div>
              <div className="text-xs text-slate-500">コンパクトシティ施策対象</div>
            </div>
          )}
        </div>
        {/* 投資物件タイプとセグメントの紐付け */}
        {city.segment && <PropertyRecommendation segment={city.segment} city={city} />}
      </div>

      {/* 中分類/+農林業の基盤産業TOP (粒度トグル時のみ) */}
      {activeTopLq && activeTopLq.length > 0 && (
        <div className="rounded-lg border bg-white dark:bg-slate-900 p-3">
          <p className="text-xs font-semibold mb-2">
            基盤産業 TOP {Math.min(activeTopLq.length, 5)} {granularitySuffix}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {activeTopLq.slice(0, 5).map((r) => (
              <div key={r.industry} className="rounded border p-2 text-xs">
                <div className="font-medium truncate" title={r.industry}>{r.industry}</div>
                <div className="text-xs text-slate-500">LQ {r.lq.toFixed(2)} / 基盤 {Math.round(r.basic_emp_estimate).toLocaleString()}人</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* County rank bars */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {prefName}内の順位
          </p>
          <div className="space-y-3">
            <MunicipalityRankBar label="総雇用" value={city.total_emp} allValues={allEmp} />
            <MunicipalityRankBar label="基盤雇用比率" value={city.basic_ratio} allValues={allBasicRatio} unit="%" />
            <MunicipalityRankBar label="最大LQ" value={city.max_lq} allValues={allMaxLq} />
          </div>
        </div>

        {/* Peer comparison */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            同規模市区町村との比較（雇用±50%）
          </p>
          {peers.length === 0 ? (
            <p className="text-xs text-muted-foreground">同規模の比較対象がありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">市区町村</th>
                    <th className="text-right py-1">雇用</th>
                    <th className="text-right py-1">基盤比率</th>
                    <th className="text-right py-1">最大LQ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-sky-100/50 dark:bg-sky-900/20 font-semibold">
                    <td className="py-1">{city.area_name}</td>
                    <td className="text-right py-1">{city.total_emp.toLocaleString()}</td>
                    <td className="text-right py-1">{city.basic_ratio.toFixed(1)}%</td>
                    <td className="text-right py-1">{city.max_lq.toFixed(2)}</td>
                  </tr>
                  {peers.map((p) => (
                    <tr key={p.area_code} className="border-b">
                      <td className="py-1">{p.area_name}</td>
                      <td className="text-right py-1">{p.total_emp.toLocaleString()}</td>
                      <td className="text-right py-1">{p.basic_ratio.toFixed(1)}%</td>
                      <td className="text-right py-1">{p.max_lq.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Segment interpretation */}
      {city.segment && segmentDesc[city.segment] && (
        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs">
            <span className="font-semibold">セグメント「{city.segment}」: </span>
            {segmentDesc[city.segment]}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScorecardTab (full component)                                      */
/* ------------------------------------------------------------------ */

/** 経済圏モード時に各タブの先頭に表示するバナー */
function EconZoneBanner({ codes, label }: { codes: string[]; label?: string }) {
  if (codes.length === 0) return null;
  return (
    <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 p-3 mb-4 text-sm">
      <strong>経済圏モード</strong>（{codes.length}市区町村を合算）{label && <span className="text-muted-foreground ml-1">— {label}</span>}
      <p className="text-xs text-muted-foreground mt-0.5">
        投資判断ハブで選択した経済圏のデータで表示しています。
        <a href="?tab=decision_hub" className="text-blue-600 ml-1 hover:underline">→ 経済圏を変更する</a>
      </p>
    </div>
  );
}

/** 各タブの先頭にCI102教科書のリンクを表示 */
function LearnLink({ chapter, title }: { chapter: string; title: string }) {
  return (
    <div className="text-xs text-muted-foreground mb-3">
      📖 この分析手法: <a href={`/learn#${chapter}`} className="text-blue-600 hover:underline">{title}</a>
    </div>
  );
}

function ScorecardTab({ pref, allData, scoreColor, selectedCity, municipalities, pfId, setPfId, pfData, pfLoading, fetchProformer, aiResult, aiLoading, runAiAnalysis }: {
  pref: PrefectureData;
  allData: Record<string, PrefectureData> | null;
  scoreColor: string;
  selectedCity: MunicipalityData | null;
  municipalities: MunicipalityData[];
  pfId: string; setPfId: (v: string) => void;
  pfData: any; pfLoading: boolean; fetchProformer: () => void;
  aiResult: string | null; aiLoading: boolean; runAiAnalysis: () => void;
}) {
  const narrative = useMemo(() => generateNarrative(pref, allData), [pref, allData]);
  const allPrefs = allData ? Object.values(allData) : [];

  // 分類粒度トグル（major: 大分類17 / mid: 中分類95 / extended: +農林業補完）
  // デフォルトは中分類（大野氏指摘: 大分類ではEBMが過大）
  type Granularity = "major" | "mid" | "extended";
  const hasMid = pref.ebm_mid != null && pref.basic_ratio_mid != null;
  const [granularity, setGranularity] = useState<Granularity>(hasMid ? "mid" : "major");
  const hasExtended = pref.ebm_mid_extended != null && pref.basic_ratio_mid_extended != null;

  // 市区町村 or 都道府県: 市区町村選択時は市区町村データを優先
  const sc = selectedCity; // alias
  const scopeLabel = sc ? sc.area_name : pref.pref_name;
  const scopeEmp = sc?.total_emp ?? pref.total_employment ?? 0;
  const isSmallArea = scopeEmp < 5000;

  // 選択された粒度に応じてアクティブな指標を切り替え（市区町村優先）
  const activeEbm =
    granularity === "extended" && (sc?.ebm_mid_extended ?? pref.ebm_mid_extended) != null ? (sc?.ebm_mid_extended ?? pref.ebm_mid_extended)! :
    granularity === "mid" && (sc?.ebm_mid ?? pref.ebm_mid) != null ? (sc?.ebm_mid ?? pref.ebm_mid)! :
    (sc?.ebm ?? pref.ebm);
  const activeBasicRatio =
    granularity === "extended" && (sc?.basic_ratio_mid_extended ?? pref.basic_ratio_mid_extended) != null ? (sc?.basic_ratio_mid_extended ?? pref.basic_ratio_mid_extended)! :
    granularity === "mid" && (sc?.basic_ratio_mid ?? pref.basic_ratio_mid) != null ? (sc?.basic_ratio_mid ?? pref.basic_ratio_mid)! :
    (sc?.basic_ratio ?? pref.basic_ratio);
  const activeBasicEmp =
    granularity === "extended" && (sc?.basic_emp_mid_extended ?? pref.basic_emp_mid_extended) != null ? (sc?.basic_emp_mid_extended ?? pref.basic_emp_mid_extended)! :
    granularity === "mid" && (sc?.basic_emp_mid ?? pref.basic_emp_mid) != null ? (sc?.basic_emp_mid ?? pref.basic_emp_mid)! :
    (sc?.basic_emp ?? pref.basic_emp);
  const activeNBasicIndustries =
    granularity === "extended" && (sc?.n_basic_industries_extended ?? pref.n_basic_industries_extended) != null ? (sc?.n_basic_industries_extended ?? pref.n_basic_industries_extended)! :
    granularity === "mid" && (sc?.n_basic_industries_mid ?? pref.n_basic_industries_mid) != null ? (sc?.n_basic_industries_mid ?? pref.n_basic_industries_mid)! :
    sc ? (sc.num_basic ?? 0) : pref.top_lq_industries.filter(i => i.lq > 1.0).length;
  const activeTopLq =
    granularity === "extended" && (sc?.top_lq_industries_extended ?? pref.top_lq_industries_extended)?.length ? (sc?.top_lq_industries_extended ?? pref.top_lq_industries_extended)! :
    granularity === "mid" && (sc?.top_lq_industries_mid ?? pref.top_lq_industries_mid)?.length ? (sc?.top_lq_industries_mid ?? pref.top_lq_industries_mid)! :
    pref.top_lq_industries;

  // 投資適格スコア: 市区町村用は EBM/基盤比率/規模から簡易計算（RS/ギャップは都道府県フォールバック）
  const activeScore = (() => {
    const prefScore =
      granularity === "extended" && pref.suitability_score_extended ? pref.suitability_score_extended :
      granularity === "mid" && pref.suitability_score_mid ? pref.suitability_score_mid :
      pref.suitability_score;
    if (!sc) return prefScore;
    // 市区町村用の簡易スコア計算
    const ebm = activeEbm;
    const ratio = activeBasicRatio;
    const emp = scopeEmp;
    // EBMスコア: 3-6が健全域 (山型)
    const ebmS = ebm >= 3 && ebm <= 6 ? 100 : ebm >= 2 && ebm <= 8 ? 75 : ebm >= 1.5 && ebm <= 10 ? 55 : 35;
    // 基盤比率スコア: 15-25%がピーク
    const ratioS = ratio >= 15 && ratio <= 25 ? 100 : ratio >= 10 && ratio <= 35 ? 80 : ratio >= 5 ? 55 : 30;
    // RS: 都道府県フォールバック
    const rsS = prefScore.rs_score ?? 50;
    // ギャップ: 都道府県フォールバック
    const gapS = prefScore.gap_score ?? 50;
    // 規模: log10スケール
    const scaleS = Math.min(100, Math.max(0, Math.log10(Math.max(1, emp)) * 20 - 20));
    const total = Math.round(0.20 * ebmS + 0.20 * ratioS + 0.25 * rsS + 0.20 * gapS + 0.15 * scaleS);
    return {
      total_score: total,
      ebm_score: ebmS,
      ratio_score: ratioS,
      rs_score: rsS,
      gap_score: gapS,
      scale_score: scaleS,
    };
  })();

  const scoreLabel = activeScore.total_score >= 80 ? "優良"
    : activeScore.total_score >= 60 ? "良好"
    : activeScore.total_score >= 40 ? "標準"
    : "要注意";

  const granularityLabel = granularity === "major" ? "大分類17業種（CCIM教科書）"
    : granularity === "mid" ? "中分類95業種（詳細診断）"
    : "+農林業補完（地方都市の実評価）";

  return (
    <div className="space-y-6">
      {/* 分類粒度トグル — 上部に目立つ位置で表示 */}
      <Card className="p-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-sm">
            <span className="font-semibold">📐 分類粒度:</span>
            <span className="ml-2 text-slate-700">{granularityLabel}</span>
          </div>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setGranularity("major")}
              className={`px-3 py-1.5 rounded-md border transition-colors ${
                granularity === "major"
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="CCIM CI102 教科書の16業種に最も近い粒度。教科書通りの議論にはこちら。"
            >
              大分類17業種
            </button>
            <button
              onClick={() => setGranularity("mid")}
              disabled={!hasMid}
              className={`px-3 py-1.5 rounded-md border transition-colors ${
                granularity === "mid"
                  ? "bg-slate-800 text-white border-slate-800"
                  : !hasMid
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="情報サービス業・機械器具卸売業など細分の特化産業を捉える。詳細診断向け。"
            >
              中分類95業種
            </button>
            <button
              onClick={() => setGranularity("extended")}
              disabled={!hasExtended}
              className={`px-3 py-1.5 rounded-md border transition-colors ${
                granularity === "extended"
                  ? "bg-slate-800 text-white border-slate-800"
                  : !hasExtended
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              title="農林業センサス2020の個人経営家族農家を含む。地方都市・農業地域の現実評価向け。"
            >
              +農林業補完
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          ⚡ KPI・基盤産業TOP・投資スコアは選択した粒度に連動します。シフトシェア・小売ギャップ・地価は粒度と無関係（独立データ）。
          詳細は <a href="/learn#ch9-granularity" className="underline text-blue-700">学習第9章</a>。
        </p>
      </Card>

      {/* 分析対象の表示 */}
      {sc && (
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3 text-sm">
          <span className="font-bold">分析対象: {scopeLabel}</span>
          <span className="text-muted-foreground ml-2">（{pref.pref_name}内・雇用 {scopeEmp.toLocaleString()} 人）</span>
          {sc && <span className="text-xs text-muted-foreground ml-1">※ シフトシェア・小売ギャップは{pref.pref_name}の値を代用</span>}
        </div>
      )}

      {/* 小規模自治体の注意 + 広域切替誘導 */}
      {isSmallArea && sc && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200">
          <strong>⚠️ 母数が小さくスコアが不安定です</strong>（雇用 {scopeEmp.toLocaleString()} 人）。
          1事業所の移転でLQ・EBMが大きく変動する可能性があります。
          <div className="mt-1.5 flex gap-2">
            <a href="?tab=decision_hub" className="inline-block rounded bg-blue-600 text-white px-3 py-1 text-xs font-bold hover:bg-blue-700">
              → 投資判断ハブで経済圏（広域）分析する
            </a>
            <span className="text-xs self-center text-muted-foreground">複数市区町村を合算すると精度が向上します</span>
          </div>
        </div>
      )}

      {/* 通勤歪み警告（事業所所在地 vs 居住地の地理的不整合） */}
      {pref.commute_distortion === "inflow" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>⚠️ 通勤流入による数値膨張</strong>: 雇用/人口 ={" "}
          {pref.emp_to_pop_ratio ? (pref.emp_to_pop_ratio * 100).toFixed(0) : "—"}% （PER {pref.per.toFixed(2)}）。
          e-Stat経済センサスは事業所所在地ベースのため、通勤者が雇用に算入されEBM・基盤雇用が住民あたりで見ると過大に見えます。
          CI102の本来の分析単位はMSA（経済圏）です。
        </div>
      )}
      {pref.commute_distortion === "outflow" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>⚠️ ベッドタウン特性</strong>: 雇用/人口 ={" "}
          {pref.emp_to_pop_ratio ? (pref.emp_to_pop_ratio * 100).toFixed(0) : "—"}% （PER {pref.per.toFixed(2)}）。
          市内事業所での雇用が薄く、EBM が {pref.ebm.toFixed(1)} と教科書範囲（3-6）を超える値を示しています。
          都市圏全体（東京圏・京阪神圏など）での再評価を推奨します。
        </div>
      )}
      {/* ---- Score Header: Gauge + Radar + Benchmarks ---- */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Gauge + KPI cards */}
        <div className="space-y-4">
          <Card className="text-center p-4">
            <ScoreGauge score={activeScore.total_score} label={`${scoreLabel} — ${pref.pref_name}`} />
            <p className="text-xs text-slate-500 mt-1">スコア基準: {granularityLabel}</p>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              title="EBM"
              value={activeEbm.toFixed(2)}
              subtitle={
                granularity === "major"
                  ? (pref.ebm_mid != null ? `中分類: ${pref.ebm_mid.toFixed(2)}` : "経済基盤乗数")
                  : granularity === "mid"
                    ? `大分類: ${pref.ebm.toFixed(2)}`
                    : `大分類: ${pref.ebm.toFixed(2)} / 中分類: ${pref.ebm_mid?.toFixed(2) ?? "—"}`
              }
              tooltip="EBM = 1 / 基盤雇用比率。教科書Orlando 4.94 / 全国市区町村中央値4.99(大分類)・2.86(中分類)。健全レンジ3-6。値が大きいほど『基盤雇用が薄い』状態で、必ずしも経済が強い意味ではない。"
            />
            <KpiCard
              title="PER"
              value={pref.per.toFixed(2)}
              subtitle={pref.commute_distortion === "inflow" ? "⚠️通勤流入" : pref.commute_distortion === "outflow" ? "⚠️通勤流出" : "人口雇用比率"}
              tooltip="就業者1人あたりの総人口。CI102 Orlando MSA: 1.91。PER<1.0は通勤流入で雇用が膨張している（事業所所在地ベース）状態を示唆。"
            />
            <KpiCard title="RS合計" value={pref.rs_total.toLocaleString()} trend={pref.rs_total > 0 ? "up" : pref.rs_total < 0 ? "down" : "flat"} tooltip="地域シフト合計。正=全国を上回る競争力、負=劣位" />
            <KpiCard title="漏損/余剰" value={pref.aggregate_gap_factor.toFixed(1)} tooltip="小売購買力の流出入度合い。正=漏損(出店機会)、負=余剰(供給過多)" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <KpiCard
              title="基盤雇用比率"
              value={`${activeBasicRatio.toFixed(1)}%`}
              subtitle={
                granularity === "major"
                  ? (pref.basic_ratio_mid != null ? `中分類: ${pref.basic_ratio_mid.toFixed(1)}%` : undefined)
                  : granularity === "mid"
                    ? `大分類: ${pref.basic_ratio.toFixed(1)}%`
                    : `大分類: ${pref.basic_ratio.toFixed(1)}% / 中分類: ${pref.basic_ratio_mid?.toFixed(1) ?? "—"}%`
              }
              tooltip="LQ>1.0の産業の超過雇用が総雇用に占める割合。教科書Orlando: 20.2% / 全国市区町村中央値20.0%(大分類)。中分類で見ると埋もれていた特化産業が見える。農林業センサス補完版は経済センサス民営事業所(法人のみ)に家族農家を加えた拡張版。"
            />
            <KpiCard title="昼間人口" value={pref.daytime_population.toLocaleString()} tooltip="通勤・通学で流入する人口を含む日中の人口" />
            <KpiCard title="実績雇用変化" value={pref.actual_emp_change.toLocaleString()} subtitle="2016→2021" trend={pref.actual_emp_change > 0 ? "up" : "down"} tooltip="2016年→2021年の実際の雇用増減（経済センサス）" />
          </div>
        </div>

        {/* Center: Radar chart */}
        <div>
          <Card className="p-4 h-full flex flex-col justify-center">
            <ScorecardRadar pref={pref} allData={allData} />
          </Card>
        </div>

        {/* Right: Benchmark bars */}
        <div>
          <Card className="p-4 h-full">
            <p className="text-sm font-semibold mb-3">全国ベンチマーク（47都道府県）</p>
            <div className="space-y-4">
              {(() => {
                const benchmarks = [
                  { label: "EBM", value: pref.ebm, getter: (p: PrefectureData) => p.ebm, higherIsBetter: true },
                  { label: "基盤雇用比率", value: pref.basic_ratio, getter: (p: PrefectureData) => p.basic_ratio, unit: "%", higherIsBetter: true },
                  { label: "RS合計", value: pref.rs_total, getter: (p: PrefectureData) => p.rs_total, higherIsBetter: true },
                  { label: "Gap係数", value: pref.aggregate_gap_factor, getter: (p: PrefectureData) => p.aggregate_gap_factor, higherIsBetter: true },
                  { label: "投資適格スコア", value: pref.suitability_score.total_score, getter: (p: PrefectureData) => p.suitability_score.total_score, higherIsBetter: true },
                ];
                return benchmarks.map((b) => {
                  const stats = computeBenchmark(b.value, allPrefs.map(b.getter), b.higherIsBetter);
                  return (
                    <BenchmarkBar
                      key={b.label}
                      value={b.value}
                      min={stats.min}
                      max={stats.max}
                      median={stats.median}
                      label={b.label}
                      unit={b.unit}
                      higherIsBetter={b.higherIsBetter}
                    />
                  );
                });
              })()}
            </div>
          </Card>
        </div>
      </div>

      {/* ---- 業種分類粒度の影響（3列比較）---- */}
      {pref.ebm_mid != null && (
        <Card className="p-4">
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              📊 大分類 vs 中分類 vs +農林業センサス — なぜEBMが大きく異なるのか
            </summary>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <p>
                同じ地域でも<strong>業種分類の粒度</strong>によってEBM・基盤雇用比率が大きく変わります。これは
                LQ計算の<strong>凸性質（Mulligan &amp; Murphy 1995）</strong>に由来する数学的必然です。
              </p>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-2 px-2">指標</th>
                    <th className="text-right py-2 px-2">大分類17業種<br/>（CCIM教科書粒度）</th>
                    <th className="text-right py-2 px-2">中分類95業種<br/>（詳細補正）</th>
                    <th className="text-right py-2 px-2">+農林業補完<br/>（家族農家込み）</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1.5 px-2">EBM</td>
                    <td className="text-right">{pref.ebm.toFixed(2)}</td>
                    <td className="text-right font-semibold">{pref.ebm_mid?.toFixed(2) ?? "—"}</td>
                    <td className="text-right">{pref.ebm_mid_extended?.toFixed(2) ?? "—"}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5 px-2">基盤雇用比率</td>
                    <td className="text-right">{pref.basic_ratio.toFixed(1)}%</td>
                    <td className="text-right font-semibold">{pref.basic_ratio_mid?.toFixed(1) ?? "—"}%</td>
                    <td className="text-right">{pref.basic_ratio_mid_extended?.toFixed(1) ?? "—"}%</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2">基盤産業数</td>
                    <td className="text-right">{pref.top_lq_industries.filter(i => i.lq > 1.0).length}</td>
                    <td className="text-right font-semibold">{pref.n_basic_industries_mid ?? "—"}</td>
                    <td className="text-right">{pref.n_basic_industries_mid ?? "—"}</td>
                  </tr>
                </tbody>
              </table>

              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="font-semibold">💡 なぜここまで差が出るのか — 鹿児島県の例</p>
                <p className="mt-2">
                  <strong>大分類で『卸売・小売業』を1つの業種として見る場合</strong>:
                </p>
                <ul className="list-disc pl-5 mt-1">
                  <li>地域雇用 131,647人 / 全国雇用 11,477,197人 → LQ = 0.992</li>
                  <li>LQ &lt; 1.0 なので<strong>基盤雇用 = 0 人</strong>と判定される</li>
                </ul>
                <p className="mt-2">
                  <strong>中分類で12業種に分解すると</strong>:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li>飲食料品卸売業（地域の物流ハブ）LQ=1.38 → 基盤 3,271人</li>
                  <li>各種商品小売業（地元百貨店等）LQ=1.37 → 基盤 1,233人</li>
                  <li>飲食料品小売業 LQ=1.12 → 基盤 4,381人</li>
                  <li>機械器具小売業 LQ=1.15 → 基盤 1,553人</li>
                  <li>その他の小売業 LQ=1.15 → 基盤 3,997人</li>
                  <li>合計 <strong>14,456人の基盤雇用が『発見』</strong>される</li>
                </ul>
                <p className="mt-2 text-xs">
                  大分類で「平均的」に見える業種でも、中分類で見れば特化している細分があり、
                  それが地域の経済基盤を担っている — これが「分類粒度」の本質的な意味。
                </p>
              </div>

              <div className="bg-slate-50 border rounded p-3">
                <p className="font-semibold mb-2">どの指標に影響するか</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1">指標</th>
                      <th className="text-left py-1">影響</th>
                      <th className="text-left py-1">理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b"><td>LQ・基盤雇用</td><td className="text-rose-700">大</td><td>細分化で隠れた特化が見える</td></tr>
                    <tr className="border-b"><td>EBM</td><td className="text-rose-700">大</td><td>1 / 基盤雇用比率の双曲関係</td></tr>
                    <tr className="border-b"><td>シフトシェアRS</td><td className="text-amber-700">中</td><td>業種数で NS/IM/RS 分解が変わる</td></tr>
                    <tr className="border-b"><td>投資適格スコア</td><td className="text-amber-700">中</td><td>EBM・基盤比率を使うため</td></tr>
                    <tr className="border-b"><td>需要予測カスケード</td><td className="text-amber-700">中</td><td>EBM変化が総雇用→人口→住宅に波及</td></tr>
                    <tr className="border-b"><td>PER</td><td className="text-slate-500">小</td><td>分母の雇用範囲（公務含む/民営のみ）で僅差</td></tr>
                    <tr><td>小売ギャップ・地価・人口</td><td className="text-emerald-700">なし</td><td>独立データソース</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <p className="font-semibold">どの数値を信じるべきか — 用途別の使い分け</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>CI102教科書通りの分析</strong> → 大分類17業種版（CCIM Activity 4-1 と同じ16業種粒度）</li>
                  <li><strong>詳細な地域経済診断</strong> → 中分類95業種版（隠れた特化を捉える）</li>
                  <li><strong>地方都市・農業地域の現実評価</strong> → +農林業センサス補完版（家族農家を含む）</li>
                </ul>
                <p className="mt-2 text-xs">
                  → どれが「正しい」ではなく、<strong>目的に応じて使い分ける</strong>。
                  詳細は <a href="/learn#ch9-granularity" className="text-emerald-700 underline">学習ページ第9章「業種分類粒度とCI102分析」</a> を参照。
                </p>
              </div>
            </div>
          </details>
        </Card>
      )}

      {/* ---- EBM Structural Decomposition (educational) ---- */}
      {pref.lq_above1_share != null && pref.avg_excess_coef != null && (
        <Card className="p-4">
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              📖 EBM/基盤雇用比率はなぜこの値か（数学的分解）
            </summary>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <p>
                <strong>EBM = 1 / 基盤雇用比率</strong> という恒等式があります。基盤雇用比率は次のように分解できます:
              </p>
              <p className="font-mono bg-slate-50 p-2 rounded">
                基盤雇用比率 = (LQ&gt;1.0 業種の雇用シェア合計) × (平均 (1-1/LQ) 係数)
              </p>
              <p>この地域の現在値:</p>
              <ul className="list-disc pl-6 space-y-0.5">
                <li>LQ&gt;1.0 業種の雇用シェア合計: <strong>{pref.lq_above1_share.toFixed(1)}%</strong></li>
                <li>
                  平均 (1-1/LQ) 係数（特化の深さ）: <strong>{pref.avg_excess_coef.toFixed(3)}</strong>
                  {" "}（平均LQ ≈ {pref.avg_excess_coef < 1 ? (1 / (1 - pref.avg_excess_coef)).toFixed(2) : "∞"}）
                </li>
                <li>基盤雇用比率 = {pref.lq_above1_share.toFixed(1)}% × {pref.avg_excess_coef.toFixed(3)} = <strong>{pref.basic_ratio.toFixed(1)}%</strong></li>
                <li>EBM = 1 / {(pref.basic_ratio / 100).toFixed(4)} = <strong>{pref.ebm.toFixed(2)}</strong></li>
              </ul>

              <table className="w-full text-xs mt-3 border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1">指標</th>
                    <th className="text-right py-1">Orlando MSA（教科書）</th>
                    <th className="text-right py-1">この地域</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1">LQ&gt;1.0 業種シェア</td>
                    <td className="text-right">65%</td>
                    <td className="text-right">{pref.lq_above1_share.toFixed(1)}%</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1">平均(1-1/LQ)係数</td>
                    <td className="text-right">0.312（平均LQ 1.45）</td>
                    <td className="text-right">
                      {pref.avg_excess_coef.toFixed(3)}
                      （平均LQ ≈ {pref.avg_excess_coef < 1 ? (1 / (1 - pref.avg_excess_coef)).toFixed(2) : "∞"}）
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1">基盤雇用比率</td>
                    <td className="text-right">20.2%</td>
                    <td className="text-right">{pref.basic_ratio.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-semibold">EBM</td>
                    <td className="text-right font-semibold">4.94</td>
                    <td className="text-right font-semibold">{pref.ebm.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 mt-3">
                <p className="font-semibold">なぜ日本の都市はEBMが高くなりがちか</p>
                <p className="mt-1">
                  日本の都市は『弱い特化（LQ 1.1-1.5）が多数』あるが『深い特化（LQ&gt;2.0）が少ない』傾向。
                  Orlandoは Leisure 1.75・Financial 1.74 と<strong>強い特化</strong>を持つが、
                  日本の地方都市は LQ 1.2-1.4 程度に収まることが多い。
                  (1-1/1.2)=0.167、(1-1/1.4)=0.286 と急速に減衰するため、
                  雇用シェアが大きくても基盤雇用への寄与は限定的になる。
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <p className="font-semibold">正しい解釈の指針</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li><strong>EBM 3-6</strong> = 教科書MSA健全レンジ（多角化＋輸出基盤）</li>
                  <li><strong>EBM &gt; 8</strong> = 必ずしも『経済が強い』ではなく、基盤雇用が薄く乗数が機械的に膨張</li>
                  <li>中分類95業種で再計算すると、埋もれていた特化産業が見えてEBMが教科書範囲に正規化</li>
                </ul>
              </div>
            </div>
          </details>
        </Card>
      )}

      {/* ---- 農林業センサス補完の注釈 ---- */}
      {pref.agri_eco_workers != null && pref.agri_extended_workers != null &&
        pref.agri_extended_workers - pref.agri_eco_workers > 500 && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <p className="text-sm">
            📊 <strong>農業従業者の補完</strong>:
            経済センサス {pref.agri_eco_workers.toLocaleString()}人 →
            農林業センサス補完 {pref.agri_extended_workers.toLocaleString()}人
            （+{(pref.agri_extended_workers - pref.agri_eco_workers).toLocaleString()}人、個人経営の家族農家を含む推計）
          </p>
          <p className="text-xs text-slate-600 mt-2">
            ℹ️ <strong>注意</strong>: 『基幹的農業従事者』は『仕事が主で、主に自営農業に従事した世帯員』であり、
            経済センサスの雇用者と労働時間・雇用形態が異なります（農繁期・農閑期で変動）。
            按分は県内の経済センサス農業雇用構成比で行うため、農業法人が無い家族農家のみの市町村ではゼロ計上される場合があります（県全体集計は正確）。
          </p>
        </Card>
      )}

      {/* ---- Spatial Risk/Access Adjustment (enhanced_score) ---- */}
      {pref.enhanced_score != null && pref.score_adjustments && (
        <>
          <Separator />
          <SpatialAdjustment pref={pref} />
        </>
      )}

      {/* ---- Municipality data (enhanced) ---- */}
      {selectedCity && (
        <>
          <Separator />
          <MunicipalityDetail
            city={selectedCity}
            municipalities={municipalities}
            prefName={pref.pref_name}
            granularity={granularity}
          />
        </>
      )}

      <Separator />

      {/* ---- 人口長期予測 (2020-2070) ---- */}
      {pref.pop_projection && Object.keys(pref.pop_projection).length >= 3 && (
        <Card className="p-4">
          <PopulationProjectionPanel pref={pref} />
        </Card>
      )}

      <Separator />

      {/* ---- Narrative + Top Industries ---- */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <NarrativePanel narrative={narrative} />

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold">
                基盤産業 TOP {Math.min(activeTopLq.length, 10)}
              </h3>
              <span className="text-xs text-slate-500">
                {granularity === "major" ? "大分類17業種" : granularity === "mid" ? "中分類95業種" : "+農林業補完"}
                {" "}({activeNBasicIndustries}業種が LQ&gt;1.0)
              </span>
            </div>
            <div className="space-y-2">
              {activeTopLq.slice(0, granularity === "major" ? 5 : 10).map((r, i) => (
                <div key={r.industry} className="flex justify-between items-center rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#2A9D8F]/10 text-[#2A9D8F] text-xs font-bold">{i + 1}</span>
                    <span className="text-xs font-medium">{r.industry}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#2A9D8F]">LQ {r.lq.toFixed(2)}</span>
                    <p className="text-xs text-muted-foreground">基盤 {Math.round(r.basic_emp_estimate).toLocaleString()}人</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Investment signals */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">投資シグナル</h3>
            <div className="space-y-2">
              {pref.rs_total > 0 && <div className="rounded-lg border-l-4 border-l-[#2A9D8F] p-2.5 bg-green-50 dark:bg-green-950/30"><p className="text-xs">RS +{pref.rs_total.toLocaleString()} — 競争優位</p></div>}
              {pref.rs_total < 0 && <div className="rounded-lg border-l-4 border-l-[#E76F51] p-2.5 bg-red-50 dark:bg-red-950/30"><p className="text-xs">RS {pref.rs_total.toLocaleString()} — 競争力低下</p></div>}
              {pref.aggregate_gap_factor > 10 && <div className="rounded-lg border-l-4 border-l-[#2A9D8F] p-2.5 bg-green-50 dark:bg-green-950/30"><p className="text-xs">漏損 +{pref.aggregate_gap_factor.toFixed(1)} — {pref.num_leakage_sectors}セクターに出店機会</p></div>}
              {pref.aggregate_gap_factor < -10 && <div className="rounded-lg border-l-4 border-l-[#E76F51] p-2.5 bg-red-50 dark:bg-red-950/30"><p className="text-xs">供給過多 {pref.aggregate_gap_factor.toFixed(1)} — {pref.num_surplus_sectors}セクター</p></div>}
              {pref.actual_emp_change < 0 && <div className="rounded-lg border-l-4 border-l-[#E76F51] p-2.5 bg-red-50 dark:bg-red-950/30"><p className="text-xs">雇用減少 {pref.actual_emp_change.toLocaleString()}人（2016→2021）</p></div>}
              {pref.rs_total === 0 && pref.aggregate_gap_factor >= -10 && pref.aggregate_gap_factor <= 10 && pref.actual_emp_change >= 0 && (
                <p className="text-xs text-muted-foreground">特筆すべきシグナルはありません。</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Proformer */}
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold mb-2">Proformer 物件データ連携</h3>
        <div className="flex gap-2 items-end">
          <input value={pfId} onChange={(e) => setPfId(e.target.value)} placeholder="物件データID (external_id)"
            aria-label="Proformer 物件データID"
            className="flex-1 rounded border px-3 py-1.5 text-sm bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          <button onClick={fetchProformer} disabled={pfLoading || !pfId}
            aria-label="Proformer データを取得"
            className="rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-1.5 text-sm disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none">
            {pfLoading ? "取得中..." : "取得"}
          </button>
        </div>
        {pfData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <KpiCard title="取得価格" value={`¥${(pfData.property?.acquisition_price ?? 0).toLocaleString()}`} />
            <KpiCard title="NOI" value={`¥${(pfData.noi_annual ?? 0).toLocaleString()}`} />
            <KpiCard title="Cap Rate" value={`${((pfData.investment_performance?.cap_rate ?? 0) * 100).toFixed(1)}%`} />
            <KpiCard title="IRR" value={`${((pfData.investment_performance?.irr ?? 0) * 100).toFixed(1)}%`} />
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold mb-2">AI分析（Claude）</h3>
        <button onClick={runAiAnalysis} disabled={aiLoading}
          aria-label="AI分析を生成"
          className="rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-1.5 text-sm disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:outline-none">
          {aiLoading ? "分析中..." : pfData ? "AI統合分析を生成（地域+物件）" : "AI分析を生成"}
        </button>
        {aiResult && (
          <div className="mt-3 prose prose-sm dark:prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: aiResult.replace(/\n/g, "<br/>") }} />
            <p className="text-xs text-muted-foreground mt-2">
              この分析はAIが生成したものです。過去のスナップショットデータに基づいています。
            </p>
          </div>
        )}
      </div>

      <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="font-medium cursor-pointer">ℹ️ データの時点と制限（Lagging Indicators）</summary>
        <div className="mt-2 space-y-3">
          <ul className="space-y-1 list-disc list-inside">
            <li>経済センサス: 2021年6月時点（5年ごと更新、次回2026年）</li>
            <li>国勢調査: 2020年10月時点（人口は2015年の値を2020年境界に組替）</li>
            <li>建築着工統計: 2023年実績（年次更新）</li>
            <li>MLIT取引価格: 選択した四半期の実績（リアルタイムではない）</li>
          </ul>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
            <p className="font-semibold text-amber-700 dark:text-amber-400 text-xs">
              本ダッシュボードの全指標は遅行指標（Lagging Indicators）です
            </p>
            <p>
              経済センサス・国勢調査・建築着工統計はいずれも過去の実績を集計した統計であり、
              公表時点から現在までの市場変化（企業の進出・撤退、リモートワーク普及による人口移動、
              金利・建設コストの変動、都市計画の変更等）は反映されていません。
            </p>
            <p>
              特に経済センサス（2021年）はコロナ禍直後のデータであり、その後の経済回復・構造変化を含みません。
              投資判断には最新の市場調査・物件個別のデューデリジェンスと組み合わせてご利用ください。
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}

const VALID_TABS = ["scorecard", "lq", "ebm", "shift", "gap", "realestate", "map", "cross", "risk", "access", "demographics", "metro", "custom_metro", "trade_area", "decision_hub"] as const;
type TabValue = (typeof VALID_TABS)[number];

function isValidTab(v: string | null): v is TabValue {
  return v !== null && (VALID_TABS as readonly string[]).includes(v);
}

function isValidPrefCode(v: number): boolean {
  return v >= 1 && v <= 47;
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950 flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [prefCode, setPrefCode] = useState<number>(() => {
    const p = Number(searchParams.get("pref"));
    if (isValidPrefCode(p)) return p;
    // ?center= から都道府県コードを自動推定
    const c = searchParams.get("center");
    if (c && c.length >= 2) {
      const cp = Number(c.slice(0, 2));
      if (isValidPrefCode(cp)) return cp;
    }
    return 13;
  });
  const [cityCode, setCityCode] = useState<string>(() => searchParams.get("city") ?? "");
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    const t = searchParams.get("tab");
    return isValidTab(t) ? t : "decision_hub";
  });
  // 経済圏コード（URL共有用: ?zone=13101,13102,...）
  const initialZone = searchParams.get("zone")?.split(",").filter(Boolean) ?? [];
  // Proformer連携用: ?center=13120 → 通勤経済圏を自動検出して経済圏モードで起動
  const centerCode = searchParams.get("center") ?? null;
  // ページレベルの経済圏コード（decision-hubから更新され、全タブに伝搬）
  const [pageEconZoneCodes, setPageEconZoneCodes] = useState<string[]>(initialZone);

  // Sync state -> URL (replaceState, no history entry)
  // 注: center= は初回のみ使用（commuteZonesロード後にzone=に変換される）
  // center=が消えないように、zone=がまだ空の間はcenterを保持する
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("pref", String(prefCode));
    if (cityCode) params.set("city", cityCode);
    if (activeTab !== "decision_hub") params.set("tab", activeTab);
    if (pageEconZoneCodes.length > 0) {
      params.set("zone", pageEconZoneCodes.join(","));
    } else if (centerCode) {
      // zone=がまだ設定されていない間はcenterを保持（Proformer連携用）
      params.set("center", centerCode);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [prefCode, cityCode, activeTab, pageEconZoneCodes, centerCode, router]);
  const { data: pref, allData, loading, error: prefError } = usePrefectureData(prefCode);
  const { detail: prefDetailMid } = usePrefDetailMid(prefCode);
  const lqTableMid = prefDetailMid?.lq_table_mid ?? pref?.lq_table_mid;

  // 経済圏モード: matrixMidから合算employmentを計算（全タブ共有）
  const hasEconZone = pageEconZoneCodes.length > 0;
  const { matrix: pageMatrixMid } = useMuniIndustryMatrixMid(hasEconZone);
  const econZoneEmployment = useMemo(() => {
    if (!hasEconZone || !pageMatrixMid) return null;
    const local: Record<string, number> = {};
    const national = pageMatrixMid["00000"]?.employment ?? {};
    for (const code of pageEconZoneCodes) {
      const entry = pageMatrixMid[code];
      if (!entry) continue;
      for (const [ind, count] of Object.entries(entry.employment)) {
        local[ind] = (local[ind] ?? 0) + count;
      }
    }
    return { local, national };
  }, [hasEconZone, pageMatrixMid, pageEconZoneCodes]);
  const { data: municipalities, error: muniError } = useMunicipalityData(prefCode);
  const selectedCity = cityCode ? municipalities.find((m) => m.area_code === cityCode) ?? null : null;

  // Proformer state
  const [pfId, setPfId] = useState("");
  const [pfData, setPfData] = useState<any>(null);
  const [pfLoading, setPfLoading] = useState(false);

  // AI analysis state
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const scoreColor = pref
    ? pref.suitability_score.total_score >= 60 ? COLORS.positive
      : pref.suitability_score.total_score >= 40 ? COLORS.accent
      : COLORS.negative
    : COLORS.neutral;

  // Cross-analysis data (all prefectures)
  const crossAreas = useMemo(() => {
    if (!allData) return [];
    return Object.values(allData).map((p) => ({
      name: p.pref_name,
      prefCode: p.pref_code,
      localEmp: Object.fromEntries(p.lq_table.map((r) => [r.industry, r.local_emp])),
      nationalEmp: Object.fromEntries(p.lq_table.map((r) => [r.industry, r.national_emp])),
      retailSectors: p.gap_table.map((r) => ({ sector: r.sector, demand: r.demand, supply: r.supply })),
      medianUnitPrice: p.median_unit_price ?? undefined,
    }));
  }, [allData]);

  // Proformer fetch
  const fetchProformer = async () => {
    if (!pfId) return;
    setPfLoading(true);
    try {
      const res = await fetch(`/api/proformer?externalId=${pfId}`);
      const json = await res.json();
      if (json.error) { setPfData(null); } else { setPfData(json); }
    } catch { setPfData(null); }
    setPfLoading(false);
  };

  // AI analysis
  const runAiAnalysis = async () => {
    if (!pref) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefData: pref, proformerData: pfData }),
      });
      const json = await res.json();
      setAiResult(json.analysis ?? json.error ?? "分析生成に失敗しました");
    } catch { setAiResult("API接続エラー"); }
    setAiLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      {/* Skip navigation */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4 focus:text-blue-600">
        メインコンテンツへスキップ
      </a>

      {/* Header */}
      <header className="text-white px-4 py-3 shadow-md md:px-6 md:py-4 bg-[#1B2A4A] dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight md:text-xl">不動産市場分析ダッシュボード</h1>
              <p className="text-xs text-white/60 mt-0.5">データ: 経済センサス2021 ｜ 国勢調査2025速報 ｜ 不動産取引2026Q1 ｜ 社人研推計2050</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <select value={prefCode} onChange={(e) => { setPrefCode(Number(e.target.value)); setCityCode(""); setAiResult(null); }}
                aria-label="都道府県を選択"
                className="rounded px-3 py-1.5 text-sm text-gray-900 bg-white dark:bg-gray-800 dark:text-gray-100 max-w-full md:max-w-[180px] focus:ring-2 focus:ring-blue-500 focus:outline-none">
                {Object.entries(PREFECTURES).map(([code, name]) => (
                  <option key={code} value={code}>{String(code).padStart(2, "0")} {name}</option>
                ))}
              </select>
              <select value={cityCode} onChange={(e) => setCityCode(e.target.value)}
                aria-label="市区町村を選択"
                className="rounded px-3 py-1.5 text-sm text-gray-900 bg-white dark:bg-gray-800 dark:text-gray-100 max-w-full md:max-w-[180px] focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="">全県</option>
                {municipalities.map((m) => (
                  <option key={m.area_code} value={m.area_code}>{m.area_name}</option>
                ))}
              </select>
              <Badge variant="outline" className="text-white border-white/30">
                {loading ? "読込中..." : selectedCity ? selectedCity.area_name : pref?.pref_name ?? "—"}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* 初訪問バナー */}
      {typeof window !== "undefined" && !localStorage.getItem("ci102_visited") && (
        <div className="bg-blue-600 text-white px-4 py-3 text-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div>
              <strong>CI102 エリア分析</strong> — 政府統計から不動産投資の需要・供給・将来性を定量評価するツールです。
              まず「🎯 投資判断」タブで全体像を把握し、気になる指標は各タブで深掘りしてください。
              <a href="/learn" className="underline ml-1">分析手法を学ぶ →</a>
            </div>
            <button onClick={() => { localStorage.setItem("ci102_visited", "1"); window.location.reload(); }} className="shrink-0 rounded bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30">閉じる</button>
          </div>
        </div>
      )}

      {/* Main */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
        {(prefError || muniError) && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-300">
            {prefError && <p>都道府県データ読込エラー: {prefError}</p>}
            {muniError && <p>市区町村データ読込エラー: {muniError}</p>}
          </div>
        )}
        {loading ? (
          <div className="space-y-6 py-6">
            <div className="text-center">
              <Skeleton className="h-10 w-80 mx-auto" />
              <Skeleton className="h-4 w-24 mx-auto mt-2" />
            </div>
            <KpiSkeletonGrid />
          </div>
        ) : !pref ? (
          <div className="text-center py-20 text-muted-foreground">データが見つかりません</div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap gap-0.5" aria-label="分析タブ">
              {/* ── メイン ── */}
              <TabsTrigger value="decision_hub" className="text-xs md:text-sm bg-emerald-50 data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-bold">
                <span className="md:hidden">🎯</span>
                <span className="hidden md:inline">🎯 投資判断</span>
              </TabsTrigger>
              <TabsTrigger value="custom_metro" className="text-xs md:text-sm">
                <span className="md:hidden">🌐</span>
                <span className="hidden md:inline">🌐 経済圏分析</span>
              </TabsTrigger>

              {/* ── セパレーター ── */}
              <span className="hidden md:inline self-center px-1 text-xs text-slate-400 select-none">|</span>

              {/* ── 詳細深掘り ── */}
              <TabsTrigger value="scorecard" className="text-xs md:text-sm">
                <span className="md:hidden">📋</span>
                <span className="hidden md:inline">📋 スコア</span>
              </TabsTrigger>
              <TabsTrigger value="lq" className="text-xs md:text-sm">
                <span className="md:hidden">🏭</span>
                <span className="hidden md:inline">🏭 経済基盤</span>
              </TabsTrigger>
              <TabsTrigger value="ebm" className="text-xs md:text-sm">
                <span className="md:hidden">📐</span>
                <span className="hidden md:inline">📐 需要予測</span>
              </TabsTrigger>
              {/* モバイル: 残りのタブはselectで切替 */}
              <div className="md:hidden">
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as TabValue)}
                  className="rounded border px-2 py-1.5 text-xs font-bold bg-white"
                >
                  <optgroup label="詳細分析">
                    <option value="shift">📊 競争力</option>
                    <option value="gap">🛒 小売市場</option>
                    <option value="demographics">👥 人口動態</option>
                    <option value="realestate">🏠 不動産取引</option>
                    <option value="map">🗺️ 地図</option>
                    <option value="risk">⚠️ 災害</option>
                    <option value="access">🚃 交通</option>
                    <option value="cross">📈 クロス</option>
                    <option value="metro">🏙️ 都市圏</option>
                    <option value="trade_area">📍 商圏</option>
                  </optgroup>
                </select>
              </div>
              {/* デスクトップ: 全タブ表示 */}
              <TabsTrigger value="shift" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">📊 競争力</span>
              </TabsTrigger>
              <TabsTrigger value="gap" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">🛒 小売市場</span>
              </TabsTrigger>
              <TabsTrigger value="demographics" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">👥 人口動態</span>
              </TabsTrigger>
              <TabsTrigger value="realestate" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">🏠 不動産取引</span>
              </TabsTrigger>
              <TabsTrigger value="map" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">🗺️ 地図</span>
              </TabsTrigger>
              <TabsTrigger value="risk" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">⚠️ 災害</span>
              </TabsTrigger>
              <TabsTrigger value="access" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">🚃 交通</span>
              </TabsTrigger>
              <TabsTrigger value="cross" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">📈 クロス</span>
              </TabsTrigger>
              <TabsTrigger value="metro" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">🏙️ 都市圏</span>
              </TabsTrigger>
              <TabsTrigger value="trade_area" className="text-xs md:text-sm hidden md:inline-flex">
                <span className="hidden md:inline">📍 商圏</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              {/* Tab 0: Scorecard */}
              <TabsContent value="scorecard">
                <ErrorBoundary>
                <ScorecardTab
                  pref={pref}
                  allData={allData}
                  scoreColor={scoreColor}
                  selectedCity={selectedCity}
                  municipalities={municipalities}
                  pfId={pfId} setPfId={setPfId}
                  pfData={pfData} pfLoading={pfLoading} fetchProformer={fetchProformer}
                  aiResult={aiResult} aiLoading={aiLoading} runAiAnalysis={runAiAnalysis}
                />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 1: LQ */}
              <TabsContent value="lq">
                <LearnLink chapter="ch1-lq" title="第1章: 特化係数（LQ）— どの産業が強い街か" />
                <EconZoneBanner codes={pageEconZoneCodes} label="産業別LQを経済圏合算で表示" />
                <ErrorBoundary>
                <LqTab
                  localEmp={econZoneEmployment?.local ?? Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={econZoneEmployment?.national ?? Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
                  localT0={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, 0])) : undefined}
                  localT1={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, r.actual_change])) : undefined}
                  nationalT0={undefined}
                  nationalT1={undefined}
                  selectedCity={selectedCity}
                  prefCode={prefCode}
                />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 2: EBM */}
              <TabsContent value="ebm">
                <LearnLink chapter="ch2-ebm" title="第2章: 経済基盤乗数（EBM）— 雇用が住宅需要に波及する仕組み" />
                <EconZoneBanner codes={pageEconZoneCodes} label="需要予測を経済圏合算で表示" />
                <ErrorBoundary>
                <EbmTab
                  localEmp={econZoneEmployment?.local ?? Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={econZoneEmployment?.national ?? Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
                  localEmpMid={econZoneEmployment?.local ?? (lqTableMid ? Object.fromEntries(lqTableMid.map((r) => [r.industry, r.local_emp])) : undefined)}
                  nationalEmpMid={econZoneEmployment?.national ?? (lqTableMid ? Object.fromEntries(lqTableMid.map((r) => [r.industry, r.national_emp])) : undefined)}
                  population={pref.population}
                  totalEmployment={pref.total_employment}
                  personsPerHousehold={pref.persons_per_household}
                  prefCode={prefCode}
                  selectedCity={selectedCity}
                />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 3: Shift-Share */}
              <TabsContent value="shift">
                <LearnLink chapter="ch4-shift" title="第4章: シフトシェア分析 — 全国トレンドvs地域の競争力" />
                <EconZoneBanner codes={pageEconZoneCodes} label="競争力分析（シフトシェアは都道府県レベル）" />
                <ErrorBoundary>
                {pref.shift_share_table.length > 0 ? (
                  <ShiftShareTab
                    precomputed={pref.shift_share_table}
                    precomputedMid={pref.shift_share_table_mid}
                    topRsIndustry={pref.top_rs_industry}
                    topRsValue={pref.top_rs_value}
                    topRsIndustryMid={pref.top_rs_industry_mid}
                    topRsValueMid={pref.top_rs_value_mid}
                    rsTotal={pref.rs_total}
                    rsTotalMid={pref.rs_total_mid}
                    selectedCity={selectedCity}
                  />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">シフトシェアデータがありません</div>
                )}
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 4: Gap */}
              <TabsContent value="gap">
                <LearnLink chapter="ch5-gap" title="第5章: 小売ギャップ分析 — 出店余地を見つける" />
                <EconZoneBanner codes={pageEconZoneCodes} label="小売ギャップ（都道府県レベル）" />
                <ErrorBoundary>
                <GapTab sectors={pref.gap_table.map((r) => ({ sector: r.sector, demand: r.demand, supply: r.supply }))} selectedCity={selectedCity} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 5: Real Estate */}
              <TabsContent value="realestate">
                <LearnLink chapter="ch7-spatial" title="第7章: 空間データ分析 — 地価・災害・交通の重ね合わせ" />
                <EconZoneBanner codes={pageEconZoneCodes} label="不動産取引（都道府県レベル）" />
                <ErrorBoundary>
                <RealEstateTab prefCode={prefCode} cityCode={cityCode ? Number(cityCode) : undefined} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 6: Map */}
              <TabsContent value="map">
                <ErrorBoundary>
                <MapTab
                  prefCode={prefCode}
                  prefName={pref.pref_name}
                  allData={allData}
                  onPrefClick={(c) => { setPrefCode(c); setCityCode(""); }}
                  onCityClick={(code) => setCityCode(code)}
                />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 7: Cross */}
              <TabsContent value="cross">
                <ErrorBoundary>
                <CrossTab areas={crossAreas} highlightPrefCode={prefCode} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 8: Disaster Risk */}
              <TabsContent value="risk">
                <ErrorBoundary>
                <RiskTab prefCode={prefCode} prefName={pref.pref_name} pref={pref} allData={allData} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 9: Accessibility */}
              <TabsContent value="access">
                <ErrorBoundary>
                <AccessibilityTab prefCode={prefCode} prefName={pref.pref_name} pref={pref} allData={allData} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 10: Demographics */}
              <TabsContent value="demographics">
                <LearnLink chapter="ch3-per" title="第3章: 人口雇用比率（PER）— 雇用増が人口にどう波及するか" />
                <EconZoneBanner codes={pageEconZoneCodes} label="人口動態（都道府県レベル）" />
                <ErrorBoundary>
                <DemographicsTab prefCode={prefCode} prefName={pref.pref_name} pref={pref} allData={allData} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 11: Metropolitan Area (MSA相当) */}
              <TabsContent value="metro">
                <ErrorBoundary>
                <MetroTab />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 12: Custom Metro (複数市区町村合算) */}
              <TabsContent value="custom_metro">
                <ErrorBoundary>
                <CustomMetroTab />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 13: Trade Area (住所→商圏分析) */}
              <TabsContent value="trade_area">
                <ErrorBoundary>
                <TradeAreaTab />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 14: Decision Hub (統合判断) */}
              <TabsContent value="decision_hub">
                {/* エリアランキングTOP3 */}
                {allData && (() => {
                  const DCLASS: Record<string, number> = { growth: 85, resilient: 70, outperform_decline: 55, decline: 38, severe_decline: 20 };
                  const ranked = Object.values(allData).map((p) => {
                    const c2 = p.census2025;
                    const d = Math.min(100, (DCLASS[c2?.momentum_class ?? "decline"] ?? 40) + Math.min(10, (p.num_leakage_sectors ?? 0) * 3));
                    const e = p.ebm_mid ?? p.ebm ?? 0;
                    const s = e >= 3 && e <= 6 ? 100 : e >= 2 && e <= 8 ? 75 : 55;
                    const rs = p.rs_total_mid ?? p.rs_total ?? 0;
                    const te = p.total_employment ?? 1;
                    const gap = c2?.momentum_gap ?? 0;
                    const pp = p.pop_projection;
                    const dp = pp?.["2035"] && pp?.["2025"] ? ((pp["2035"] - pp["2025"]) / pp["2025"]) * 100 : 0;
                    const f = Math.round(Math.max(0, Math.min(100, 50 + gap * 4 + (rs / te) * 800 + dp * 1.2)));
                    const ov = Math.round(0.4 * d + 0.3 * s + 0.3 * f);
                    return { name: p.pref_name, code: p.pref_code, overall: ov, demand: d, supply: s, future: f };
                  }).sort((a, b) => b.overall - a.overall);
                  const top3 = ranked.slice(0, 3);
                  return (
                    <details className="mb-4">
                      <summary className="text-sm font-bold cursor-pointer hover:underline">📊 全国エリアランキング TOP3（クリックで表示）</summary>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                        {top3.map((r, i) => (
                          <button key={r.code} onClick={() => setPrefCode(r.code)} className="rounded-lg border-2 p-3 text-left hover:bg-slate-50 transition-colors" style={{ borderColor: i === 0 ? "#D4A843" : "#E2E8F0" }}>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-black">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                              <span className="text-sm font-bold">{r.name}</span>
                              <span className="ml-auto text-lg font-black text-emerald-600">{r.overall}</span>
                            </div>
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                              <span>需要 {r.demand}</span>
                              <span>基盤 {r.supply}</span>
                              <span>将来 {r.future}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </details>
                  );
                })()}
                <ErrorBoundary>
                <DecisionHubTab pref={pref} selectedCity={selectedCity} prefCode={prefCode} municipalities={municipalities} initialZoneCodes={initialZone} centerCode={centerCode} onZoneChange={setPageEconZoneCodes} />

                {/* マルチエリア比較 */}
                {allData && (() => {
                  const DCLASS: Record<string, number> = { growth: 85, resilient: 70, outperform_decline: 55, decline: 38, severe_decline: 20 };
                  const calcScore = (p: PrefectureData) => {
                    const c2 = p.census2025;
                    const d = Math.min(100, (DCLASS[c2?.momentum_class ?? "decline"] ?? 40) + Math.min(10, (p.num_leakage_sectors ?? 0) * 3));
                    const e = p.ebm_mid ?? p.ebm ?? 0;
                    const s = e >= 3 && e <= 6 ? 100 : e >= 2 && e <= 8 ? 75 : 55;
                    const rs = p.rs_total_mid ?? p.rs_total ?? 0;
                    const te = p.total_employment ?? 1;
                    const gap = c2?.momentum_gap ?? 0;
                    const pp = p.pop_projection;
                    const dp = pp?.["2035"] && pp?.["2025"] ? ((pp["2035"] - pp["2025"]) / pp["2025"]) * 100 : 0;
                    const f = Math.round(Math.max(0, Math.min(100, 50 + gap * 4 + (rs / te) * 800 + dp * 1.2)));
                    const ov = Math.round(0.4 * d + 0.3 * s + 0.3 * f);
                    const stance = ov >= 70 ? "積極取得" : ov >= 55 ? "選別取得" : ov >= 40 ? "様子見" : "見送り";
                    return { name: p.pref_name, code: p.pref_code, overall: ov, demand: d, supply: s, future: f, stance,
                      ebm: (p.ebm_mid ?? p.ebm ?? 0).toFixed(1),
                      popPct: c2?.pop_change_pct?.toFixed(1) ?? "—",
                      rentedPct: p.housing_tenure?.rented_pct?.toFixed(0) ?? "—",
                    };
                  };
                  const [compareCodes, setCompareCodes] = useState<number[]>([]);
                  const compareData = compareCodes.map(c => allData[String(c)] ? calcScore(allData[String(c)]) : null).filter(Boolean);
                  const currentScore = calcScore(pref);

                  return (
                    <div className="mt-6 rounded-xl border-2 border-slate-200 p-4">
                      <h3 className="text-sm font-bold mb-2">エリア比較</h3>
                      <div className="flex gap-2 items-center flex-wrap mb-3">
                        <span className="text-xs text-muted-foreground">比較する都道府県を追加:</span>
                        <select
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v && !compareCodes.includes(v) && v !== prefCode && compareCodes.length < 3) {
                              setCompareCodes([...compareCodes, v]);
                            }
                          }}
                          value=""
                          className="rounded border px-2 py-1 text-xs"
                        >
                          <option value="">選択...</option>
                          {Object.entries(PREFECTURES).filter(([c]) => Number(c) !== prefCode && !compareCodes.includes(Number(c))).map(([c, n]) => (
                            <option key={c} value={c}>{n}</option>
                          ))}
                        </select>
                        {compareCodes.length > 0 && (
                          <button onClick={() => setCompareCodes([])} className="text-xs text-red-600 hover:underline">クリア</button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {[currentScore, ...compareData].map((s, i) => s && (
                          <div key={s.code} className={`rounded-lg border p-3 ${i === 0 ? "border-blue-300 bg-blue-50" : ""}`}>
                            <p className="text-sm font-bold">{s.name} {i === 0 && <span className="text-xs text-blue-600">（現在）</span>}</p>
                            <p className="text-2xl font-black mt-1" style={{ color: s.overall >= 70 ? "#16A34A" : s.overall >= 50 ? "#CA8A04" : "#DC2626" }}>{s.overall}<span className="text-xs text-muted-foreground">/100</span></p>
                            <p className="text-xs font-bold" style={{ color: s.overall >= 70 ? "#16A34A" : s.overall >= 50 ? "#CA8A04" : "#DC2626" }}>{s.stance}</p>
                            <div className="mt-2 space-y-1 text-xs">
                              <div className="flex justify-between"><span>需要</span><span className="font-bold">{s.demand}</span></div>
                              <div className="flex justify-between"><span>経済基盤</span><span className="font-bold">{s.supply}</span></div>
                              <div className="flex justify-between"><span>将来性</span><span className="font-bold">{s.future}</span></div>
                              <div className="flex justify-between"><span>EBM</span><span className="font-bold">{s.ebm}</span></div>
                              <div className="flex justify-between"><span>人口変化</span><span className="font-bold">{s.popPct}%</span></div>
                              <div className="flex justify-between"><span>借家率</span><span className="font-bold">{s.rentedPct}%</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                </ErrorBoundary>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>

      <footer className="border-t mt-auto px-4 py-3 md:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground text-center sm:text-left">
            <p>
              分析手法: 経済基盤分析（LQ/EBM/PER）、シフトシェア分析、ギャップ分析 |
              データ: e-Stat 経済センサス / 国勢調査 / MLIT 不動産情報ライブラリ / NLNI 国土数値情報
            </p>
            <div>
              <DataVintageBadge variant="compact" />
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <a href="/compare" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">
              地域比較 &rarr;
            </a>
            <a href="/learn" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">
              分析手法を学ぶ &rarr;
            </a>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="text-xs text-slate-500 hover:underline whitespace-nowrap"
              title="ログアウト"
            >
              ログアウト
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
