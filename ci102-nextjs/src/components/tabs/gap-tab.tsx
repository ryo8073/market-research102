"use client";

import { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gap_analysis_table, type GapRow } from "@/lib/calculator";
import type { MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";

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
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const gapData = useMemo(() => gap_analysis_table(sectors), [sectors]);
  const sorted = useMemo(() => [...gapData].sort((a, b) => a.factor - b.factor), [gapData]);
  const leakage = gapData.filter((r) => r.factor >= 10).length;
  const surplus = gapData.filter((r) => r.factor <= -10).length;
  const maxLeak = gapData.reduce((max, r) => (r.factor > max.factor ? r : max), gapData[0]);

  const maxAbsFactor = useMemo(() => {
    const m = Math.max(...sorted.map((d) => Math.abs(d.factor)), 10);
    return Math.ceil(m / 10) * 10;
  }, [sorted]);

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

      {/* Reading Guide */}
      <ReadingGuide steps={[
        { title: "右に伸びるバーに注目", description: "右方向（正の値）は漏損=出店機会。域内住民の購買力が域外に流出しており、新規出店で取り戻せる。" },
        { title: "係数の大きさで優先順位を付ける", description: "+10以上が有意な漏損。大きいほど未充足の需要が大きく、商業施設・テナントの投資妙味が高い。" },
        { title: "左に伸びるバーは競争過多", description: "負の値は余剰。既存店舗が多く新規出店はカニバリゼーションのリスク。テナント誘致には別の切り口が必要。" },
      ]} />

      {/* Gap Bar Chart — Recharts horizontal bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1 px-2">
          <span>← 余剰（供給過多）</span>
          <span>漏損/余剰係数</span>
          <span>漏損（出店機会）→</span>
        </div>
        <div aria-label="漏損余剰係数の横棒グラフ">
          <ResponsiveContainer width="100%" height={Math.max(400, sorted.length * 40)}>
            <BarChart data={sorted} layout="vertical" margin={{ left: 120, right: 30, top: 10, bottom: 10 }}>
              <XAxis
                type="number"
                domain={[-maxAbsFactor, maxAbsFactor]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => String(v)}
              />
              <YAxis
                type="category"
                dataKey="sector"
                width={110}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => { const v = Number(value); return [`${v > 0 ? "+" : ""}${v.toFixed(1)}`, "係数"]; }}
                labelFormatter={(label) => String(label)}
              />
              <ReferenceLine x={0} stroke="#6B7280" strokeWidth={2} />
              <ReferenceLine x={10} stroke="#2A9D8F" strokeDasharray="3 3" strokeWidth={1} label={{ value: "+10", fontSize: 9, fill: "#2A9D8F", position: "top" }} />
              <ReferenceLine x={-10} stroke="#E76F51" strokeDasharray="3 3" strokeWidth={1} label={{ value: "-10", fontSize: 9, fill: "#E76F51", position: "top" }} />
              <Bar
                dataKey="factor"
                radius={[0, 4, 4, 0]}
                onMouseEnter={(_: unknown, idx: number) => setHoveredSector(sorted[idx]?.sector ?? null)}
                onMouseLeave={() => setHoveredSector(null)}
              >
                {sorted.map((d, i) => (
                  <Cell key={i} fill={d.factor >= 10 ? "#2A9D8F" : d.factor <= -10 ? "#E76F51" : "#D4A843"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Butterfly Chart: Demand vs Supply */}
      <div aria-label="需要vs供給バタフライチャート">
        <h3 className="text-sm font-semibold mb-1">需要 vs 供給（バタフライ比較）</h3>
        <p className="text-xs text-muted-foreground mb-2">
          左=供給（域内の年間販売額）、右=需要（推定購買力）。右に長い=漏損（域外流出）、左に長い=余剰（供給過多）。
        </p>
        {(() => {
          const maxVal = Math.max(...gapData.map((d) => Math.max(d.demand, d.supply)));
          const butterflyData = [...gapData].sort((a, b) => b.factor - a.factor).map((d) => ({
            sector: d.sector,
            demand: d.demand,
            supply: -d.supply, // negative to go left
            factor: d.factor,
          }));
          return (
            <ResponsiveContainer width="100%" height={Math.max(350, butterflyData.length * 38)}>
              <BarChart data={butterflyData} layout="vertical" margin={{ left: 120, right: 30, top: 5, bottom: 5 }}>
                <XAxis
                  type="number"
                  domain={[-maxVal * 1.1, maxVal * 1.1]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => formatYen(Math.abs(v))}
                />
                <YAxis type="category" dataKey="sector" width={110} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => {
                    const abs = Math.abs(Number(value));
                    return [formatYen(abs), String(name) === "supply" ? "供給" : "需要"];
                  }}
                  labelFormatter={(label) => String(label)}
                />
                <ReferenceLine x={0} stroke="#6B7280" strokeWidth={1.5} />
                <Bar dataKey="supply" name="供給" fill="#E76F51" fillOpacity={0.7} radius={[4, 0, 0, 4]} />
                <Bar dataKey="demand" name="需要" fill="#2A9D8F" fillOpacity={0.7} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          );
        })()}
        <div className="flex justify-center gap-6 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#E76F51]/70" />← 供給（年間販売額）</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#2A9D8F]/70" />需要（推定購買力）→</span>
        </div>
      </div>

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
              <tr key={r.sector} className={`border-b hover:bg-muted/50 cursor-default transition-colors ${hoveredSector === r.sector ? "bg-yellow-50 dark:bg-yellow-950/30" : ""}`}>
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
