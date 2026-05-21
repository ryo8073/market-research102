"use client";

import { useMemo } from "react";
import PlotlyChart from "@/components/plotly-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gap_analysis_table, type GapRow } from "@/lib/calculator";
import type { MunicipalityData } from "@/lib/use-municipality-data";

/** Format yen values with appropriate unit (万 or 億) */
function formatYen(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e8) return `${(val / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}億`;
  if (abs >= 1e4) return `${(val / 1e4).toLocaleString(undefined, { maximumFractionDigits: 0 })}万`;
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

interface Props {
  sectors: Array<{ sector: string; demand: number; supply: number }>;
  selectedCity?: MunicipalityData | null;
}

export default function GapTab({ sectors, selectedCity }: Props) {
  const gapData = useMemo(() => gap_analysis_table(sectors), [sectors]);
  const sorted = useMemo(() => [...gapData].sort((a, b) => a.factor - b.factor), [gapData]);
  const leakage = gapData.filter((r) => r.factor >= 10).length;
  const surplus = gapData.filter((r) => r.factor <= -10).length;
  const maxLeak = gapData.reduce((max, r) => (r.factor > max.factor ? r : max), gapData[0]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">漏損セクター</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-600">{leakage} / {gapData.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">余剰セクター</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{surplus} / {gapData.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">最大漏損</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{maxLeak?.sector ?? "—"}</div>
            <p className="text-sm text-teal-600">+{maxLeak?.factor.toFixed(1) ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Municipality highlight */}
      {selectedCity && (
        <div className="rounded-lg border p-4" style={{ backgroundColor: "#f0f9ff" }}>
          <h3 className="font-semibold mb-2">{selectedCity.area_name} — 市区町村参考データ</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">総雇用</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.total_emp.toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">基盤雇用比率</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.basic_ratio.toFixed(1)}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">セグメント</CardTitle></CardHeader>
              <CardContent><div className="text-sm font-bold">{selectedCity.segment ?? "—"}</div></CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground mt-2">小売ギャップ分析は都道府県レベルのデータです。市区町村別の小売データは事前計算に含まれていません。</p>
        </div>
      )}

      {/* Gap Bar Chart (STDB-style: single color, zero-centered) */}
      <PlotlyChart
        data={[
          {
            type: "bar",
            x: sorted.map((r) => r.factor),
            y: sorted.map((r) => r.sector),
            orientation: "h",
            marker: { color: "#D4A843" },
            hovertemplate: "%{y}: %{x:+.1f}<extra></extra>",
          },
        ]}
        layout={{
          title: { text: "漏損/余剰係数" },
          height: Math.max(400, sorted.length * 50),
          margin: { l: 200 },
          shapes: [
            {
              type: "line", x0: 0, x1: 0, y0: -0.5, y1: sorted.length - 0.5,
              line: { color: "#6B7280", width: 2 },
            },
          ],
          annotations: [
            { x: -50, y: 1.05, text: "← 余剰（供給過多）", showarrow: false, xref: "x", yref: "paper", font: { color: "#6B7280" } },
            { x: 50, y: 1.05, text: "漏損（出店機会）→", showarrow: false, xref: "x", yref: "paper", font: { color: "#6B7280" } },
          ],
          xaxis: { title: { text: "Leakage/Surplus Factor" } },
        }}
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">セクター</th>
              <th className="text-right p-2">需要</th>
              <th className="text-right p-2">供給</th>
              <th className="text-right p-2">ギャップ</th>
              <th className="text-right p-2">係数</th>
              <th className="text-left p-2">判定</th>
            </tr>
          </thead>
          <tbody>
            {[...gapData].sort((a, b) => b.factor - a.factor).map((r) => (
              <tr key={r.sector} className="border-b hover:bg-slate-50">
                <td className="p-2">{r.sector}</td>
                <td className="text-right p-2">{formatYen(r.demand)}</td>
                <td className="text-right p-2">{formatYen(r.supply)}</td>
                <td className="text-right p-2">{formatYen(r.demand - r.supply)}</td>
                <td className="text-right p-2 font-mono">{r.factor > 0 ? "+" : ""}{r.factor.toFixed(1)}</td>
                <td className="p-2">{r.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Educational content */}
      <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="font-medium cursor-pointer">ℹ️ 投資判断への活用</summary>
        <div className="mt-2 space-y-2">
          <p>
            漏損（Leakage）は、地域住民の購買力が域外に流出している状態です。
            漏損が大きいセクターは新規出店により購買力を取り戻せる可能性があり、商業不動産の投資機会を示唆します。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs mt-1">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">係数</th>
                  <th className="p-2 text-left">状態</th>
                  <th className="p-2 text-left">投資判断</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b"><td className="p-2">+10以上</td><td className="p-2">漏損（出店機会）</td><td className="p-2">需要 &gt; 供給。新規出店の余地あり</td></tr>
                <tr className="border-b"><td className="p-2">&plusmn;10以内</td><td className="p-2">均衡</td><td className="p-2">需給がほぼ釣り合い</td></tr>
                <tr className="border-b"><td className="p-2">-10以下</td><td className="p-2">余剰（供給過多）</td><td className="p-2">同業種の追加出店はカニバリゼーションのリスク</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs">
            「漏損」「漏出」はいずれも購買力の域外流出を意味します。
          </p>
          <p className="font-medium">計算方法:</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            <li>需要 = 地域人口 × 全国平均の1人あたり小売支出額で按分推計</li>
            <li>供給 = 経済センサスの業種別年間商品販売額</li>
            <li>係数 = (需要 - 供給) ÷ (需要 + 供給) × 100</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
