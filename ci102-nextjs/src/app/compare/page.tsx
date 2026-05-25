"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceArea, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PREFECTURES } from "@/lib/codes";
import { usePrefectureData, type PrefectureData } from "@/lib/use-prefecture-data";

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const COMPARE_COLORS = ["#2A9D8F", "#D4A843", "#E76F51", "#3B82F6"] as const;
const MAX_PREFS = 4;

/* ================================================================== */
/*  Preset Definitions (CI102-based investment purpose weighting)      */
/* ================================================================== */

interface PresetConfig {
  id: string;
  label: string;
  description: string;
  weights: {
    ebm: number;
    basic_ratio: number;
    rs: number;
    gap: number;
    scale: number;
    pop_trend: number;
    access: number;
    risk: number;
  };
  kpiHighlight: string[]; // Which KPI rows to emphasize
}

const PRESETS: PresetConfig[] = [
  {
    id: "residential",
    label: "住居系投資",
    description: "マンション・アパート開発向け。人口動態・世帯需要・車依存度を重視",
    weights: { ebm: 0.10, basic_ratio: 0.05, rs: 0.10, gap: 0.10, scale: 0.05, pop_trend: 0.30, access: 0.15, risk: 0.15 },
    kpiHighlight: ["人口変動率", "PER", "浸水リスク", "車依存度"],
  },
  {
    id: "commercial",
    label: "商業系投資",
    description: "店舗・SC開発向け。乗降客数・商業密度・Gap係数を重視",
    weights: { ebm: 0.10, basic_ratio: 0.10, rs: 0.15, gap: 0.25, scale: 0.10, pop_trend: 0.05, access: 0.20, risk: 0.05 },
    kpiHighlight: ["ギャップ係数", "交通利用密度", "商業密度", "RS合計"],
  },
  {
    id: "office",
    label: "オフィス投資",
    description: "オフィスビル向け。EBM・基盤雇用・昼間人口・競争力を重視",
    weights: { ebm: 0.25, basic_ratio: 0.20, rs: 0.20, gap: 0.10, scale: 0.15, pop_trend: 0.05, access: 0.05, risk: 0.00 },
    kpiHighlight: ["EBM", "基盤雇用比率", "RS合計", "昼間人口比"],
  },
  {
    id: "defensive",
    label: "リスク回避型",
    description: "ディフェンシブ投資。災害リスク・人口減少・インフラ脆弱性を重視",
    weights: { ebm: 0.05, basic_ratio: 0.05, rs: 0.05, gap: 0.05, scale: 0.10, pop_trend: 0.25, access: 0.15, risk: 0.30 },
    kpiHighlight: ["浸水リスク", "人口変動率", "交通利用密度", "投資スコア"],
  },
];

/* ================================================================== */
/*  Utility Functions                                                  */
/* ================================================================== */

function fmt(v: number | null | undefined, decimals = 0): string {
  if (v == null) return "-";
  if (decimals === 0) return v.toLocaleString();
  return v.toFixed(decimals);
}

function fmtYen(v: number | null | undefined): string {
  if (v == null) return "-";
  return `\u00A5${v.toLocaleString()}`;
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "-";
  return `${v.toFixed(decimals)}%`;
}

function fmtSign(v: number | null | undefined, decimals = 0): string {
  if (v == null) return "-";
  const prefix = v > 0 ? "+" : "";
  if (decimals === 0) return `${prefix}${v.toLocaleString()}`;
  return `${prefix}${v.toFixed(decimals)}`;
}

