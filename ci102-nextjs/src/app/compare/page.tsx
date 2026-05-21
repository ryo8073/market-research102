"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PREFECTURES } from "@/lib/codes";
import { usePrefectureData, type PrefectureData } from "@/lib/use-prefecture-data";

/* ---------- Constants ---------- */

const COMPARE_COLORS = ["#2A9D8F", "#D4A843", "#E76F51", "#3B82F6"] as const;
const MAX_PREFS = 4;

/* ---------- Utility: number formatting ---------- */

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

/* ---------- Normalization (min-max across all 47 prefs) ---------- */

function minMax(all: PrefectureData[], getter: (p: PrefectureData) => number): { min: number; max: number } {
  const vals = all.map(getter).filter((v) => Number.isFinite(v));
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

/* ---------- Cell color: best/worst highlighting ---------- */

type Direction = "high" | "low" | "abs-low";

function cellColor(values: (number | null)[], idx: number, direction: Direction): string {
  const valid = values.filter((v) => v != null) as number[];
  if (valid.length < 2) return "";
  const val = values[idx];
  if (val == null) return "";

  let best: number;
  let worst: number;
  if (direction === "high") {
    best = Math.max(...valid);
    worst = Math.min(...valid);
  } else if (direction === "low") {
    best = Math.min(...valid);
    worst = Math.max(...valid);
  } else {
    // abs-low: closest to zero is best
    const sorted = [...valid].sort((a, b) => Math.abs(a) - Math.abs(b));
    best = sorted[0];
    worst = sorted[sorted.length - 1];
  }

  if (val === best) return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200";
  if (val === worst) return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200";
  return "";
}

/* ---------- Prefecture Selector ---------- */

function PrefectureSelector({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (code: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {/* Selected badges */}
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map((code, i) => (
          <Badge
            key={code}
            style={{ backgroundColor: COMPARE_COLORS[i], color: "white" }}
            className="cursor-pointer text-sm px-3 py-1"
            onClick={() => onToggle(code)}
          >
            {PREFECTURES[code]} &times;
          </Badge>
        ))}
        {selected.length === 0 && (
          <span className="text-sm text-muted-foreground">
            都道府県を選択してください（最大{MAX_PREFS}つ）
          </span>
        )}
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="rounded bg-white dark:bg-gray-800 border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {open ? "閉じる" : "都道府県を選択"}
      </button>

      {open && (
        <div className="mt-2 p-3 border rounded-lg bg-white dark:bg-gray-800 shadow-lg max-h-64 overflow-y-auto grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1">
          {Object.entries(PREFECTURES).map(([code, name]) => {
            const c = Number(code);
            const isSelected = selected.includes(c);
            const disabled = !isSelected && selected.length >= MAX_PREFS;
            return (
              <label
                key={c}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-100 dark:bg-blue-900/40 font-semibold"
                    : disabled
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onToggle(c)}
                  className="w-3 h-3"
                />
                {name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- KPI Comparison Table ---------- */

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
];

function KpiTable({ prefs }: { prefs: PrefectureData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">KPI比較テーブル</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground">指標</th>
                {prefs.map((p, i) => (
                  <th key={p.pref_code} className="text-right py-2 px-3 font-semibold" style={{ color: COMPARE_COLORS[i] }}>
                    {p.pref_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KPI_ROWS.map((row) => {
                const values = prefs.map((p) => row.getter(p));
                return (
                  <tr key={row.label} className="border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-2 px-3 font-medium">{row.label}</td>
                    {prefs.map((p, i) => (
                      <td
                        key={p.pref_code}
                        className={`text-right py-2 px-3 font-mono tabular-nums ${cellColor(values, i, row.direction)}`}
                      >
                        {row.format(values[i])}
                      </td>
                    ))}
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

/* ---------- Radar Chart ---------- */

const RADAR_AXES = [
  { key: "ebm", label: "EBM", getter: (p: PrefectureData) => p.ebm },
  { key: "basic_ratio", label: "基盤比率", getter: (p: PrefectureData) => p.basic_ratio },
  { key: "rs", label: "RS", getter: (p: PrefectureData) => p.rs_total },
  { key: "gap", label: "ギャップ", getter: (p: PrefectureData) => p.aggregate_gap_factor },
  { key: "score", label: "投資スコア", getter: (p: PrefectureData) => p.suitability_score.total_score },
] as const;

function RadarSection({
  prefs,
  allData,
}: {
  prefs: PrefectureData[];
  allData: Record<string, PrefectureData>;
}) {
  const allPrefs = useMemo(() => Object.values(allData), [allData]);

  const ranges = useMemo(() => {
    const r: Record<string, { min: number; max: number }> = {};
    for (const axis of RADAR_AXES) {
      r[axis.key] = minMax(allPrefs, axis.getter);
    }
    return r;
  }, [allPrefs]);

  const radarData = useMemo(() => {
    return RADAR_AXES.map((axis) => {
      const entry: Record<string, string | number> = { axis: axis.label };
      for (const p of prefs) {
        const raw = axis.getter(p);
        entry[p.pref_name] = Math.round(normalize(raw, ranges[axis.key].min, ranges[axis.key].max));
      }
      return entry;
    });
  }, [prefs, ranges]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">レーダーチャート（正規化 0-100）</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: "currentColor" }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
            {prefs.map((p, i) => (
              <Radar
                key={p.pref_code}
                name={p.pref_name}
                dataKey={p.pref_name}
                stroke={COMPARE_COLORS[i]}
                fill={COMPARE_COLORS[i]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          各指標を全47都道府県のmin-maxで0-100にスケーリング。外側ほど高い値。
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------- Top LQ Industries Grouped Bar Chart ---------- */

function LqBarChart({ prefs }: { prefs: PrefectureData[] }) {
  // Collect top 5 industries from each selected prefecture, then union
  const { data, industries } = useMemo(() => {
    const industrySet = new Set<string>();
    for (const p of prefs) {
      for (const item of p.top_lq_industries.slice(0, 5)) {
        industrySet.add(item.industry);
      }
    }
    const allIndustries = Array.from(industrySet);

    const chartData = allIndustries.map((ind) => {
      const entry: Record<string, string | number> = { industry: ind };
      for (const p of prefs) {
        const found = p.lq_table.find((r) => r.industry === ind);
        entry[p.pref_name] = found ? Number(found.lq.toFixed(2)) : 0;
      }
      return entry;
    });

    // Sort by max LQ across selected prefs
    chartData.sort((a, b) => {
      const maxA = Math.max(...prefs.map((p) => (a[p.pref_name] as number) || 0));
      const maxB = Math.max(...prefs.map((p) => (b[p.pref_name] as number) || 0));
      return maxB - maxA;
    });

    return { data: chartData, industries: allIndustries };
  }, [prefs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">基盤産業比較（LQ上位）</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 120, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="industry" tick={{ fontSize: 11 }} width={110} />
            <Tooltip
              formatter={(value, name) => [`LQ ${Number(value).toFixed(2)}`, name]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend />
            {prefs.map((p, i) => (
              <Bar key={p.pref_code} dataKey={p.pref_name} fill={COMPARE_COLORS[i]} barSize={14} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          各都道府県のLQ上位5産業をユニオンして表示。LQ &gt; 1.0 が基盤産業。
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------- Shift-Share RS Comparison Bar Chart ---------- */

function RsBarChart({ prefs }: { prefs: PrefectureData[] }) {
  const data = useMemo(() => {
    // Get top 3 and bottom 3 RS industries per prefecture
    const industrySet = new Set<string>();
    for (const p of prefs) {
      const sorted = [...p.shift_share_table].sort((a, b) => b.regional_shift - a.regional_shift);
      for (const item of sorted.slice(0, 3)) industrySet.add(item.industry);
      for (const item of sorted.slice(-3)) industrySet.add(item.industry);
    }
    const allIndustries = Array.from(industrySet);

    const chartData = allIndustries.map((ind) => {
      const entry: Record<string, string | number> = { industry: ind };
      for (const p of prefs) {
        const found = p.shift_share_table.find((r) => r.industry === ind);
        entry[p.pref_name] = found ? Math.round(found.regional_shift) : 0;
      }
      return entry;
    });

    // Sort by max absolute RS
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
      <CardHeader>
        <CardTitle className="text-lg">シフトシェア RS（地域シフト）比較</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 120, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
            <YAxis type="category" dataKey="industry" tick={{ fontSize: 11 }} width={110} />
            <Tooltip
              formatter={(value, name) => [Number(value).toLocaleString(), name]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend />
            {prefs.map((p, i) => (
              <Bar key={p.pref_code} dataKey={p.pref_name} fill={COMPARE_COLORS[i]} barSize={14} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          各都道府県のRS上位3/下位3産業をユニオンして表示。正=全国平均を上回る競争力。
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------- Main Content ---------- */

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedCodes, setSelectedCodes] = useState<number[]>(() => {
    const param = searchParams.get("prefs");
    if (!param) return [];
    return param
      .split(",")
      .map(Number)
      .filter((c) => c >= 1 && c <= 47)
      .slice(0, MAX_PREFS);
  });

  // Load all prefecture data (use prefCode=13 as dummy; we only need allData)
  const { allData, loading } = usePrefectureData(13);

  // Sync selection to URL
  useEffect(() => {
    if (selectedCodes.length === 0) {
      router.replace("/compare", { scroll: false });
    } else {
      router.replace(`/compare?prefs=${selectedCodes.join(",")}`, { scroll: false });
    }
  }, [selectedCodes, router]);

  const togglePref = useCallback(
    (code: number) => {
      setSelectedCodes((prev) =>
        prev.includes(code) ? prev.filter((c) => c !== code) : prev.length < MAX_PREFS ? [...prev, code] : prev
      );
    },
    []
  );

  const selectedPrefs = useMemo(() => {
    if (!allData) return [];
    return selectedCodes.map((c) => allData[String(c)]).filter(Boolean) as PrefectureData[];
  }, [allData, selectedCodes]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      {/* Header */}
      <header className="text-white px-4 py-3 shadow-md md:px-6 md:py-4 bg-[#1B2A4A] dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1"
              >
                &larr; ダッシュボード
              </Link>
              <span className="text-white/30">|</span>
              <h1 className="text-lg font-bold tracking-tight md:text-xl">地域比較</h1>
            </div>
            <Badge variant="outline" className="text-white border-white/30 hidden md:inline-flex">
              最大{MAX_PREFS}都道府県を比較
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
            {/* 1. KPI Table */}
            <KpiTable prefs={selectedPrefs} />

            {/* 2. Radar Chart */}
            {allData && <RadarSection prefs={selectedPrefs} allData={allData} />}

            {/* 3. LQ Bar Chart */}
            <LqBarChart prefs={selectedPrefs} />

            {/* 4. RS Bar Chart */}
            <RsBarChart prefs={selectedPrefs} />

            {/* Data note */}
            <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
              <summary className="font-medium cursor-pointer">データの時点と制限</summary>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>経済センサス: 2021年6月時点（5年ごと更新、次回2026年）</li>
                <li>国勢調査: 2020年10月時点（人口は2015年の値を2020年境界に組替）</li>
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
            データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ
          </p>
          <div className="flex gap-4">
            <Link href="/learn" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">
              分析手法を学ぶ &rarr;
            </Link>
            <Link href="/" className="text-xs text-[#D4A843] hover:underline whitespace-nowrap">
              ダッシュボード &rarr;
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Export with Suspense ---------- */

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950 flex items-center justify-center">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
