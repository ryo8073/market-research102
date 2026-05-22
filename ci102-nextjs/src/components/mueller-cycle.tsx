"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/*  Constants & Types                                                  */
/* ------------------------------------------------------------------ */

const COLORS = {
  primary: "#1B2A4A",
  accent: "#D4A843",
  positive: "#2A9D8F",
  negative: "#E76F51",
  neutral: "#6B7280",
};

/** Phase metadata including investment strategy guidance */
const PHASES = {
  Recovery: {
    en: "Recovery", ja: "回復期", color: COLORS.positive,
    icon: "1",
    strategy: "取得好機",
    description: "価格は底を打ち上昇し始めるが、取引量はまだ低迷。市場参加者が少なく、割安物件を仕入れる最良のタイミング。",
    actions: ["割安物件の積極取得", "長期保有を前提としたバリューアッド投資", "テナントリーシングの先行着手"],
    risk: "回復が偽シグナルの可能性。複数四半期の継続確認が重要。",
  },
  Expansion: {
    en: "Expansion", ja: "拡大期", color: COLORS.accent,
    icon: "2",
    strategy: "開発・賃料引き上げ",
    description: "価格・取引量ともに上昇。需要が供給を上回り、空室率が低下。新規開発や賃料改定に好条件。",
    actions: ["新規開発・建て替えの検討", "既存物件の賃料改定", "ポートフォリオ拡大"],
    risk: "過熱感に注意。建設コスト上昇・供給過剰への転換点を監視。",
  },
  Hypersupply: {
    en: "Hypersupply", ja: "供給過剰期", color: COLORS.negative,
    icon: "3",
    strategy: "売却検討・防御",
    description: "取引は活発だが価格が下落し始める。拡大期の開発が完成し供給が需要を上回る局面。",
    actions: ["利益確定の売却判断", "テナントリテンション強化", "新規取得は慎重に"],
    risk: "空室率上昇・賃料下落圧力。レバレッジの高い物件は要注意。",
  },
  Recession: {
    en: "Recession", ja: "後退期", color: COLORS.neutral,
    icon: "4",
    strategy: "現金確保・次の回復に備える",
    description: "価格・取引量ともに低迷。市場は底に向かうが、次の回復期への準備期間でもある。",
    actions: ["キャッシュポジション確保", "ディストレスト物件の調査開始", "既存物件の運営コスト最適化"],
    risk: "底が見えない局面。追加下落リスクとのバランスで判断。",
  },
} as const;

type PhaseName = keyof typeof PHASES;

interface QuarterData {
  period: string;
  medianPrice: number | null;
  count: number;
  priceChangePct: number | null;
  volumeChangePct: number | null;
}

interface PlotDatum {
  period: string;
  priceChangePct: number;
  volumeChangePct: number;
  index: number;
  total: number;
  isLatest: boolean;
  phase: PhaseName;
}

/* ------------------------------------------------------------------ */
/*  Utility Functions                                                  */
/* ------------------------------------------------------------------ */

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function classifyPhase(priceChange: number, volumeChange: number): PhaseName {
  if (priceChange > 0 && volumeChange <= 0) return "Recovery";
  if (priceChange > 0 && volumeChange > 0) return "Expansion";
  if (priceChange <= 0 && volumeChange > 0) return "Hypersupply";
  return "Recession";
}

/** Viridis-like color scale for sequential data points */
function viridisColor(t: number): string {
  const stops = [
    [68, 1, 84], [59, 82, 139], [33, 145, 140],
    [94, 201, 98], [253, 231, 37],
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

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

function MuellerTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d: PlotDatum = payload[0].payload;
  const phase = PHASES[d.phase];
  return (
    <div className="rounded-lg border bg-background px-4 py-3 text-xs shadow-lg max-w-[260px]">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ backgroundColor: phase.color }}
        />
        <span className="font-bold text-sm">{d.period}</span>
        {d.isLatest && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            最新
          </span>
        )}
      </div>
      <div className="space-y-0.5 text-muted-foreground">
        <p>価格変化: <span className="font-semibold text-foreground">{d.priceChangePct >= 0 ? "+" : ""}{d.priceChangePct.toFixed(1)}%</span></p>
        <p>取引量変化: <span className="font-semibold text-foreground">{d.volumeChangePct >= 0 ? "+" : ""}{d.volumeChangePct.toFixed(1)}%</span></p>
        <p className="pt-1 border-t mt-1">フェーズ: <span className="font-semibold" style={{ color: phase.color }}>{phase.ja}</span></p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ideal Cycle Diagram (SVG)                                          */
