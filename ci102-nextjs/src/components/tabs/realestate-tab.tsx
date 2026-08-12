"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell,
  ComposedChart, Line, CartesianGrid, Legend,
} from "recharts";
import MuellerCycle from "@/components/mueller-cycle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TYPE_COLORS = [
  "#1B2A4A", "#D4A843", "#2A9D8F", "#E76F51", "#6B7280",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F59E0B", "#3B82F6",
];

interface Props {
  prefCode: number;
  cityCode?: number;
}

/** Build histogram bins from an array of numbers */
function buildHistogramBins(values: number[], binCount: number = 20): Array<{ range: string; count: number; rangeStart: number }> {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ range: `${min.toLocaleString()}`, count: values.length, rangeStart: min }];
  const binWidth = (max - min) / binCount;
  const bins: Array<{ range: string; count: number; rangeStart: number }> = [];
  for (let i = 0; i < binCount; i++) {
    const lo = min + i * binWidth;
    const hi = lo + binWidth;
    const count = values.filter((v) => (i === binCount - 1 ? v >= lo && v <= hi : v >= lo && v < hi)).length;
    const loLabel = lo >= 1e4 ? `${(lo / 1e4).toFixed(0)}万` : lo.toLocaleString();
    const hiLabel = hi >= 1e4 ? `${(hi / 1e4).toFixed(0)}万` : hi.toLocaleString();
    bins.push({ range: `${loLabel}-${hiLabel}`, count, rangeStart: lo });
  }
  return bins.filter((b) => b.count > 0);
}

/** Custom tooltip for scatter */
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{d.Type}</p>
      <p>面積: {d.Area}㎡</p>
      <p>㎡単価: ¥{d.UnitPrice.toLocaleString()}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  賃料インデックスセクション（SMTRI × アットホーム）                   */
/* ------------------------------------------------------------------ */

interface RentTsPoint { period: string; value: number }
interface RentIndexArea {
  key: string;
  label: string;
  pref_code: number;
  timeseries: Record<string, RentTsPoint[]>;
}
interface RentIndexData {
  source: string;
  period_range: string;
  latest_period: string;
  base: string;
  types_legend: Record<string, string>;
  areas: RentIndexArea[];
}

const RENT_TYPE_COLORS: Record<string, string> = {
  single: "#E76F51",
  compact: "#2A9D8F",
  family: "#6366F1",
  total: "#1B2A4A",
};
const RENT_TYPE_LABELS: Record<string, string> = {
  single: "シングル（18-30m²）",
  compact: "コンパクト（30-60m²）",
  family: "ファミリー（60-100m²）",
  total: "総合",
};

