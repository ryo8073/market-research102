"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PlotlyChart = dynamic(() => import("@/components/plotly-chart"), {
  ssr: false,
  loading: () => (
    <div className="h-[550px] flex items-center justify-center text-muted-foreground animate-pulse">
      チャート読込中...
    </div>
  ),
});

const COLORS = {
  primary: "#1B2A4A",
  accent: "#D4A843",
  positive: "#2A9D8F",
  negative: "#E76F51",
  neutral: "#6B7280",
};

interface QuarterData {
  period: string;
  medianPrice: number | null;
  count: number;
  priceChangePct: number | null;
  volumeChangePct: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classifyCyclePhase(
  priceChange: number,
  volumeChange: number
): { en: string; ja: string; color: string } {
  if (priceChange > 0 && volumeChange <= 0) {
    return { en: "Recovery", ja: "回復期", color: COLORS.positive };
  } else if (priceChange > 0 && volumeChange > 0) {
    return { en: "Expansion", ja: "拡大期", color: COLORS.accent };
  } else if (priceChange <= 0 && volumeChange > 0) {
    return { en: "Hypersupply", ja: "供給過剰期", color: COLORS.negative };
  } else {
    return { en: "Recession", ja: "後退期", color: COLORS.neutral };
  }
}

interface Props {
  prefCode: number;
  cityCode?: number;
}

export default function MuellerCycle({ prefCode, cityCode }: Props) {
  const [quarters, setQuarters] = useState<QuarterData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Fetch 8 quarters going backwards from 2024Q1
    const baseYear = 2024;
    const baseQuarter = 1;
    const periods: { year: number; quarter: number }[] = [];
    let y = baseYear;
    let q = baseQuarter;
    for (let i = 0; i < 8; i++) {
      periods.push({ year: y, quarter: q });
      q -= 1;
      if (q < 1) {
        q = 4;
        y -= 1;
      }
    }
    // Reverse so oldest first
    periods.reverse();

    const fetchAll = async () => {
      const rows: QuarterData[] = [];

      for (const p of periods) {
        try {
          const params = new URLSearchParams({
            prefCode: String(prefCode),
            year: String(p.year),
            quarter: String(p.quarter),
          });
          if (cityCode && cityCode % 1000 !== 0) {
            params.set("cityCode", String(cityCode));
          }

          const res = await fetch(`/api/mlit?${params}`);
          const json = await res.json();

          if (json.error || !json.data) {
            rows.push({
              period: `${p.year}Q${p.quarter}`,
              medianPrice: null,
              count: 0,
              priceChangePct: null,
              volumeChangePct: null,
            });
            continue;
          }

          const data: any[] = json.data;
          const unitPrices = data
            .map((d: any) => Number(d.UnitPrice))
            .filter((v: number) => v > 0);

          rows.push({
            period: `${p.year}Q${p.quarter}`,
            medianPrice: median(unitPrices),
            count: data.length,
            priceChangePct: null,
            volumeChangePct: null,
          });
        } catch {
          rows.push({
            period: `${p.year}Q${p.quarter}`,
            medianPrice: null,
            count: 0,
            priceChangePct: null,
            volumeChangePct: null,
          });
        }
      }

      // Filter to rows with valid median price
      const valid = rows.filter((r) => r.medianPrice !== null);

      // Compute quarter-over-quarter changes
      for (let i = 1; i < valid.length; i++) {
        const prev = valid[i - 1];
        const curr = valid[i];
        if (prev.medianPrice && curr.medianPrice) {
          curr.priceChangePct =
            ((curr.medianPrice - prev.medianPrice) / prev.medianPrice) * 100;
        }
        if (prev.count > 0) {
          curr.volumeChangePct =
            ((curr.count - prev.count) / prev.count) * 100;
        }
      }

      if (!cancelled) {
        setQuarters(valid);
        setLoading(false);
      }
    };

    fetchAll().catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [prefCode, cityCode]);

  // Quarters with both changes computed (skip the first which has no previous)
  const plotData = useMemo(
    () =>
      quarters.filter(
        (q) => q.priceChangePct !== null && q.volumeChangePct !== null
      ),
    [quarters]
  );

  const latestQuarter = plotData.length > 0 ? plotData[plotData.length - 1] : null;
  const phase = latestQuarter
    ? classifyCyclePhase(
        latestQuarter.priceChangePct!,
        latestQuarter.volumeChangePct!
      )
    : null;

