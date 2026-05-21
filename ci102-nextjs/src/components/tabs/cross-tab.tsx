"use client";

import { useMemo } from "react";
import PlotlyChart from "@/components/plotly-chart";
import { Card, CardContent } from "@/components/ui/card";
import {
  lq_table, total_basic_employment, economic_base_multiplier,
  gap_analysis_table, leakage_surplus_factor,
} from "@/lib/calculator";

interface AreaData {
  name: string;
  prefCode: number;
  localEmp: Record<string, number>;
  nationalEmp: Record<string, number>;
  retailSectors: Array<{ sector: string; demand: number; supply: number }>;
  medianUnitPrice?: number;
}

interface Props {
  areas: AreaData[];
  highlightPrefCode?: number;
}

export default function CrossTab({ areas, highlightPrefCode }: Props) {
  const crossData = useMemo(() => {
    return areas.map((area) => {
      const lq = lq_table(area.localEmp, area.nationalEmp);
      const basic = total_basic_employment(lq);
      const totalEmp = lq.reduce((s, r) => s + r.local_emp, 0);
      const ebm = economic_base_multiplier(totalEmp, basic);

      const gap = gap_analysis_table(area.retailSectors);
      const totalDemand = gap.reduce((s, r) => s + r.demand, 0);
      const totalSupply = gap.reduce((s, r) => s + r.supply, 0);
      const aggGap = (totalDemand + totalSupply) > 0
        ? ((totalDemand - totalSupply) / (totalDemand + totalSupply)) * 100
        : 0;

      return {
        name: area.name,
        prefCode: area.prefCode,
        gapFactor: aggGap,
        medianPrice: area.medianUnitPrice ?? 0,
        ebm,
      };
    }).filter((d) => d.medianPrice > 0);
  }, [areas]);

  if (crossData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        クロス分析には複数地域の取引価格データが必要です。
        <br />MLIT APIから取得後に表示されます。
      </div>
    );
  }

  const priceMedian = crossData.reduce((s, d) => s + d.medianPrice, 0) / crossData.length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-slate-50 p-4 text-sm">
        <p className="font-medium mb-2">4象限の読み方</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded" style={{ backgroundColor: "rgba(42,157,143,0.1)" }}>
            <strong>右下: 需要あり × 安い = 最優先</strong>
          </div>
          <div className="p-2 rounded" style={{ backgroundColor: "rgba(212,168,67,0.1)" }}>
            <strong>右上: 需要あり × 高い = コスト注意</strong>
          </div>
          <div className="p-2 rounded" style={{ backgroundColor: "rgba(107,114,128,0.1)" }}>
            <strong>左下: 余剰 × 安い = 様子見</strong>
          </div>
          <div className="p-2 rounded" style={{ backgroundColor: "rgba(231,111,81,0.1)" }}>
            <strong>左上: 余剰 × 高い = 回避</strong>
          </div>
        </div>
      </div>

      <PlotlyChart
        data={[
          {
            type: "scatter",
            mode: "markers+text" as any,
            x: crossData.map((d) => d.gapFactor),
            y: crossData.map((d) => d.medianPrice),
            text: crossData.map((d) => d.name),
            textposition: "top center",
            textfont: { size: 9 },
            marker: {
              size: 10,
              color: crossData.map((d) => d.ebm),
              colorscale: "Viridis",
              colorbar: { title: { text: "EBM" } },
              showscale: true,
            },
            hovertemplate: "<b>%{text}</b><br>漏損/余剰: %{x:.1f}<br>㎡単価: ¥%{y:,.0f}<extra></extra>",
          },
        ]}
        layout={{
          title: { text: "小売ギャップ × 取引単価 クロス分析" },
          xaxis: { title: { text: "小売漏損/余剰係数" } },
          yaxis: { title: { text: "㎡単価中央値（円）" } },
          height: 600,
          shapes: [
            { type: "line", x0: 0, x1: 0, y0: 0, y1: 1, xref: "x", yref: "paper", line: { dash: "dash", color: "#6B7280" } },
            { type: "line", x0: 0, x1: 1, y0: priceMedian, y1: priceMedian, xref: "paper", yref: "y", line: { dash: "dash", color: "#6B7280" } },
          ],
          showlegend: false,
        }}
      />
    </div>
  );
}