/* Normalization */
function minMax(all: PrefectureData[], getter: (p: PrefectureData) => number): { min: number; max: number } {
  const vals = all.map(getter).filter((v) => Number.isFinite(v));
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

/* Percentile rank (1-based) */
function percentileRank(value: number, allValues: number[]): number {
  const sorted = [...allValues].sort((a, b) => a - b);
  const idx = sorted.findIndex((v) => v >= value);
  return Math.round(((sorted.length - idx) / sorted.length) * 100);
}

/* Cell coloring for best/worst */
type Direction = "high" | "low" | "abs-low";

function cellColor(values: (number | null)[], idx: number, direction: Direction): string {
  const valid = values.filter((v) => v != null) as number[];
  if (valid.length < 2) return "";
  const val = values[idx];
  if (val == null) return "";
  let best: number;
  let worst: number;
  if (direction === "high") { best = Math.max(...valid); worst = Math.min(...valid); }
  else if (direction === "low") { best = Math.min(...valid); worst = Math.max(...valid); }
  else { const sorted = [...valid].sort((a, b) => Math.abs(a) - Math.abs(b)); best = sorted[0]; worst = sorted[sorted.length - 1]; }
  if (val === best) return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200";
  if (val === worst) return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200";
  return "";
}

/* Grade letter from score */
function gradeLetter(score: number): { letter: string; color: string } {
  if (score >= 90) return { letter: "A+", color: "text-green-700" };
  if (score >= 80) return { letter: "A", color: "text-green-600" };
  if (score >= 70) return { letter: "A-", color: "text-green-500" };
  if (score >= 60) return { letter: "B+", color: "text-blue-600" };
  if (score >= 50) return { letter: "B", color: "text-blue-500" };
  if (score >= 40) return { letter: "B-", color: "text-amber-600" };
  if (score >= 30) return { letter: "C+", color: "text-amber-500" };
  if (score >= 20) return { letter: "C", color: "text-red-500" };
  return { letter: "D", color: "text-red-600" };
}

/* Purpose-weighted score calculation */
function computePresetScore(pref: PrefectureData, preset: PresetConfig, allPrefs: PrefectureData[]): number {
  const ranges = {
    ebm: minMax(allPrefs, (p) => p.ebm),
    basic_ratio: minMax(allPrefs, (p) => p.basic_ratio),
    rs: minMax(allPrefs, (p) => p.rs_total),
    gap: minMax(allPrefs, (p) => p.aggregate_gap_factor),
    scale: minMax(allPrefs, (p) => p.total_employment),
    pop_trend: minMax(allPrefs, (p) => p.pop_change_pct ?? 0),
    access: minMax(allPrefs, (p) => (p.total_daily_riders ?? 0) / Math.max(p.population, 1) * 100),
    risk: minMax(allPrefs, (p) => 100 - (p.flood_risk_avg_pct ?? 0)), // Inverted: lower risk = higher score
  };

  const w = preset.weights;
  const score =
    w.ebm * normalize(pref.ebm, ranges.ebm.min, ranges.ebm.max) +
    w.basic_ratio * normalize(pref.basic_ratio, ranges.basic_ratio.min, ranges.basic_ratio.max) +
    w.rs * normalize(pref.rs_total, ranges.rs.min, ranges.rs.max) +
    w.gap * normalize(pref.aggregate_gap_factor, ranges.gap.min, ranges.gap.max) +
    w.scale * normalize(pref.total_employment, ranges.scale.min, ranges.scale.max) +
    w.pop_trend * normalize(pref.pop_change_pct ?? 0, ranges.pop_trend.min, ranges.pop_trend.max) +
    w.access * normalize((pref.total_daily_riders ?? 0) / Math.max(pref.population, 1) * 100, ranges.access.min, ranges.access.max) +
    w.risk * normalize(100 - (pref.flood_risk_avg_pct ?? 0), ranges.risk.min, ranges.risk.max);

  return Math.round(score * 10) / 10;
}

/* ================================================================== */
/*  Prefecture Selector                                               */
/* ================================================================== */

function PrefectureSelector({ selected, onToggle }: { selected: number[]; onToggle: (code: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map((code, i) => (
          <Badge key={code} style={{ backgroundColor: COMPARE_COLORS[i], color: "white" }} className="cursor-pointer text-sm px-3 py-1" onClick={() => onToggle(code)}>
            {PREFECTURES[code]} &times;
          </Badge>
        ))}
        {selected.length === 0 && <span className="text-sm text-muted-foreground">都道府県を選択してください（最大{MAX_PREFS}つ）</span>}
      </div>
      <button onClick={() => setOpen(!open)} className="rounded bg-white dark:bg-gray-800 border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        {open ? "閉じる" : "都道府県を選択"}
      </button>
      {open && (
        <div className="mt-2 p-3 border rounded-lg bg-white dark:bg-gray-800 shadow-lg max-h-64 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
          {Object.entries(PREFECTURES).map(([code, name]) => {
            const c = Number(code);
            const isSelected = selected.includes(c);
            const disabled = !isSelected && selected.length >= MAX_PREFS;
            return (
              <label key={c} className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${isSelected ? "bg-blue-100 dark:bg-blue-900/40 font-semibold" : disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                <input type="checkbox" checked={isSelected} disabled={disabled} onChange={() => onToggle(c)} className="w-3 h-3" />
                {name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Preset Selector                                                    */
/* ================================================================== */

function PresetSelector({ activePreset, onSelect }: { activePreset: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`rounded-lg border p-3 text-left transition-all ${
            activePreset === p.id
              ? "border-[#2A9D8F] bg-[#2A9D8F]/5 ring-1 ring-[#2A9D8F]"
              : "border-gray-200 dark:border-gray-700 hover:border-gray-400"
          }`}
        >
          <p className={`text-sm font-semibold ${activePreset === p.id ? "text-[#2A9D8F]" : ""}`}>{p.label}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
        </button>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Investment Scorecard (per prefecture)                               */
/* ================================================================== */

function InvestmentScorecard({
  pref,
  allPrefs,
  preset,
  color,
}: {
  pref: PrefectureData;
  allPrefs: PrefectureData[];
  preset: PresetConfig;
  color: string;
}) {
  const score = computePresetScore(pref, preset, allPrefs);
  const grade = gradeLetter(score);

  // Sub-scores for breakdown
  const allPop = allPrefs.map((p) => p.pop_change_pct ?? 0).filter(Number.isFinite);
  const allAccess = allPrefs.map((p) => (p.total_daily_riders ?? 0) / Math.max(p.population, 1) * 100);
  const allRisk = allPrefs.map((p) => p.flood_risk_avg_pct ?? 0);

  const popRank = percentileRank(pref.pop_change_pct ?? 0, allPop);
  const accessRank = percentileRank((pref.total_daily_riders ?? 0) / Math.max(pref.population, 1) * 100, allAccess);
  const riskRank = percentileRank(-(pref.flood_risk_avg_pct ?? 0), allRisk.map((v) => -v)); // invert for "low is good"

  const categories = [
    { label: "経済基盤", value: normalize(pref.ebm, minMax(allPrefs, (p) => p.ebm).min, minMax(allPrefs, (p) => p.ebm).max) },
    { label: "競争力", value: normalize(pref.rs_total, minMax(allPrefs, (p) => p.rs_total).min, minMax(allPrefs, (p) => p.rs_total).max) },
    { label: "市場均衡", value: normalize(pref.aggregate_gap_factor, minMax(allPrefs, (p) => p.aggregate_gap_factor).min, minMax(allPrefs, (p) => p.aggregate_gap_factor).max) },
    { label: "リスク", value: normalize(100 - (pref.flood_risk_avg_pct ?? 0), minMax(allPrefs, (p) => 100 - (p.flood_risk_avg_pct ?? 0)).min, minMax(allPrefs, (p) => 100 - (p.flood_risk_avg_pct ?? 0)).max) },
    { label: "アクセス", value: normalize((pref.total_daily_riders ?? 0) / Math.max(pref.population, 1) * 100, minMax(allPrefs, (p) => (p.total_daily_riders ?? 0) / Math.max(p.population, 1) * 100).min, minMax(allPrefs, (p) => (p.total_daily_riders ?? 0) / Math.max(p.population, 1) * 100).max) },
    { label: "人口", value: normalize(pref.pop_change_pct ?? 0, minMax(allPrefs, (p) => p.pop_change_pct ?? 0).min, minMax(allPrefs, (p) => p.pop_change_pct ?? 0).max) },
  ];

  const verdict = score >= 70 ? "投資推奨" : score >= 50 ? "条件付き可" : score >= 30 ? "慎重検討" : "回避推奨";
  const verdictColor = score >= 70 ? "text-green-700 bg-green-50" : score >= 50 ? "text-blue-700 bg-blue-50" : score >= 30 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";

  return (
    <div className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: color }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold" style={{ color }}>{pref.pref_name}</p>
          <p className="text-[10px] text-muted-foreground">{preset.label}向け評価</p>
        </div>
        <div className="text-center">
          <p className={`text-3xl font-black ${grade.color}`}>{grade.letter}</p>
          <p className="text-xs text-muted-foreground">{score.toFixed(0)}/100</p>
        </div>
      </div>

      {/* Category bars */}
      <div className="space-y-1.5">
        {categories.map((cat) => {
          const g = gradeLetter(cat.value);
          return (
            <div key={cat.label} className="flex items-center gap-2">
              <span className="text-[10px] w-12 text-right text-muted-foreground">{cat.label}</span>
              <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(3, cat.value)}%`, backgroundColor: color, opacity: 0.7 }} />
              </div>
              <span className={`text-[10px] font-bold w-5 ${g.color}`}>{g.letter}</span>
            </div>
          );
        })}
      </div>

      {/* Verdict */}
      <div className={`rounded-lg px-3 py-2 text-center ${verdictColor}`}>
        <p className="text-sm font-bold">{verdict}</p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
        <div>
          <p className="text-muted-foreground">人口Top%</p>
          <p className="font-bold">{popRank}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">アクセスTop%</p>
          <p className="font-bold">{accessRank}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">安全性Top%</p>
          <p className="font-bold">{riskRank}%</p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  KPI Comparison Table (with median + percentile rank)               */
/* ================================================================== */

interface KpiRow {
  label: string;
  getter: (p: PrefectureData) => number | null;
  format: (v: number | null) => string;
  direction: Direction;
}

const KPI_ROWS: KpiRow[] = [
  { label: "EBM", getter: (p) => p.ebm, format: (v) => fmt(v, 2), direction: "high" },
  { label: "PER", getter: (p) => p.per, format: (v) => fmt(v, 2), direction: "low" },
  { label: "基盤雇用比率", getter: (p) => p.basic_ratio, format: (v) => fmtPct(v), direction: "high" },
  { label: "RS合計", getter: (p) => p.rs_total, format: (v) => fmtSign(v), direction: "high" },
  { label: "ギャップ係数", getter: (p) => p.aggregate_gap_factor, format: (v) => fmtSign(v, 1), direction: "high" },
  { label: "投資スコア", getter: (p) => p.suitability_score.total_score, format: (v) => fmt(v), direction: "high" },
  { label: "中央m2単価", getter: (p) => p.median_unit_price, format: (v) => fmtYen(v), direction: "low" },
  { label: "実績雇用変化", getter: (p) => p.actual_emp_change, format: (v) => fmtSign(v), direction: "high" },
  { label: "昼間人口比", getter: (p) => p.population > 0 ? Math.round(p.daytime_population / p.population * 100) : null, format: (v) => v != null ? `${v}%` : "-", direction: "high" },
  { label: "人口変動率", getter: (p) => p.pop_change_pct ?? null, format: (v) => fmtSign(v, 1), direction: "high" },
  { label: "交通利用密度", getter: (p) => p.total_daily_riders != null && p.population > 0 ? Math.round(p.total_daily_riders / p.population * 100) : null, format: (v) => v != null ? `${v}%` : "-", direction: "high" },
  { label: "浸水リスク", getter: (p) => p.flood_risk_avg_pct ?? null, format: (v) => v != null ? `${v.toFixed(1)}%` : "-", direction: "low" },
  { label: "商業密度", getter: (p) => p.num_commercial != null && p.population > 0 ? Math.round(p.num_commercial / p.population * 10000 * 10) / 10 : null, format: (v) => v != null ? `${v}` : "-", direction: "high" },
];

function KpiTable({ prefs, allPrefs, highlightLabels }: { prefs: PrefectureData[]; allPrefs: PrefectureData[]; highlightLabels: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">KPI比較テーブル</CardTitle>
        <p className="text-xs text-muted-foreground">緑=選択中で最良、赤=選択中で最悪。右端に全国中央値と順位を表示</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-semibold text-muted-foreground">指標</th>
                {prefs.map((p, i) => (
                  <th key={p.pref_code} className="text-right py-2 px-2 font-semibold" style={{ color: COMPARE_COLORS[i] }}>
                    {p.pref_name}
                  </th>
                ))}
                <th className="text-right py-2 px-2 font-semibold text-gray-400 border-l">中央値</th>
              </tr>
            </thead>
            <tbody>
              {KPI_ROWS.map((row) => {
                const values = prefs.map((p) => row.getter(p));
                const allValues = allPrefs.map((p) => row.getter(p)).filter((v) => v != null) as number[];
                const sorted = [...allValues].sort((a, b) => a - b);
                const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
                const isHighlighted = highlightLabels.includes(row.label);

                return (
                  <tr key={row.label} className={`border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isHighlighted ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}>
                    <td className={`py-2 px-2 font-medium ${isHighlighted ? "text-blue-700 dark:text-blue-300" : ""}`}>
                      {row.label}
                      {isHighlighted && <span className="ml-1 text-[9px] text-blue-500">*</span>}
                    </td>
                    {prefs.map((p, i) => {
                      const val = values[i];
                      const rank = val != null ? (row.direction === "high"
                        ? allValues.filter((v) => v > val).length + 1
                        : allValues.filter((v) => v < val).length + 1) : null;
                      return (
                        <td key={p.pref_code} className={`text-right py-2 px-2 font-mono tabular-nums ${cellColor(values, i, row.direction)}`}>
                          <span>{row.format(val)}</span>
                          {rank != null && (
                            <span className="text-[9px] text-muted-foreground ml-1">({rank}位)</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right py-2 px-2 font-mono tabular-nums text-gray-400 border-l">
                      {row.format(median)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Radar Chart                                                        */
/* ================================================================== */

const RADAR_AXES = [
  { key: "ebm", label: "EBM", getter: (p: PrefectureData) => p.ebm },
  { key: "basic_ratio", label: "基盤比率", getter: (p: PrefectureData) => p.basic_ratio },
  { key: "rs", label: "RS", getter: (p: PrefectureData) => p.rs_total },
  { key: "gap", label: "ギャップ", getter: (p: PrefectureData) => p.aggregate_gap_factor },
  { key: "pop", label: "人口動態", getter: (p: PrefectureData) => p.pop_change_pct ?? 0 },
  { key: "access", label: "アクセス", getter: (p: PrefectureData) => (p.total_daily_riders ?? 0) / Math.max(p.population, 1) * 100 },
] as const;

function RadarSection({ prefs, allData }: { prefs: PrefectureData[]; allData: Record<string, PrefectureData> }) {
  const allPrefs = useMemo(() => Object.values(allData), [allData]);

  const ranges = useMemo(() => {
    const r: Record<string, { min: number; max: number }> = {};
    for (const axis of RADAR_AXES) { r[axis.key] = minMax(allPrefs, axis.getter); }
    return r;
  }, [allPrefs]);

  const radarData = useMemo(() => {
    return RADAR_AXES.map((axis) => {
      const entry: Record<string, string | number> = { axis: axis.label };
      for (const p of prefs) {
        entry[p.pref_name] = Math.round(normalize(axis.getter(p), ranges[axis.key].min, ranges[axis.key].max));
      }
      return entry;
    });
  }, [prefs, ranges]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">レーダーチャート（6軸正規化）</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: "currentColor" }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
            {prefs.map((p, i) => (
              <Radar key={p.pref_code} name={p.pref_name} dataKey={p.pref_name}
                stroke={COMPARE_COLORS[i]} fill={COMPARE_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
            ))}
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">各指標を全47都道府県のmin-maxで0-100にスケーリング。6軸: 従来5軸 + 人口動態 + アクセス</p>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Spatial Cross-Analysis: Scatter Plots side by side                  */
/* ================================================================== */

function SpatialCrossSection({ prefs, allPrefs }: { prefs: PrefectureData[]; allPrefs: PrefectureData[] }) {
  // Access vs Land Price scatter
  const accessPriceData = useMemo(() => {
    return allPrefs
      .filter((p) => p.total_daily_riders != null && p.land_price_median_l01 != null)
      .map((p) => ({
        name: p.pref_name,
        access: Math.round((p.total_daily_riders! / p.population) * 100),
        price: Math.round(p.land_price_median_l01! / 1000),
        isSelected: prefs.some((s) => s.pref_code === p.pref_code),
      }));
  }, [allPrefs, prefs]);

  // Risk vs Pop Change scatter
  const riskPopData = useMemo(() => {
    return allPrefs
      .filter((p) => p.flood_risk_avg_pct != null && p.pop_change_pct != null)
      .map((p) => ({
        name: p.pref_name,
        risk: p.flood_risk_avg_pct!,
        popChange: p.pop_change_pct!,
        isSelected: prefs.some((s) => s.pref_code === p.pref_code),
      }));
  }, [allPrefs, prefs]);

  if (accessPriceData.length === 0 && riskPopData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">空間×統計クロス分析</CardTitle>
        <p className="text-xs text-muted-foreground">全47都道府県をプロット。選択地域はハイライト表示（大きいドット）</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Access vs Price */}
          {accessPriceData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-center mb-2">交通利用密度 × 地価</p>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="access" name="交通密度" unit="%"
                    label={{ value: "交通利用密度(%)", position: "bottom", fontSize: 10 }} />
                  <YAxis type="number" dataKey="price" name="地価" unit="千円"
                    label={{ value: "地価(千円/m2)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (<div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                      <p className="font-bold">{d.name}</p>
                      <p>交通密度: {d.access}% / 地価: {d.price}千円/m2</p>
                    </div>);
                  }} />
                  <Scatter data={accessPriceData.filter((d) => !d.isSelected)} fill="#94A3B8" fillOpacity={0.5} />
                  <Scatter data={accessPriceData.filter((d) => d.isSelected)} fill="#2A9D8F" fillOpacity={1}>
                    {accessPriceData.filter((d) => d.isSelected).map((_, i) => (
                      <Cell key={i} r={8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Risk vs Population */}
          {riskPopData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-center mb-2">浸水リスク × 人口変動率</p>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <ReferenceArea x1={0} x2={10} y1={0} y2={50} fill="#22C55E" fillOpacity={0.04} />
                  <ReferenceArea x1={10} x2={100} y1={-50} y2={0} fill="#EF4444" fillOpacity={0.04} />
                  <ReferenceLine x={10} stroke="#6B7280" strokeDasharray="3 3" />
                  <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="risk" name="浸水リスク" unit="%"
                    label={{ value: "浸水リスク(%)", position: "bottom", fontSize: 10 }} />
                  <YAxis type="number" dataKey="popChange" name="人口変動" unit="%"
                    label={{ value: "人口変動率(%)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (<div className="bg-white dark:bg-gray-800 p-2 border rounded shadow text-xs">
                      <p className="font-bold">{d.name}</p>
                      <p>浸水: {d.risk}% / 人口: {d.popChange > 0 ? "+" : ""}{d.popChange}%</p>
                    </div>);
                  }} />
                  <Scatter data={riskPopData.filter((d) => !d.isSelected)} fill="#94A3B8" fillOpacity={0.5} />
                  <Scatter data={riskPopData.filter((d) => d.isSelected)} fill="#E76F51" fillOpacity={1}>
                    {riskPopData.filter((d) => d.isSelected).map((_, i) => (
                      <Cell key={i} r={8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Percentile Distribution Bars (替わりの箱ひげ図)                     */
/* ================================================================== */

function PercentileSection({ prefs, allPrefs }: { prefs: PrefectureData[]; allPrefs: PrefectureData[] }) {
  const metrics = useMemo(() => {
    const getters: { label: string; getter: (p: PrefectureData) => number | null }[] = [
      { label: "EBM", getter: (p) => p.ebm },
      { label: "基盤比率(%)", getter: (p) => p.basic_ratio },
      { label: "投資スコア", getter: (p) => p.suitability_score.total_score },
      { label: "人口変動率(%)", getter: (p) => p.pop_change_pct ?? null },
      { label: "交通密度(%)", getter: (p) => p.total_daily_riders != null ? (p.total_daily_riders / p.population * 100) : null },
    ];

    return getters.map(({ label, getter }) => {
      const vals = allPrefs.map(getter).filter((v) => v != null) as number[];
      const sorted = [...vals].sort((a, b) => a - b);
      const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
      const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
      const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
      const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
      const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
      const min = sorted[0] ?? 0;
      const max = sorted[sorted.length - 1] ?? 1;
      const range = max - min || 1;

      const prefPositions = prefs.map((pref) => {
        const val = getter(pref);
        return { name: pref.pref_name, val, pct: val != null ? ((val - min) / range) * 100 : null };
      });

      return { label, p10, p25, p50, p75, p90, min, max, range, prefPositions };
    });
  }, [prefs, allPrefs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">パーセンタイル分布</CardTitle>
        <p className="text-xs text-muted-foreground">
          灰色帯=全国の10-90パーセンタイル、濃い帯=25-75パーセンタイル。マーカーが選択地域の位置
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.map((m) => (
          <div key={m.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{m.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {m.min.toFixed(1)} ~ {m.max.toFixed(1)}
              </span>
            </div>
            <div className="relative h-6 bg-gray-100 dark:bg-gray-800 rounded">
              {/* P10-P90 band */}
              <div
                className="absolute h-full bg-gray-200 dark:bg-gray-700 rounded"
                style={{ left: `${((m.p10 - m.min) / m.range) * 100}%`, width: `${((m.p90 - m.p10) / m.range) * 100}%` }}
              />
              {/* P25-P75 band */}
              <div
                className="absolute h-full bg-gray-300 dark:bg-gray-600 rounded"
                style={{ left: `${((m.p25 - m.min) / m.range) * 100}%`, width: `${((m.p75 - m.p25) / m.range) * 100}%` }}
              />
              {/* Median line */}
              <div
                className="absolute h-full w-0.5 bg-gray-500"
                style={{ left: `${((m.p50 - m.min) / m.range) * 100}%` }}
              />
              {/* Prefecture markers */}
              {m.prefPositions.map((pp, i) => pp.pct != null && (
                <div
                  key={pp.name}
                  className="absolute top-0.5 w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center"
                  style={{ left: `calc(${pp.pct}% - 10px)`, backgroundColor: COMPARE_COLORS[i] }}
                >
                  <span className="text-[7px] text-white font-bold">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-3 text-[10px] text-muted-foreground mt-2">
          {prefs.map((p, i) => (
            <span key={p.pref_code} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COMPARE_COLORS[i] }} />
              {i + 1}. {p.pref_name}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  LQ / RS Bar Charts (existing, enhanced)                            */
/* ================================================================== */

function LqBarChart({ prefs }: { prefs: PrefectureData[] }) {
  const data = useMemo(() => {
    const industrySet = new Set<string>();
    for (const p of prefs) { for (const item of p.top_lq_industries.slice(0, 5)) { industrySet.add(item.industry); } }
    const chartData = Array.from(industrySet).map((ind) => {
      const entry: Record<string, string | number> = { industry: ind };
      for (const p of prefs) { const found = p.lq_table.find((r) => r.industry === ind); entry[p.pref_name] = found ? Number(found.lq.toFixed(2)) : 0; }
      return entry;
    });
    chartData.sort((a, b) => {
      const maxA = Math.max(...prefs.map((p) => (a[p.pref_name] as number) || 0));
      const maxB = Math.max(...prefs.map((p) => (b[p.pref_name] as number) || 0));
      return maxB - maxA;
    });
    return chartData;
  }, [prefs]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">基盤産業比較（LQ上位）</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 120, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="industry" tick={{ fontSize: 11 }} width={110} />
            <Tooltip formatter={(value, name) => [`LQ ${Number(value).toFixed(2)}`, name]} contentStyle={{ fontSize: 12 }} />
            <ReferenceLine x={1} stroke="#EF4444" strokeDasharray="3 3" label={{ value: "LQ=1.0", position: "top", fontSize: 9 }} />
            <Legend />
            {prefs.map((p, i) => (<Bar key={p.pref_code} dataKey={p.pref_name} fill={COMPARE_COLORS[i]} barSize={14} />))}
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">各都道府県のLQ上位5産業をユニオンして表示。LQ &gt; 1.0 = 基盤産業（赤点線）。</p>
      </CardContent>
    </Card>
  );
}

function RsBarChart({ prefs }: { prefs: PrefectureData[] }) {
  const data = useMemo(() => {
    const industrySet = new Set<string>();
    for (const p of prefs) {
      const sorted = [...p.shift_share_table].sort((a, b) => b.regional_shift - a.regional_shift);
      for (const item of sorted.slice(0, 3)) industrySet.add(item.industry);
      for (const item of sorted.slice(-3)) industrySet.add(item.industry);
    }
    const chartData = Array.from(industrySet).map((ind) => {
      const entry: Record<string, string | number> = { industry: ind };
      for (const p of prefs) { const found = p.shift_share_table.find((r) => r.industry === ind); entry[p.pref_name] = found ? Math.round(found.regional_shift) : 0; }
      return entry;
    });
    chartData.sort((a, b) => {
      const maxA = Math.max(...prefs.map((p) => Math.abs((a[p.pref_name] as number) || 0)));
      const maxB = Math.max(...prefs.map((p) => Math.abs((b[p.pref_name] as number) || 0)));
      return maxB - maxA;
    });
    return chartData;
  }, [prefs]);

  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">シフトシェア RS（地域シフト）比較</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 120, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
            <YAxis type="category" dataKey="industry" tick={{ fontSize: 11 }} width={110} />
            <Tooltip formatter={(value, name) => [Number(value).toLocaleString(), name]} contentStyle={{ fontSize: 12 }} />
            <ReferenceLine x={0} stroke="#6B7280" />
            <Legend />
            {prefs.map((p, i) => (<Bar key={p.pref_code} dataKey={p.pref_name} fill={COMPARE_COLORS[i]} barSize={14} />))}
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">RS上位3/下位3産業をユニオン。正=全国平均を上回る競争力。</p>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Main Content                                                       */
/* ================================================================== */

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedCodes, setSelectedCodes] = useState<number[]>(() => {
    const param = searchParams.get("prefs");
    if (!param) return [];
    return param.split(",").map(Number).filter((c) => c >= 1 && c <= 47).slice(0, MAX_PREFS);
  });

  const [activePreset, setActivePreset] = useState("residential");

  const { allData, loading } = usePrefectureData(13);

  useEffect(() => {
    if (selectedCodes.length === 0) { router.replace("/compare", { scroll: false }); }
    else { router.replace(`/compare?prefs=${selectedCodes.join(",")}`, { scroll: false }); }
  }, [selectedCodes, router]);

  const togglePref = useCallback((code: number) => {
    setSelectedCodes((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : prev.length < MAX_PREFS ? [...prev, code] : prev);
  }, []);

  const selectedPrefs = useMemo(() => {
    if (!allData) return [];
    return selectedCodes.map((c) => allData[String(c)]).filter(Boolean) as PrefectureData[];
  }, [allData, selectedCodes]);

  const allPrefs = useMemo(() => allData ? Object.values(allData) : [], [allData]);
  const currentPreset = PRESETS.find((p) => p.id === activePreset) ?? PRESETS[0];

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      {/* Header */}
      <header className="text-white px-4 py-3 shadow-md md:px-6 md:py-4 bg-[#1B2A4A] dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1">&larr; ダッシュボード</Link>
              <span className="text-white/30">|</span>
              <h1 className="text-lg font-bold tracking-tight md:text-xl">地域比較分析</h1>
            </div>
            <Badge variant="outline" className="text-white border-white/30 hidden md:inline-flex">
              最大{MAX_PREFS}都道府県を比較 | 目的別プリセット対応
            </Badge>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6 space-y-6">
        {/* Prefecture Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">都道府県を選択</CardTitle>
          </CardHeader>
          <CardContent>
            <PrefectureSelector selected={selectedCodes} onToggle={togglePref} />
          </CardContent>
        </Card>

        {/* Preset Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">投資目的プリセット</CardTitle>
            <p className="text-xs text-muted-foreground">目的に応じて評価の重み付けが変わります。CI102のSite Selection手法に基づく</p>
          </CardHeader>
          <CardContent>
            <PresetSelector activePreset={activePreset} onSelect={setActivePreset} />
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-[200px]" />
          </div>
        ) : selectedPrefs.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">都道府県を2つ以上選択すると比較が表示されます</p>
            <p className="text-sm mt-2">上のセレクタからチェックボックスで選んでください</p>
          </div>
        ) : selectedPrefs.length === 1 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>もう1つ以上都道府県を追加してください</p>
          </div>
        ) : (
          <>
            {/* 1. Investment Scorecards */}
            <div className={`grid gap-4 ${selectedPrefs.length === 2 ? "grid-cols-1 md:grid-cols-2" : selectedPrefs.length === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"}`}>
              {selectedPrefs.map((pref, i) => (
                <InvestmentScorecard key={pref.pref_code} pref={pref} allPrefs={allPrefs} preset={currentPreset} color={COMPARE_COLORS[i]} />
              ))}
            </div>

            {/* 2. KPI Table with median + rank */}
            <KpiTable prefs={selectedPrefs} allPrefs={allPrefs} highlightLabels={currentPreset.kpiHighlight} />

            {/* 3. Percentile Distribution */}
            <PercentileSection prefs={selectedPrefs} allPrefs={allPrefs} />

            {/* 4. Radar Chart (6 axes) */}
            {allData && <RadarSection prefs={selectedPrefs} allData={allData} />}

            {/* 5. Spatial Cross-Analysis */}
            <SpatialCrossSection prefs={selectedPrefs} allPrefs={allPrefs} />

            {/* 6. LQ Bar Chart */}
            <LqBarChart prefs={selectedPrefs} />

            {/* 7. RS Bar Chart */}
            <RsBarChart prefs={selectedPrefs} />

            {/* Data note */}
            <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
              <summary className="font-medium cursor-pointer">データの時点と制限</summary>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>経済センサス: 2021年6月時点（5年ごと更新、次回2026年）</li>
                <li>国勢調査: 2020年10月時点（人口は2015年の値を2020年境界に組替）</li>
                <li>国土数値情報: 各データセットの調査年度に依存（詳細はDATA_UPDATE_PLAN.md参照）</li>
                <li>プリセットスコアの重み付けはCI102教科書の分析フレームワークに基づく教育目的の参考値</li>
                <li>正規化はすべて全47都道府県のmin-maxスケーリング</li>
              </ul>
            </details>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto px-4 py-3 md:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ / 国土数値情報
          </p>
          <div className="flex gap-4">
            <Link href="/learn" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">分析手法を学ぶ &rarr;</Link>
            <Link href="/" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">ダッシュボード &rarr;</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ================================================================== */
/*  Export                                                              */
/* ================================================================== */

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950 flex items-center justify-center"><p className="text-muted-foreground">読み込み中...</p></div>}>
      <CompareContent />
    </Suspense>
  );
}
