"use client";

import { useState, useEffect, useMemo } from "react";
import PlotlyChart from "@/components/plotly-chart";
import MuellerCycle from "@/components/mueller-cycle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  prefCode: number;
  cityCode?: number;
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

  // Group by Type for box plot
  const types = useMemo(() => [...new Set(data.map((d: any) => d.Type))].filter(Boolean), [data]);

  return (
    <div className="space-y-6">
      {/* Year/Quarter selectors */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label htmlFor="year-select" className="text-sm font-medium">年度</label>
          <select id="year-select" value={year} onChange={(e) => setYear(Number(e.target.value))}
            aria-label="年度を選択"
            className="ml-2 rounded border px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            {[2024, 2023, 2022, 2021, 2020, 2019].map((y) => (
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

          {/* Charts: histogram + box plot */}
          <div className="grid md:grid-cols-2 gap-4">
            <PlotlyChart
              data={[{
                type: "histogram",
                x: numericData.filter((d) => d.TradePrice > 0).map((d) => d.TradePrice),
                nbinsx: 30,
                marker: { color: "#1B2A4A" },
              } as any]}
              layout={{ title: { text: "取引価格分布" }, height: 400, xaxis: { title: { text: "取引価格（円）" } } }}
            />
            <PlotlyChart
              data={types.map((t) => ({
                type: "box" as const,
                y: validPrices.filter((d) => d.Type === t).map((d) => d.UnitPrice),
                name: t,
              }))}
              layout={{ title: { text: "物件種別ごとの㎡単価" }, height: 400 }}
            />
          </div>

          {/* Scatter: Area × UnitPrice */}
          <PlotlyChart
            data={types.map((t) => {
              const filtered = validPrices.filter((d) => d.Type === t && d.Area > 0);
              return {
                type: "scatter" as const,
                mode: "markers" as const,
                name: t,
                x: filtered.map((d) => d.Area),
                y: filtered.map((d) => d.UnitPrice),
                marker: { opacity: 0.6 },
                hovertemplate: `${t}<br>面積: %{x}㎡<br>㎡単価: %{y:,.0f}円<extra></extra>`,
              };
            })}
            layout={{
              title: { text: "面積 × ㎡単価" },
              height: 500,
              xaxis: { title: { text: "面積（㎡）" } },
              yaxis: { title: { text: "㎡単価（円/㎡）" } },
            }}
          />

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