function RentIndexSection({ prefCode }: { prefCode: number }) {
  const [data, setData] = useState<RentIndexData | null>(null);
  useEffect(() => {
    fetch("/data/rent_index.json")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  const matchedAreas = data?.areas.filter((a) => a.pref_code === prefCode) ?? [];

  // 折れ線チャート用データ: period → { period, single, compact, family, total }
  const chartDataByArea = useMemo(() => {
    if (!matchedAreas.length) return [];
    return matchedAreas.map((area) => {
      const periodMap: Record<string, Record<string, number>> = {};
      for (const [type, ts] of Object.entries(area.timeseries)) {
        for (const pt of ts) {
          if (!periodMap[pt.period]) periodMap[pt.period] = {};
          periodMap[pt.period][type] = pt.value;
        }
      }
      const sorted = Object.entries(periodMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, vals]) => ({ period, ...vals }));
      return { area, chartData: sorted };
    });
  }, [matchedAreas]);

  // 最新四半期のサマリー
  const latestSummary = useMemo(() => {
    return matchedAreas.map((area) => {
      const types: Record<string, { latest: number; prev: number; yoyPrev: number }> = {};
      for (const [type, ts] of Object.entries(area.timeseries)) {
        if (ts.length < 2) continue;
        const latest = ts[ts.length - 1];
        const prev = ts[ts.length - 2];
        const yoyPrev = ts.length >= 5 ? ts[ts.length - 5] : null;
        types[type] = {
          latest: latest.value,
          prev: prev.value,
          yoyPrev: yoyPrev?.value ?? 0,
        };
      }
      return { area, types };
    });
  }, [matchedAreas]);

  if (!data || matchedAreas.length === 0) return null;

  // X軸ラベル: 年だけ表示（Q1のみ表示）
  const formatXAxis = (period: string) => {
    if (period.endsWith("Q1")) return period.replace("Q1", "");
    return "";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          マンション賃料インデックス
          <span className="text-xs font-normal text-muted-foreground">
            {data.base}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {chartDataByArea.map(({ area, chartData }) => (
          <div key={area.key} className="space-y-3">
            <h4 className="text-sm font-semibold">{area.label}</h4>

            {/* 時系列折れ線チャート */}
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="period" tickFormatter={formatXAxis} tick={{ fontSize: 10 }} interval={3} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    labelFormatter={(label) => String(label)}
                    formatter={(value, name) => [
                      Number(value).toFixed(2),
                      RENT_TYPE_LABELS[String(name)] ?? String(name),
                    ]}
                  />
                  <Legend
                    formatter={(value) => RENT_TYPE_LABELS[String(value)] ?? String(value)}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  {(["single", "compact", "family", "total"] as const).map((type) => (
                    <Line
                      key={type}
                      type="monotone"
                      dataKey={type}
                      stroke={RENT_TYPE_COLORS[type]}
                      strokeWidth={type === "total" ? 2.5 : 1.5}
                      dot={false}
                      strokeDasharray={type === "total" ? undefined : ""}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 最新四半期サマリーテーブル */}
            {latestSummary
              .filter((s) => s.area.key === area.key)
              .map((s) => (
                <div key={s.area.key} className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="p-2 text-left">タイプ</th>
                        <th className="p-2 text-right">最新値（{data.latest_period}）</th>
                        <th className="p-2 text-right">前期比</th>
                        <th className="p-2 text-right">前年同期比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["single", "compact", "family", "total"] as const).map((type) => {
                        const t = s.types[type];
                        if (!t) return null;
                        const qoq = t.latest - t.prev;
                        const yoy = t.yoyPrev > 0 ? t.latest - t.yoyPrev : 0;
                        const isTotal = type === "total";
                        const arrow = (v: number) => v > 3 ? "↑↑" : v > 0 ? "↑" : v > -0.5 ? "→" : v > -3 ? "↓" : "↓↓";
                        const color = (v: number) => v > 3 ? "text-red-600" : v > 0 ? "text-orange-500" : v > -0.5 ? "text-gray-500" : "text-blue-600";
                        return (
                          <tr key={type} className={`border-b ${isTotal ? "font-semibold bg-muted/30" : "hover:bg-muted/20"}`}>
                            <td className="p-2">{RENT_TYPE_LABELS[type]}</td>
                            <td className="p-2 text-right font-mono">{t.latest.toFixed(2)}</td>
                            <td className={`p-2 text-right font-mono ${color(qoq)}`}>
                              {arrow(qoq)} {qoq >= 0 ? "+" : ""}{qoq.toFixed(2)}
                            </td>
                            <td className={`p-2 text-right font-mono ${color(yoy)}`}>
                              {t.yoyPrev > 0 ? `${arrow(yoy)} ${yoy >= 0 ? "+" : ""}${yoy.toFixed(2)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        ))}

        {/* 投資示唆 */}
        <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-semibold">投資判断への示唆</p>
          {latestSummary.map(({ area, types }) => {
            const total = types.total;
            if (!total) return null;
            const yoy = total.yoyPrev > 0 ? total.latest - total.yoyPrev : 0;
            const trend = yoy > 5 ? "上昇基調" : yoy > 0 ? "緩やかな上昇" : yoy > -3 ? "横ばい" : "下落傾向";
            const implication = yoy > 5
              ? "賃料上昇は賃貸投資のインカムゲインに直結。ただし入居者負担増による空室リスクにも注意。"
              : yoy > 0
              ? "安定的な賃料上昇はインカムリターンの底堅さを示します。"
              : "賃料の停滞・下落局面では、空室率とあわせてエリアの需給バランスを精査してください。";
            return (
              <p key={area.key}>
                <span className="font-medium">{area.label}</span>: {trend}（前年同期比{yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}）。{implication}
              </p>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground">
          出典: {data.source}。{data.base}。成約賃料のヘドニック品質調整済み指数。無断転載禁止。
        </p>
      </CardContent>
    </Card>
  );
}

export default function RealEstateTab({ prefCode, cityCode }: Props) {
  const [year, setYear] = useState(2024);
  const [quarter, setQuarter] = useState(1);
  const [priceClass, setPriceClass] = useState<"" | "01" | "02">("");  // ""=全て, 01=取引, 02=成約
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      prefCode: String(prefCode),
      year: String(year),
      quarter: String(quarter),
    });
    if (cityCode) params.set("cityCode", String(cityCode));
    if (priceClass) params.set("priceClassification", priceClass);

    fetch(`/api/mlit?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setData([]);
        } else {
          setData(json.data ?? []);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [prefCode, year, quarter, cityCode, priceClass]);

  const numericData = useMemo(() => {
    return data.map((d: any) => ({
      ...d,
      TradePrice: Number(d.TradePrice) || 0,
      UnitPrice: Number(d.UnitPrice) || 0,
      Area: Number(d.Area) || 0,
    }));
  }, [data]);

  const validPrices = numericData.filter((d) => d.UnitPrice > 0);
  const medianPrice = useMemo(() => {
    if (validPrices.length === 0) return null;
    const sorted = [...validPrices].sort((a, b) => a.UnitPrice - b.UnitPrice);
    return sorted[Math.floor(sorted.length / 2)].UnitPrice;
  }, [validPrices]);

  const medianTradePrice = useMemo(() => {
    const valid = numericData.filter((d) => d.TradePrice > 0);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => a.TradePrice - b.TradePrice);
    return sorted[Math.floor(sorted.length / 2)].TradePrice;
  }, [numericData]);

  const types = useMemo(() => [...new Set(data.map((d: any) => d.Type))].filter(Boolean) as string[], [data]);

  // 四半期トレンドデータ（最新8四半期を一括取得）
  const [trendData, setTrendData] = useState<Array<{ label: string; median: number; count: number }>>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  useEffect(() => {
    setTrendLoading(true);
    const quarters: Array<{ y: number; q: number }> = [];
    // 最新8四半期を生成（2024Q2〜2026Q1）
    for (let y = 2024; y <= 2026; y++) {
      for (let q = 1; q <= 4; q++) {
        if (y === 2024 && q < 2) continue;
        if (y === 2026 && q > 1) continue;
        quarters.push({ y, q });
      }
    }
    Promise.all(
      quarters.map(async ({ y, q }) => {
        try {
          const params = new URLSearchParams({ prefCode: String(prefCode), year: String(y), quarter: String(q) });
          if (cityCode) params.set("cityCode", String(cityCode));
          const r = await fetch(`/api/mlit?${params}`);
          const json = await r.json();
          const records = json.data ?? [];
          const prices = records.map((d: any) => Number(d.UnitPrice)).filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
          const median = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
          return { label: `${y}Q${q}`, median, count: records.length };
        } catch {
          return { label: `${y}Q${q}`, median: 0, count: 0 };
        }
      })
    ).then((results) => {
      setTrendData(results.filter((r) => r.count > 0));
      setTrendLoading(false);
    });
  }, [prefCode, cityCode]);

  // Histogram bins for trade price
  const histogramBins = useMemo(() => {
    const prices = numericData.filter((d) => d.TradePrice > 0).map((d) => d.TradePrice);
    return buildHistogramBins(prices, 20);
  }, [numericData]);

  // Type summary stats (median + mean) for box plot replacement
  const typeStats = useMemo(() => {
    return types.map((t) => {
      const prices = validPrices.filter((d) => d.Type === t).map((d) => d.UnitPrice);
      if (prices.length === 0) return { type: t, median: 0, mean: 0, count: 0 };
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const med = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
      return { type: t, median: med, mean: avg, count: prices.length };
    }).filter((s) => s.count > 0).sort((a, b) => b.median - a.median);
  }, [types, validPrices]);

  // Scatter data: area vs unit price, with type for coloring
  const scatterData = useMemo(() => {
    return validPrices
      .filter((d) => d.Area > 0)
      .map((d) => ({ Area: d.Area, UnitPrice: d.UnitPrice, Type: d.Type }));
  }, [validPrices]);

  // Create a type->color map
  const typeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    types.forEach((t, i) => { map[t] = TYPE_COLORS[i % TYPE_COLORS.length]; });
    return map;
  }, [types]);

  return (
    <div className="space-y-6">
      {/* 四半期トレンドチャート */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">四半期トレンド — 成約単価の推移（円/m2）</CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <p className="text-sm text-muted-foreground animate-pulse">トレンドデータを読み込み中...</p>
          ) : trendData.length > 0 ? (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="price"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: unknown) => `${(Number(v) / 10000).toFixed(0)}万`}
                      width={48}
                    />
                    <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 10 }} width={40} />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => {
                        const v = Number(value);
                        return String(name) === "中央値" ? [`¥${v.toLocaleString()}/m2`, String(name)] : [`${v.toLocaleString()}件`, String(name)];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="count" dataKey="count" name="件数" fill="#E2E8F0" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="price" type="monotone" dataKey="median" name="中央値" stroke="#D4A843" strokeWidth={2.5} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-1">出典: 国交省 不動産情報ライブラリ（MLIT XIT001）。中央値は全物件種別の㎡単価。</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">トレンドデータがありません。</p>
          )}
        </CardContent>
      </Card>

      {/* Year/Quarter selectors */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label htmlFor="year-select" className="text-sm font-medium">年度</label>
          <select id="year-select" value={year} onChange={(e) => setYear(Number(e.target.value))}
            aria-label="年度を選択"
            className="ml-2 rounded border px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            {[2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quarter-select" className="text-sm font-medium">四半期</label>
          <select id="quarter-select" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}
            aria-label="四半期を選択"
            className="ml-2 rounded border px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>Q{q}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="price-class-select" className="text-sm font-medium">価格区分</label>
          <select id="price-class-select" value={priceClass} onChange={(e) => setPriceClass(e.target.value as "" | "01" | "02")}
            aria-label="価格区分を選択"
            className="ml-2 rounded border px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="">全て</option>
            <option value="01">取引価格</option>
            <option value="02">成約価格（レインズ）</option>
          </select>
        </div>
        {loading && <span className="text-sm text-muted-foreground animate-pulse">読込中...</span>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {data.length > 0 && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">取引件数</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{data.length.toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">価格中央値</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{medianTradePrice ? `${(medianTradePrice / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}万円` : "—"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">㎡単価中央値</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{medianPrice ? `${medianPrice.toLocaleString()}円/㎡` : "—"}</div></CardContent>
            </Card>
          </div>

          {/* Charts: histogram + type stats */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Histogram — trade price distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">取引価格分布</CardTitle>
              </CardHeader>
              <CardContent>
                <div aria-label="取引価格のヒストグラム">
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={histogramBins} margin={{ top: 10, right: 10, bottom: 40, left: 10 }}>
                      <XAxis
                        dataKey="range"
                        tick={{ fontSize: 9 }}
                        angle={-45}
                        textAnchor="end"
                        interval={Math.max(0, Math.floor(histogramBins.length / 8))}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => [`${Number(value)}件`, "件数"]}
                        labelFormatter={(label) => `価格帯: ${String(label)}`}
                      />
                      <Bar dataKey="count" fill="#1B2A4A" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Type stats — median & mean unit price by type (replaces box plot) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">物件種別ごとの㎡単価</CardTitle>
              </CardHeader>
              <CardContent>
                <div aria-label="物件種別ごとの単価比較">
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={typeStats} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `¥${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="type" width={70} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value, name) => [
                          `¥${Number(value).toLocaleString()}`,
                          String(name) === "median" ? "中央値" : "平均値",
                        ]}
                      />
                      <Bar dataKey="median" fill="#2A9D8F" name="median" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="mean" fill="#D4A843" name="mean" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 justify-center text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#2A9D8F" }} /> 中央値</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#D4A843" }} /> 平均値</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scatter: Area × UnitPrice */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">面積 × ㎡単価</CardTitle>
            </CardHeader>
            <CardContent>
              <div aria-label="面積と㎡単価の散布図">
                <ResponsiveContainer width="100%" height={450}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 50, left: 60 }}>
                    <XAxis
                      dataKey="Area"
                      type="number"
                      name="面積"
                      tick={{ fontSize: 11 }}
                      label={{ value: "面積（㎡）", position: "bottom", offset: 10, fontSize: 12 }}
                    />
                    <YAxis
                      dataKey="UnitPrice"
                      type="number"
                      name="㎡単価"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `¥${(v / 1000).toFixed(0)}k`}
                      label={{ value: "㎡単価（円/㎡）", angle: -90, position: "insideLeft", offset: -10, fontSize: 12 }}
                    />
                    <Tooltip content={<ScatterTooltip />} />
                    <Scatter data={scatterData}>
                      {scatterData.map((d, i) => (
                        <Cell key={i} fill={typeColorMap[d.Type] ?? "#6B7280"} opacity={0.6} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              {/* Type legend */}
              <div className="flex flex-wrap gap-3 justify-center text-xs text-muted-foreground mt-2">
                {types.map((t, i) => (
                  <span key={t} className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                    {t}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Mueller Market Cycle */}
          <MuellerCycle prefCode={prefCode} cityCode={cityCode} />

          {/* Data table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left">物件種別</th>
                  <th className="p-2 text-right">取引価格</th>
                  <th className="p-2 text-right">㎡単価</th>
                  <th className="p-2 text-right">面積</th>
                  <th className="p-2 text-left">地区名</th>
                </tr>
              </thead>
              <tbody>
                {numericData.slice(0, 100).map((d, i) => (
                  <tr key={i} className="border-b hover:bg-muted/50 cursor-default transition-colors">
                    <td className="p-2">{d.Type}</td>
                    <td className="p-2 text-right font-mono">{d.TradePrice > 0 ? `${(d.TradePrice / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}万` : "—"}</td>
                    <td className="p-2 text-right font-mono">{d.UnitPrice > 0 ? d.UnitPrice.toLocaleString() : "—"}</td>
                    <td className="p-2 text-right">{d.Area > 0 ? d.Area : "—"}</td>
                    <td className="p-2">{d.DistrictName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {numericData.length > 100 && (
              <p className="text-xs text-muted-foreground p-2">上位100件を表示（全{numericData.length}件）</p>
            )}
          </div>
        </>
      )}

      {/* 賃料インデックス */}
      <RentIndexSection prefCode={prefCode} />

      {/* Educational content */}
      <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="font-medium cursor-pointer">ℹ️ 投資判断への活用</summary>
        <div className="mt-2 space-y-2">
          <p>
            経済基盤分析（Tab 1）で特定した基盤産業の強さが、実際の不動産価格にどう反映されているかを確認します。
          </p>
          <p className="font-medium">着目ポイント:</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            <li>基盤産業が強い地域は、取引価格が安定・上昇傾向にあるか？</li>
            <li>シフトシェアでRS（競争要因）が正の産業が集積するエリアで、㎡単価は上がっているか？</li>
            <li>物件タイプ別の㎡単価分布から、割安なセグメントはどこか？</li>
          </ul>
          <p className="text-xs">
            データソース: 国土交通省 不動産情報ライブラリAPI（四半期ごとの実取引データ）
          </p>
        </div>
      </details>

      {!loading && data.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground">
          指定期間の取引データがありません。年度・四半期を変更してください。
        </div>
      )}
    </div>
  );
}