  // Compute axis ranges
  const xValues = plotData.map((q) => q.priceChangePct!);
  const yValues = plotData.map((q) => q.volumeChangePct!);
  const xRange = Math.max(
    Math.abs(Math.max(...xValues, 0)),
    Math.abs(Math.min(...xValues, 0)),
    10
  );
  const yRange = Math.max(
    Math.abs(Math.max(...yValues, 0)),
    Math.abs(Math.min(...yValues, 0)),
    10
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mueller 不動産市場サイクル</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[550px] flex items-center justify-center text-muted-foreground animate-pulse">
            8四半期分のMLITデータを取得中...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mueller 不動産市場サイクル</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (plotData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mueller 不動産市場サイクル</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            データ不足 -- 2四半期以上の有効な取引データが必要です。
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-3">
          Mueller 不動産市場サイクル
          {phase && (
            <span
              className="text-sm font-normal px-2 py-0.5 rounded"
              style={{ backgroundColor: phase.color + "20", color: phase.color }}
            >
              {phase.en}（{phase.ja}）
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PlotlyChart
          data={[
            // Trail line with gradient markers
            {
              type: "scatter" as const,
              mode: "text+lines+markers" as const,
              x: xValues,
              y: yValues,
              text: plotData.map((q) => q.period),
              textposition: "top center" as const,
              textfont: { size: 9 },
              marker: {
                size: 10,
                color: plotData.map((_, i) => i),
                colorscale: "Viridis",
              },
              line: { color: COLORS.primary, width: 2 },
              hovertemplate:
                "<b>%{text}</b><br>価格変化: %{x:.1f}%<br>取引量変化: %{y:.1f}%<extra></extra>",
              showlegend: false,
            },
            // Latest point - red star
            {
              type: "scatter" as const,
              mode: "markers" as const,
              x: [latestQuarter!.priceChangePct],
              y: [latestQuarter!.volumeChangePct],
              marker: { size: 16, color: "red", symbol: "star" },
              name: "最新",
              showlegend: false,
              hoverinfo: "skip" as const,
            },
          ]}
          layout={{
            title: { text: "" },
            height: 550,
            xaxis: {
              title: { text: "㎡単価変化率（%、前四半期比）" },
              zeroline: true,
              zerolinecolor: COLORS.neutral,
              zerolinewidth: 1.5,
              gridcolor: "#e5e7eb",
              range: [-xRange * 1.3, xRange * 1.3],
            },
            yaxis: {
              title: { text: "取引量変化率（%、前四半期比）" },
              zeroline: true,
              zerolinecolor: COLORS.neutral,
              zerolinewidth: 1.5,
              gridcolor: "#e5e7eb",
              range: [-yRange * 1.3, yRange * 1.3],
            },
            showlegend: false,
            shapes: [
              // Recovery (price up, volume down) - bottom right
              {
                type: "rect",
                x0: 0, x1: xRange * 1.3, y0: -yRange * 1.3, y1: 0,
                fillcolor: "rgba(42,157,143,0.08)",
                line: { width: 0 },
                layer: "below",
              },
              // Expansion (price up, volume up) - top right
              {
                type: "rect",
                x0: 0, x1: xRange * 1.3, y0: 0, y1: yRange * 1.3,
                fillcolor: "rgba(212,168,67,0.08)",
                line: { width: 0 },
                layer: "below",
              },
              // Hypersupply (price down, volume up) - top left
              {
                type: "rect",
                x0: -xRange * 1.3, x1: 0, y0: 0, y1: yRange * 1.3,
                fillcolor: "rgba(231,111,81,0.08)",
                line: { width: 0 },
                layer: "below",
              },
              // Recession (price down, volume down) - bottom left
              {
                type: "rect",
                x0: -xRange * 1.3, x1: 0, y0: -yRange * 1.3, y1: 0,
                fillcolor: "rgba(107,114,128,0.08)",
                line: { width: 0 },
                layer: "below",
              },
            ],
            annotations: [
              {
                x: xRange * 0.7,
                y: -yRange * 0.85,
                text: "Recovery<br>（回復期）",
                showarrow: false,
                font: { color: COLORS.positive, size: 13 },
              },
              {
                x: xRange * 0.7,
                y: yRange * 0.85,
                text: "Expansion<br>（拡大期）",
                showarrow: false,
                font: { color: COLORS.accent, size: 13 },
              },
              {
                x: -xRange * 0.7,
                y: yRange * 0.85,
                text: "Hypersupply<br>（供給過剰）",
                showarrow: false,
                font: { color: COLORS.negative, size: 13 },
              },
              {
                x: -xRange * 0.7,
                y: -yRange * 0.85,
                text: "Recession<br>（後退期）",
                showarrow: false,
                font: { color: COLORS.neutral, size: 13 },
              },
            ],
            margin: { t: 20, b: 60, l: 70, r: 20 },
          }}
        />
        <p className="text-xs text-muted-foreground mt-2">
          Mueller市場サイクル: MLIT不動産取引データ（直近8四半期）の㎡単価中央値と取引件数の前四半期比変化率から算出。
          赤い星が最新四半期の位置を示します。
        </p>
      </CardContent>
    </Card>
  );
}
