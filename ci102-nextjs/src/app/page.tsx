"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { ClientTip, RiskAlert } from "@/components/ui/callouts";
import { PREFECTURES } from "@/lib/codes";
import { usePrefectureData, type PrefectureData } from "@/lib/use-prefecture-data";
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

  // Semi-circle gauge using stroke-dasharray on a <circle>.
  // This avoids arc-endpoint math entirely.
  const cx = 100, cy = 95, r = 75;
  const circumference = 2 * Math.PI * r;
  const halfCircumference = circumference / 2;
  // Offset to start from left (9 o'clock) going clockwise to right (3 o'clock)
  const dashOffset = circumference * 0.25; // rotate start to bottom-left
  const scoreDash = halfCircumference * (pct / 100);

  return (
    <div className="flex flex-col items-center">
      <svg width={200} height={115} viewBox="0 0 200 115">
        {/* Background semi-circle (grey) */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none" stroke="#e5e7eb" strokeWidth={14} strokeLinecap="round"
          strokeDasharray={`${halfCircumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          className="dark:stroke-gray-700"
        />
        {/* Score arc (colored) */}
        {pct > 0 && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
            strokeDasharray={`${scoreDash} ${circumference}`}
            strokeDashoffset={dashOffset}
          />
        )}
        {/* Zone labels */}
        <text x="15" y="108" className="fill-muted-foreground text-[8px]">要注意</text>
        <text x="65" y="22" className="fill-muted-foreground text-[8px]">標準</text>
        <text x="120" y="22" className="fill-muted-foreground text-[8px]">良好</text>
        <text x="168" y="108" className="fill-muted-foreground text-[8px]">優良</text>
        {/* Score number */}
        <text x={cx} y="82" textAnchor="middle" className="text-3xl font-bold" style={{ fill: color }}>
          {Math.round(score)}
        </text>
        <text x={cx} y="100" textAnchor="middle" className="fill-muted-foreground text-[10px]">
          / 100
        </text>
      </svg>
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
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>最低 {min.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        <span>中央値 {median.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
        <span>最高 {max.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scorecard Radar Chart                                              */
/* ------------------------------------------------------------------ */

function ScorecardRadar({ pref, allData }: { pref: PrefectureData; allData: Record<string, PrefectureData> | null }) {
  const allPrefs = allData ? Object.values(allData) : [];

  // Normalize each sub-score to 0-100 using min-max across all prefs
  function norm(val: number, getter: (p: PrefectureData) => number): number {
    const vals = allPrefs.map(getter);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === min) return 50;
    return ((val - min) / (max - min)) * 100;
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
      <p className="text-[10px] text-muted-foreground text-center">
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

function MunicipalityDetail({ city, municipalities, prefName }: {
  city: MunicipalityData;
  municipalities: MunicipalityData[];
  prefName: string;
}) {
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard title="総雇用" value={city.total_emp.toLocaleString()} />
        <KpiCard title="基盤雇用" value={Math.round(city.basic_emp).toLocaleString()} />
        <KpiCard title="基盤雇用比率" value={`${city.basic_ratio.toFixed(1)}%`} />
        <KpiCard title="最大LQ産業" value={`${city.max_lq.toFixed(2)}`} subtitle={city.max_lq_industry} />
        <KpiCard title="基盤産業数" value={String(city.num_basic)} />
      </div>

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

  const scoreLabel = pref.suitability_score.total_score >= 80 ? "優良"
    : pref.suitability_score.total_score >= 60 ? "良好"
    : pref.suitability_score.total_score >= 40 ? "標準"
    : "要注意";

  return (
    <div className="space-y-6">
      {/* ---- Score Header: Gauge + Radar + Benchmarks ---- */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Gauge + KPI cards */}
        <div className="space-y-4">
          <Card className="text-center p-4">
            <ScoreGauge score={pref.suitability_score.total_score} label={`${scoreLabel} — ${pref.pref_name}`} />
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <KpiCard title="EBM" value={pref.ebm.toFixed(2)} subtitle="経済基盤乗数" tooltip="基盤雇用1人が支える総雇用数。値が大きいほど波及効果が大きい" />
            <KpiCard title="PER" value={pref.per.toFixed(2)} subtitle="人口雇用比率" tooltip="就業者1人あたりの総人口。住戸需要の推計に使用" />
            <KpiCard title="RS合計" value={pref.rs_total.toLocaleString()} trend={pref.rs_total > 0 ? "up" : pref.rs_total < 0 ? "down" : "flat"} tooltip="地域シフト合計。正=全国を上回る競争力、負=劣位" />
            <KpiCard title="漏損/余剰" value={pref.aggregate_gap_factor.toFixed(1)} tooltip="小売購買力の流出入度合い。正=漏損(出店機会)、負=余剰(供給過多)" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <KpiCard title="基盤雇用比率" value={`${pref.basic_ratio.toFixed(1)}%`} tooltip="LQ>1.0の産業の超過雇用が総雇用に占める割合" />
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

      {/* ---- Municipality data (enhanced) ---- */}
      {selectedCity && (
        <>
          <Separator />
          <MunicipalityDetail city={selectedCity} municipalities={municipalities} prefName={pref.pref_name} />
        </>
      )}

      <Separator />

      {/* ---- Narrative + Top Industries ---- */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        <NarrativePanel narrative={narrative} />

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">基盤産業 TOP 5</h3>
            <div className="space-y-2">
              {pref.top_lq_industries.map((r, i) => (
                <div key={r.industry} className="flex justify-between items-center rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#2A9D8F]/10 text-[#2A9D8F] text-[10px] font-bold">{i + 1}</span>
                    <span className="text-xs font-medium">{r.industry}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#2A9D8F]">LQ {r.lq.toFixed(2)}</span>
                    <p className="text-[10px] text-muted-foreground">基盤 {Math.round(r.basic_emp_estimate).toLocaleString()}人</p>
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

const VALID_TABS = ["scorecard", "lq", "ebm", "shift", "gap", "realestate", "map", "cross"] as const;
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
    return isValidPrefCode(p) ? p : 13;
  });
  const [cityCode, setCityCode] = useState<string>(() => searchParams.get("city") ?? "");
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    const t = searchParams.get("tab");
    return isValidTab(t) ? t : "scorecard";
  });

  // Sync state -> URL (replaceState, no history entry)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("pref", String(prefCode));
    if (cityCode) params.set("city", cityCode);
    if (activeTab !== "scorecard") params.set("tab", activeTab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [prefCode, cityCode, activeTab, router]);
  const { data: pref, allData, loading, error: prefError } = usePrefectureData(prefCode);
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
            <h1 className="text-lg font-bold tracking-tight md:text-xl">CI102 不動産市場分析ダッシュボード</h1>
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
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap" aria-label="分析タブ">
              <TabsTrigger value="scorecard" className="text-xs md:text-sm">
                <span className="md:hidden">⓪</span>
                <span className="hidden md:inline">⓪ スコアカード</span>
              </TabsTrigger>
              <TabsTrigger value="lq" className="text-xs md:text-sm">
                <span className="md:hidden">①</span>
                <span className="hidden md:inline">① 経済基盤</span>
              </TabsTrigger>
              <TabsTrigger value="ebm" className="text-xs md:text-sm">
                <span className="md:hidden">②</span>
                <span className="hidden md:inline">② 需要予測</span>
              </TabsTrigger>
              <TabsTrigger value="shift" className="text-xs md:text-sm">
                <span className="md:hidden">③</span>
                <span className="hidden md:inline">③ シフトシェア</span>
              </TabsTrigger>
              <TabsTrigger value="gap" className="text-xs md:text-sm">
                <span className="md:hidden">④</span>
                <span className="hidden md:inline">④ 小売市場</span>
              </TabsTrigger>
              <TabsTrigger value="realestate" className="text-xs md:text-sm">
                <span className="md:hidden">⑤</span>
                <span className="hidden md:inline">⑤ 不動産取引</span>
              </TabsTrigger>
              <TabsTrigger value="map" className="text-xs md:text-sm">
                <span className="md:hidden">⑥</span>
                <span className="hidden md:inline">⑥ 地図分析</span>
              </TabsTrigger>
              <TabsTrigger value="cross" className="text-xs md:text-sm">
                <span className="md:hidden">⑦</span>
                <span className="hidden md:inline">⑦ クロス分析</span>
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
                <ErrorBoundary>
                <LqTab
                  localEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
                  localT0={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, 0])) : undefined}
                  localT1={pref.shift_share_table.length > 0 ? Object.fromEntries(pref.shift_share_table.map((r) => [r.industry, r.actual_change])) : undefined}
                  nationalT0={undefined}
                  nationalT1={undefined}
                  selectedCity={selectedCity}
                />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 2: EBM */}
              <TabsContent value="ebm">
                <ErrorBoundary>
                <EbmTab
                  localEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.local_emp]))}
                  nationalEmp={Object.fromEntries(pref.lq_table.map((r) => [r.industry, r.national_emp]))}
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
                <ErrorBoundary>
                {pref.shift_share_table.length > 0 ? (
                  <ShiftShareTab precomputed={pref.shift_share_table} selectedCity={selectedCity} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">シフトシェアデータがありません</div>
                )}
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 4: Gap */}
              <TabsContent value="gap">
                <ErrorBoundary>
                <GapTab sectors={pref.gap_table.map((r) => ({ sector: r.sector, demand: r.demand, supply: r.supply }))} selectedCity={selectedCity} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 5: Real Estate */}
              <TabsContent value="realestate">
                <ErrorBoundary>
                <RealEstateTab prefCode={prefCode} cityCode={cityCode ? Number(cityCode) : undefined} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 6: Map */}
              <TabsContent value="map">
                <ErrorBoundary>
                <MapTab prefCode={prefCode} prefName={pref.pref_name} allData={allData} />
                </ErrorBoundary>
              </TabsContent>

              {/* Tab 7: Cross */}
              <TabsContent value="cross">
                <ErrorBoundary>
                <CrossTab areas={crossAreas} highlightPrefCode={prefCode} />
                </ErrorBoundary>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </main>

      <footer className="border-t mt-auto px-4 py-3 md:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            分析手法: 経済基盤分析（LQ/EBM/PER）、シフトシェア分析、ギャップ分析 |
            データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ
          </p>
          <div className="flex gap-4">
            <a href="/compare" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">
              地域比較 &rarr;
            </a>
            <a href="/learn" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">
              分析手法を学ぶ &rarr;
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
