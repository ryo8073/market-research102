"use client";

import { useMemo } from "react";
import PlotlyChart from "@/components/plotly-chart";
import { shift_share_table } from "@/lib/calculator";

interface Props {
  localT0: Record<string, number>;
  localT1: Record<string, number>;
  nationalT0: Record<string, number>;
  nationalT1: Record<string, number>;
}

export default function ShiftShareTab({ localT0, localT1, nationalT0, nationalT1 }: Props) {
  const ssData = useMemo(() => shift_share_table(localT0, localT1, nationalT0, nationalT1), [localT0, localT1, nationalT0, nationalT1]);

  const industries = ssData.map((r) => r.industry);
  const stars = ssData.filter((r) => r.regional_shift > 0 && r.actual_change > 0);

  return (
    <div className="space-y-6">
      {/* Stacked bar chart: NS + IM + RS */}
      <PlotlyChart
        data={[
          {
            type: "bar", name: "NS（全国成長）",
            x: industries, y: ssData.map((r) => r.national_growth),
            marker: { color: "#6B7280" },
          },
          {
            type: "bar", name: "IM（産業構成）",
            x: industries, y: ssData.map((r) => r.industry_mix),
            marker: { color: "#D4A843" },
          },
          {
            type: "bar", name: "RS（地域シフト）",
            x: industries, y: ssData.map((r) => r.regional_shift),
            marker: { color: "#2A9D8F" },
          },
          {
            type: "scatter", name: "実際の変化",
            x: industries, y: ssData.map((r) => r.actual_change),
            mode: "markers", marker: { color: "#E76F51", size: 10, symbol: "diamond" },
          },
        ]}
        layout={{
          title: { text: "シフトシェア分析（NS / IM / RS 3要因分解）" },
          barmode: "relative",
          height: 500,
          legend: { orientation: "h", y: -0.2 },
        }}
      />

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
              <tr key={r.industry} className="border-b hover:bg-slate-50">
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
    </div>
  );
}