/* ------------------------------------------------------------------ */

function IdealCycleDiagram({ currentPhase }: { currentPhase: PhaseName | null }) {
  const phases: { name: PhaseName; angle: number }[] = [
    { name: "Recovery", angle: -45 },
    { name: "Expansion", angle: 45 },
    { name: "Hypersupply", angle: 135 },
    { name: "Recession", angle: 225 },
  ];

  const cx = 120, cy = 120, r = 85;

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Mueller サイクル理論</p>
      <svg width={240} height={240} viewBox="0 0 240 240" className="drop-shadow-sm">
        {/* Circular arrow path */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={3} className="dark:stroke-gray-700" />
        {/* Arrow head on circle */}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="4" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#9CA3AF" className="dark:fill-gray-500" />
          </marker>
        </defs>
        <path
          d={`M ${cx + r * Math.cos(-Math.PI / 4)} ${cy + r * Math.sin(-Math.PI / 4)} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(-Math.PI / 4) - 0.01} ${cy + r * Math.sin(-Math.PI / 4) + 0.01}`}
          fill="none"
          stroke="#D1D5DB"
          strokeWidth={2}
          markerEnd="url(#arrowhead)"
          className="dark:stroke-gray-600"
        />

        {phases.map(({ name, angle }) => {
          const rad = (angle * Math.PI) / 180;
          const px = cx + r * Math.cos(rad);
          const py = cy + r * Math.sin(rad);
          const phase = PHASES[name];
          const isCurrent = currentPhase === name;

          return (
            <g key={name}>
              {/* Dot on circle */}
              <circle
                cx={px} cy={py} r={isCurrent ? 14 : 10}
                fill={phase.color}
                opacity={isCurrent ? 1 : 0.35}
                className={isCurrent ? "animate-pulse" : ""}
              />
              <text
                x={px} y={py} textAnchor="middle" dominantBaseline="central"
                className="fill-white text-[9px] font-bold"
              >
                {phase.icon}
              </text>
              {/* Label outside */}
              <text
                x={cx + (r + 30) * Math.cos(rad)}
                y={cy + (r + 30) * Math.sin(rad)}
                textAnchor="middle"
                dominantBaseline="central"
                className={`text-[10px] ${isCurrent ? "font-bold fill-foreground" : "fill-muted-foreground"}`}
              >
                {phase.ja}
              </text>
            </g>
          );
        })}

        {/* Center label */}
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-muted-foreground text-[9px]">不動産</text>
        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">市場サイクル</text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Phase Strategy Panel                                               */
/* ------------------------------------------------------------------ */

function PhaseStrategyPanel({ phase }: { phase: PhaseName }) {
  const p = PHASES[phase];
  return (
    <div
      className="rounded-xl border-2 p-4 space-y-3"
      style={{ borderColor: p.color + "60", backgroundColor: p.color + "08" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold"
          style={{ backgroundColor: p.color }}
        >
          {p.icon}
        </span>
        <div>
          <p className="font-bold text-sm" style={{ color: p.color }}>
            {p.ja}（{p.en}）
          </p>
          <p className="text-xs font-semibold text-muted-foreground">
            戦略: {p.strategy}
          </p>
        </div>
      </div>

      <p className="text-sm leading-relaxed">{p.description}</p>

      <div>
        <p className="text-xs font-semibold mb-1">推奨アクション:</p>
        <ul className="text-sm space-y-1">
          {p.actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              {a}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-background/80 border p-2.5">
        <p className="text-xs">
          <span className="font-semibold text-amber-600 dark:text-amber-400">注意:</span>{" "}
          {p.risk}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reading Guide                                                      */
/* ------------------------------------------------------------------ */

function ReadingGuide() {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <p className="text-sm font-bold text-[#1B2A4A] dark:text-white">このチャートの読み方</p>
      <div className="grid gap-2">
        {[
          {
            step: "1",
            color: COLORS.positive,
            title: "最新四半期の位置を確認",
            desc: "赤いパルスドットが現在の市場フェーズ。どの象限にあるかで、今が回復期・拡大期・供給過剰期・後退期のどれかがわかります。",
          },
          {
            step: "2",
            color: COLORS.accent,
            title: "軌跡の方向を見る",
            desc: "紫→黄色の時系列で「市場がどこから来てどこへ向かうか」がわかります。時計回りならMuellerの典型的サイクルに沿っています。",
          },
          {
            step: "3",
            color: COLORS.primary,
            title: "投資戦略を決定",
            desc: "現在のフェーズに対応する戦略パネル（右側）の推奨アクションを確認し、ポートフォリオへの影響を判断します。",
          },
        ].map((g) => (
          <div key={g.step} className="flex gap-3 items-start">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0 mt-0.5"
              style={{ backgroundColor: g.color }}
            >
              {g.step}
            </span>
            <div>
              <p className="text-sm font-semibold">{g.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{g.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

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
      if (q < 1) { q = 4; y -= 1; }
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
            rows.push({ period: `${p.year}Q${p.quarter}`, medianPrice: null, count: 0, priceChangePct: null, volumeChangePct: null });
            continue;
          }

          const data: any[] = json.data;
          const unitPrices = data.map((d: any) => Number(d.UnitPrice)).filter((v: number) => v > 0);

          rows.push({
            period: `${p.year}Q${p.quarter}`,
            medianPrice: median(unitPrices),
            count: data.length,
            priceChangePct: null,
            volumeChangePct: null,
          });
        } catch {
          rows.push({ period: `${p.year}Q${p.quarter}`, medianPrice: null, count: 0, priceChangePct: null, volumeChangePct: null });
        }
      }

      const valid = rows.filter((r) => r.medianPrice !== null);

      for (let i = 1; i < valid.length; i++) {
        const prev = valid[i - 1];
        const curr = valid[i];
        if (prev.medianPrice && curr.medianPrice) {
          curr.priceChangePct = ((curr.medianPrice - prev.medianPrice) / prev.medianPrice) * 100;
        }
        if (prev.count > 0) {
          curr.volumeChangePct = ((curr.count - prev.count) / prev.count) * 100;
        }
      }

      if (!cancelled) {
        setQuarters(valid);
        setLoading(false);
      }
    };

    fetchAll().catch((e) => {
      if (!cancelled) { setError(String(e)); setLoading(false); }
    });

    return () => { cancelled = true; };
  }, [prefCode, cityCode]);

  const plotData = useMemo<PlotDatum[]>(() => {
    const valid = quarters.filter(
      (q) => q.priceChangePct !== null && q.volumeChangePct !== null
    );
    return valid.map((q, i) => ({
      period: q.period,
      priceChangePct: q.priceChangePct!,
      volumeChangePct: q.volumeChangePct!,
      index: i,
      total: valid.length,
      isLatest: i === valid.length - 1,
      phase: classifyPhase(q.priceChangePct!, q.volumeChangePct!),
    }));
  }, [quarters]);

  const latestQuarter = plotData.length > 0 ? plotData[plotData.length - 1] : null;
  const currentPhase = latestQuarter?.phase ?? null;

  // Compute domain with padding
  const xVals = plotData.map((d) => d.priceChangePct);
  const yVals = plotData.map((d) => d.volumeChangePct);
  const xAbsMax = Math.max(Math.abs(Math.min(...xVals, 0)), Math.abs(Math.max(...xVals, 0)), 5);
  const yAbsMax = Math.max(Math.abs(Math.min(...yVals, 0)), Math.abs(Math.max(...yVals, 0)), 5);
  const xDomain = [-xAbsMax * 1.3, xAbsMax * 1.3];
  const yDomain = [-yAbsMax * 1.3, yAbsMax * 1.3];

  /* ---------- Loading / Error / Empty states ---------- */

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mueller 不動産市場サイクル</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground animate-pulse">
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
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
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

  /* ---------- Main Render ---------- */

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-3 flex-wrap">
          Mueller 不動産市場サイクル
          {currentPhase && (
            <span
              className="text-sm font-normal px-3 py-1 rounded-full"
              style={{
                backgroundColor: PHASES[currentPhase].color + "18",
                color: PHASES[currentPhase].color,
                border: `1px solid ${PHASES[currentPhase].color}40`,
              }}
            >
              現在: {PHASES[currentPhase].ja}（{PHASES[currentPhase].en}）
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          MLIT不動産取引データ（直近8四半期）の㎡単価中央値と取引件数の前四半期比変化率から、市場サイクルのフェーズを判定します。
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ---- Chart + Strategy Panel ---- */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Scatter Chart with quadrant backgrounds */}
          <div className="space-y-3">
            <div aria-label="Mueller不動産市場サイクル散布図">
              <ResponsiveContainer width="100%" height={440}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 55, left: 65 }}>
                  {/* Quadrant background areas */}
                  <ReferenceArea
                    x1={0} x2={xDomain[1]} y1={0} y2={yDomain[1]}
                    fill={COLORS.accent} fillOpacity={0.06}
                    label={{ value: "拡大期", position: "insideTopRight", fontSize: 11, fill: COLORS.accent, fontWeight: 600 }}
                  />
                  <ReferenceArea
                    x1={xDomain[0]} x2={0} y1={0} y2={yDomain[1]}
                    fill={COLORS.negative} fillOpacity={0.06}
                    label={{ value: "供給過剰期", position: "insideTopLeft", fontSize: 11, fill: COLORS.negative, fontWeight: 600 }}
                  />
                  <ReferenceArea
                    x1={0} x2={xDomain[1]} y1={yDomain[0]} y2={0}
                    fill={COLORS.positive} fillOpacity={0.06}
                    label={{ value: "回復期", position: "insideBottomRight", fontSize: 11, fill: COLORS.positive, fontWeight: 600 }}
                  />
                  <ReferenceArea
                    x1={xDomain[0]} x2={0} y1={yDomain[0]} y2={0}
                    fill={COLORS.neutral} fillOpacity={0.06}
                    label={{ value: "後退期", position: "insideBottomLeft", fontSize: 11, fill: COLORS.neutral, fontWeight: 600 }}
                  />

                  <XAxis
                    dataKey="priceChangePct" type="number"
                    domain={xDomain}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                    label={{ value: "㎡単価変化率（%、前四半期比）", position: "bottom", offset: 15, fontSize: 12 }}
                  />
                  <YAxis
                    dataKey="volumeChangePct" type="number"
                    domain={yDomain}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                    label={{ value: "取引量変化率（%）", angle: -90, position: "insideLeft", offset: -15, fontSize: 12 }}
                  />
                  <Tooltip content={<MuellerTooltip />} />
                  <ReferenceLine x={0} stroke={COLORS.neutral} strokeWidth={1.5} strokeDasharray="4 4" />
                  <ReferenceLine y={0} stroke={COLORS.neutral} strokeWidth={1.5} strokeDasharray="4 4" />

                  {/* Trajectory line + scatter points */}
                  <Scatter
                    data={plotData}
                    line={{ stroke: COLORS.primary, strokeWidth: 2, strokeDasharray: "6 3" }}
                    lineType="joint"
                  >
                    {plotData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.isLatest ? "#DC2626" : viridisColor(d.index / Math.max(d.total - 1, 1))}
                        r={d.isLatest ? 12 : 7}
                        stroke={d.isLatest ? "#DC2626" : "none"}
                        strokeWidth={d.isLatest ? 3 : 0}
                      />
                    ))}
                    <LabelList
                      dataKey="period"
                      position="top"
                      offset={12}
                      fontSize={9}
                      fill="#6B7280"
                      formatter={(v: unknown) => {
                        const s = String(v ?? "");
                        const idx = plotData.findIndex((d) => d.period === s);
                        if (idx === 0 || idx === plotData.length - 1 || idx === Math.floor(plotData.length / 2)) return s;
                        return "";
                      }}
                    />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Timeline legend */}
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: "linear-gradient(135deg, rgb(68,1,84), rgb(253,231,37))" }} />
                <span className="text-[10px] text-muted-foreground">過去</span>
                <div className="w-16 h-0.5 bg-gradient-to-r from-purple-800 to-yellow-400 rounded" />
                <span className="text-[10px] text-muted-foreground">現在</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
                </span>
                <span className="text-[10px] text-muted-foreground">最新四半期</span>
              </div>
            </div>

            {/* Period detail pills */}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {plotData.map((d) => {
                const phaseColor = PHASES[d.phase].color;
                return (
                  <span
                    key={d.period}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: d.isLatest ? "#DC2626" : phaseColor + "40",
                      backgroundColor: d.isLatest ? "#DC262610" : phaseColor + "08",
                      color: d.isLatest ? "#DC2626" : undefined,
                    }}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: d.isLatest ? "#DC2626" : viridisColor(d.index / Math.max(d.total - 1, 1)),
                      }}
                    />
                    {d.period}
                    <span className="text-muted-foreground">({PHASES[d.phase].ja})</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Right panel: Ideal cycle + Strategy */}
          <div className="space-y-4">
            <IdealCycleDiagram currentPhase={currentPhase} />
            {currentPhase && <PhaseStrategyPanel phase={currentPhase} />}
          </div>
        </div>

        {/* ---- Reading Guide ---- */}
        <ReadingGuide />

        {/* ---- Data source note ---- */}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          データソース: 国土交通省 不動産取引価格情報（MLIT API）。㎡単価の中央値と取引件数の前四半期比変化率を算出。
          Mueller市場サイクルは理論的モデルであり、実際の市場は必ずしも4フェーズを均等に通過するわけではありません。
          投資判断の参考情報としてご利用ください。
        </p>
      </CardContent>
    </Card>
  );
}
