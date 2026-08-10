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

export default function RealEstateTab({ prefCode, cityCode }: Props) {
  const [year, setYear] = useState(2024);
  const [quarter, setQuarter] = useState(1);
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
  }, [prefCode, year, quarter, cityCode]);

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
              <p className="text-[10px] text-muted-foreground mt-1">出典: 国交省 不動産情報ライブラリ（MLIT XIT001）。中央値は全物件種別の㎡単価。</p>
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
