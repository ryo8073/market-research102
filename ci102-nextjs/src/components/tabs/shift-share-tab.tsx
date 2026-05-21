"use client";

import { useMemo } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShiftShareResult } from "@/lib/calculator";
import type { MunicipalityData } from "@/lib/use-municipality-data";

interface Props {
  precomputed: ShiftShareResult[];
  selectedCity?: MunicipalityData | null;
}

export default function ShiftShareTab({ precomputed, selectedCity }: Props) {
  const ssData = useMemo(() => [...precomputed].sort((a, b) => b.regional_shift - a.regional_shift), [precomputed]);

  const stars = ssData.filter((r) => r.regional_shift > 0 && r.actual_change > 0);

  return (
    <div className="space-y-6">
      {/* Municipality highlight */}
      {selectedCity && (
        <div className="rounded-lg border p-4" style={{ backgroundColor: "#f0f9ff" }}>
          <h3 className="font-semibold mb-3">{selectedCity.area_name} — 市区町村データ</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">総雇用</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.total_emp.toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">基盤雇用</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{Math.round(selectedCity.basic_emp).toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">最大LQ産業</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{selectedCity.max_lq.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">{selectedCity.max_lq_industry}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">セグメント</CardTitle></CardHeader>
              <CardContent><div className="text-sm font-bold">{selectedCity.segment ?? "—"}</div></CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground mt-2">シフトシェア分析は都道府県レベルのデータです。市区町村別の経済構造変化は上記指標を参照してください。</p>
        </div>
      )}

      {/* Stacked bar chart: NS + IM + RS */}
      {(() => {
        const chartData = ssData.map((r) => ({
          industry: r.industry,
          ns: Math.round(r.national_growth),
          im: Math.round(r.industry_mix),
          rs: Math.round(r.regional_shift),
          actual: Math.round(r.actual_change),
        }));
        return (
          <div aria-label="シフトシェア分析 3要因分解チャート">
            <h3 className="text-sm font-semibold mb-2">シフトシェア分析（NS / IM / RS 3要因分解）</h3>
            <ResponsiveContainer width="100%" height={Math.max(500, chartData.length * 35)}>
              <ComposedChart data={chartData} layout="vertical" margin={{ left: 140, right: 30, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="industry" width={130} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--background, #fff)", borderColor: "var(--border, #e5e7eb)" }}
                  formatter={(value, name) => [Number(value).toLocaleString(), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ns" name="NS（全国成長）" fill="#6B7280" stackId="a" />
                <Bar dataKey="im" name="IM（産業構成）" fill="#D4A843" stackId="a" />
                <Bar dataKey="rs" name="RS（地域シフト）" fill="#2A9D8F" stackId="a" />
                <Line
                  dataKey="actual"
                  name="実際の変化"
                  stroke="#E76F51"
                  strokeWidth={0}
                  dot={{ r: 5, fill: "#E76F51", stroke: "#E76F51" }}
                  legendType="diamond"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Star industries */}
      {stars.length > 0 && (
        <div className="rounded-lg border-l-4 p-4" style={{ borderLeftColor: "#2A9D8F", backgroundColor: "#f0fdf4" }}>
          <p className="text-sm font-medium">
            競争優位を持つスター産業: {stars.map((r) => r.industry).join("、")}
          </p>
        </div>
      )}

      {/* Data table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">産業</th>
              <th className="text-right p-2">実際の変化</th>
              <th className="text-right p-2">NS</th>
              <th className="text-right p-2">IM</th>
              <th className="text-right p-2">RS</th>
            </tr>
          </thead>
          <tbody>
            {ssData.sort((a, b) => b.regional_shift - a.regional_shift).map((r) => (
              <tr key={r.industry} className="border-b hover:bg-muted/50 cursor-default transition-colors">
                <td className="p-2">{r.industry}</td>
                <td className="text-right p-2 font-mono">{r.actual_change.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })}</td>
                <td className="text-right p-2 font-mono">{r.national_growth.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })}</td>
                <td className="text-right p-2 font-mono">{r.industry_mix.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })}</td>
                <td className="text-right p-2 font-mono" style={{ color: r.regional_shift > 0 ? "#2A9D8F" : "#E76F51" }}>
                  {r.regional_shift.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Educational content */}
      <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="font-medium cursor-pointer">ℹ️ 投資判断への活用</summary>
        <div className="mt-2 space-y-2">
          <p>シフトシェア分析は、地域の雇用変動を3つの要因に分解します。</p>
          <table className="w-full text-sm border-collapse mt-1">
            <thead>
              <tr className="border-b">
                <th className="text-left p-1">要因</th>
                <th className="text-left p-1">意味</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-1 font-medium">NS（国家成長）</td>
                <td className="p-1">全国経済の成長に乗った自然成長分</td>
              </tr>
              <tr className="border-b">
                <td className="p-1 font-medium">IM（産業ミックス）</td>
                <td className="p-1">成長産業が多い/少ないことによる有利・不利</td>
              </tr>
              <tr className="border-b">
                <td className="p-1 font-medium">RS（地域シフト）</td>
                <td className="p-1">最重要。同じ産業の全国平均をどれだけ上回ったか</td>
              </tr>
            </tbody>
          </table>
          <p>
            投資判断: RS &gt; 0 の産業 = その地域に固有の競争力がある「スター産業」。関連不動産は安定需要が見込めます。RS &lt; 0 の産業は衰退リスクがあり、関連不動産の空室率上昇に注意が必要です。
          </p>
          <p className="font-mono text-xs">
            恒等式: 実際の雇用変化 = NS + IM + RS（必ず一致します）
          </p>
        </div>
      </details>
    </div>
  );
}
