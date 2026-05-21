"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

/** Viridis-like color scale for sequential data points */
function viridisColor(t: number): string {
  // Simplified 5-stop viridis
  const stops = [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ];
  const idx = Math.min(t, 0.999) * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const f = idx - lo;
  const r = Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f);
  const g = Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f);
  const b = Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f);
  return `rgb(${r},${g},${b})`;
}

interface PlotDatum {
  period: string;
  priceChangePct: number;
  volumeChangePct: number;
  index: number;
  isLatest: boolean;
}

function MuellerTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d: PlotDatum = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{d.period}{d.isLatest ? " (最新)" : ""}</p>
      <p>価格変化: {d.priceChangePct.toFixed(1)}%</p>
      <p>取引量変化: {d.volumeChangePct.toFixed(1)}%</p>
    </div>
  );
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

      const valid = rows.filter((r) => r.medianPrice !== null);

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

  const plotData = useMemo<PlotDatum[]>(
    () => {
      const valid = quarters.filter(
        (q) => q.priceChangePct !== null && q.volumeChangePct !== null
      );
      return valid.map((q, i) => ({
        period: q.period,
        priceChangePct: q.priceChangePct!,
        volumeChangePct: q.volumeChangePct!,
        index: i,
        isLatest: i === valid.length - 1,
      }));
    },
    [quarters]
  );

  const latestQuarter = plotData.length > 0 ? plotData[plotData.length - 1] : null;
  const phase = latestQuarter
    ? classifyCyclePhase(latestQuarter.priceChangePct, latestQuarter.volumeChangePct)
    : null;

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
        {/* Quadrant labels */}
        <div className="grid grid-cols-2 gap-1 text-xs text-center mb-2">
          <div className="rounded py-1" style={{ backgroundColor: "rgba(231,111,81,0.08)", color: COLORS.negative }}>
            Hypersupply（供給過剰）
          </div>
          <div className="rounded py-1" style={{ backgroundColor: "rgba(212,168,67,0.08)", color: COLORS.accent }}>
            Expansion（拡大期）
          </div>
          <div className="rounded py-1" style={{ backgroundColor: "rgba(107,114,128,0.08)", color: COLORS.neutral }}>
            Recession（後退期）
          </div>
          <div className="rounded py-1" style={{ backgroundColor: "rgba(42,157,143,0.08)", color: COLORS.positive }}>
            Recovery（回復期）
          </div>
        </div>

        <div aria-label="Mueller不動産市場サイクル散布図">
          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 50, left: 60 }}>
              <XAxis
                dataKey="priceChangePct"
                type="number"
                name="価格変化率"
                tick={{ fontSize: 11 }}
                label={{ value: "㎡単価変化率（%、前四半期比）", position: "bottom", offset: 10, fontSize: 12 }}
              />
              <YAxis
                dataKey="volumeChangePct"
                type="number"
                name="取引量変化率"
                tick={{ fontSize: 11 }}
                label={{ value: "取引量変化率（%）", angle: -90, position: "insideLeft", offset: -10, fontSize: 12 }}
              />
              <Tooltip content={<MuellerTooltip />} />
              <ReferenceLine x={0} stroke={COLORS.neutral} strokeWidth={1.5} />
              <ReferenceLine y={0} stroke={COLORS.neutral} strokeWidth={1.5} />
              <Scatter data={plotData} line={{ stroke: COLORS.primary, strokeWidth: 2 }}>
                {plotData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.isLatest ? "#DC2626" : viridisColor(d.index / Math.max(plotData.length - 1, 1))}
                    r={d.isLatest ? 10 : 6}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Period labels under chart */}
        <div className="flex flex-wrap gap-2 justify-center mt-2 text-xs text-muted-foreground">
          {plotData.map((d) => (
            <span key={d.period} className="flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: d.isLatest
                    ? "#DC2626"
                    : viridisColor(d.index / Math.max(plotData.length - 1, 1)),
                }}
              />
              {d.period}
            </span>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Mueller市場サイクル: MLIT不動産取引データ（直近8四半期）の㎡単価中央値と取引件数の前四半期比変化率から算出。
          赤い丸が最新四半期の位置を示します。
        </p>
      </CardContent>
    </Card>
  );
}
