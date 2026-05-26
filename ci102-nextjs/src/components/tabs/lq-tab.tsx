"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  lq_table,
  total_basic_employment,
  shift_share_table,
  type LQRow,
} from "@/lib/calculator";
import type { MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";

interface Props {
  localEmp: Record<string, number>;
  nationalEmp: Record<string, number>;
  localT0?: Record<string, number>;
  localT1?: Record<string, number>;
  nationalT0?: Record<string, number>;
  nationalT1?: Record<string, number>;
  selectedCity?: MunicipalityData | null;
}

export default function LqTab({ localEmp, nationalEmp, localT0, localT1, nationalT0, nationalT1, selectedCity }: Props) {
  const [selectedSignalIndustries, setSelectedSignalIndustries] = useState<Set<string> | null>(null);
  const lqData = useMemo(() => lq_table(localEmp, nationalEmp), [localEmp, nationalEmp]);
  const basicTotal = useMemo(() => total_basic_employment(lqData), [lqData]);
  const totalEmp = useMemo(() => lqData.reduce((s, r) => s + r.local_emp, 0), [lqData]);
  const basicRatio = totalEmp > 0 ? (basicTotal / totalEmp) * 100 : 0;

  // Shift-share integration
  const ssData = useMemo(() => {
    if (!localT0 || !localT1 || !nationalT0 || !nationalT1) return null;
    return shift_share_table(localT0, localT1, nationalT0, nationalT1);
  }, [localT0, localT1, nationalT0, nationalT1]);

  // LQ bar chart data
  const sorted = useMemo(() => [...lqData].sort((a, b) => a.lq - b.lq), [lqData]);

  return (
    <div className="space-y-6">
      {/* 粒度ガイド */}
      <div className="rounded-lg border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs">
        <strong>📐 業種粒度: 大分類17業種</strong>（CCIM教科書整合）。
        中分類95業種・農林業補完での詳細LQは <strong>スコアカード(⓪)の粒度トグル</strong>でTOP10を確認可能。
        競争力分析(RS)は次タブ <strong>③シフトシェア分析</strong>へ。
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">総従業者数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmp.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">推計基盤雇用</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(basicTotal).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">基盤雇用比率</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{basicRatio.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Municipality highlight */}
      {selectedCity && (
        <div className="rounded-lg border p-4" style={{ backgroundColor: "#f0f9ff" }}>
          <h3 className="font-semibold mb-3">{selectedCity.area_name} — 市区町村データ</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">総従業者数</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.total_emp.toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">推計基盤雇用</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{Math.round(selectedCity.basic_emp).toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">基盤雇用比率</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{selectedCity.basic_ratio.toFixed(1)}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">最大LQ産業</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{selectedCity.max_lq.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">{selectedCity.max_lq_industry}</p>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground mt-2">下記チャート・テーブルは都道府県レベルのデータです。市区町村の産業別内訳は事前計算データに含まれていません。</p>
        </div>
      )}

      {/* Reading Guide */}
      <ReadingGuide steps={[
        { title: "LQ=1.0ラインを確認", description: "赤い破線より右の産業が基盤産業（域外から資金を呼び込む産業）。左側は域内消費型。" },
        { title: "LQ上位の多様性を見る", description: "複数産業がLQ>1.5なら経済基盤が分散し安定的。1産業のみ突出は一極集中リスク。" },
        { title: "基盤雇用の絶対数を確認", description: "LQが高くても雇用が少なければ経済インパクトは限定的。テーブルの基盤雇用推計で実質的な影響力を判断。" },
      ]} />

      {/* LQ Bar Chart */}
      <div aria-label="産業別 LQ 横棒グラフ">
        <h3 className="text-sm font-semibold mb-2">産業別 LQ</h3>
        <ResponsiveContainer width="100%" height={Math.max(400, sorted.length * 28)}>
          <BarChart data={sorted} layout="vertical" margin={{ left: 140, right: 30, top: 5, bottom: 5 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="industry" width={130} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => [Number(value).toFixed(3), "LQ"]}
              contentStyle={{ backgroundColor: "var(--background, #fff)", borderColor: "var(--border, #e5e7eb)" }}
            />
            <ReferenceLine x={1} stroke="#EF4444" strokeDasharray="3 3" label={{ value: "LQ=1.0", fontSize: 10, fill: "#EF4444" }} />
            <ReferenceLine x={1.25} stroke="#D4A843" strokeDasharray="3 3" label={{ value: "1.25", fontSize: 9, fill: "#D4A843" }} />
            <Bar dataKey="lq" radius={[0, 4, 4, 0]}>
              {sorted.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    selectedSignalIndustries?.has(entry.industry)
                      ? "#EAB308"
                      : entry.lq >= 1
                        ? "#2A9D8F"
                        : "#9CA3AF"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bubble Chart: LQ vs Employment vs Basic Employment */}
      <div aria-label="LQバブルチャート（LQ×雇用×基盤雇用）">
        <h3 className="text-sm font-semibold mb-1">LQ × 雇用規模マトリクス</h3>
        <p className="text-xs text-muted-foreground mb-2">
          横軸=LQ、縦軸=地域雇用者数、バブルサイズ=基盤雇用推計。右上が「高集積×大規模」の最重要産業。
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 70 }}>
            <XAxis
              dataKey="lq" type="number" name="LQ"
              tick={{ fontSize: 11 }}
              label={{ value: "特化係数（LQ）", position: "bottom", offset: 15, fontSize: 12 }}
            />
            <YAxis
              dataKey="local_emp" type="number" name="地域雇用"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v.toLocaleString()}
              label={{ value: "地域雇用者数", angle: -90, position: "insideLeft", offset: -15, fontSize: 12 }}
            />
            <ZAxis dataKey="basic_emp_estimate" range={[40, 800]} name="基盤雇用" />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as LQRow;
                return (
                  <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                    <p className="font-bold text-sm mb-1">{d.industry}</p>
                    <p>LQ: <span className="font-semibold">{d.lq.toFixed(3)}</span></p>
                    <p>地域雇用: <span className="font-semibold">{d.local_emp.toLocaleString()}</span></p>
                    <p>基盤雇用: <span className="font-semibold">{Math.round(d.basic_emp_estimate).toLocaleString()}</span></p>
                  </div>
                );
              }}
            />
            <ReferenceLine x={1} stroke="#EF4444" strokeDasharray="3 3" />
            <Scatter data={lqData} fill="#2A9D8F">
              {lqData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.lq >= 1.25 ? "#2A9D8F" : entry.lq >= 1.0 ? "#D4A843" : "#9CA3AF"}
                  fillOpacity={0.7}
                  stroke={entry.lq >= 1.25 ? "#2A9D8F" : entry.lq >= 1.0 ? "#D4A843" : "#9CA3AF"}
                  strokeWidth={1}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#2A9D8F]" />LQ≥1.25（強い基盤産業）</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#D4A843]" />LQ 1.0-1.25（弱い基盤産業）</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#9CA3AF]" />LQ&lt;1.0（非基盤産業）</span>
        </div>
      </div>

      {/* Investment Signal Matrix (if shift-share available) */}
      {ssData && ssData.length > 0 && (
        <>
          <h3 className="text-lg font-semibold">投資シグナル 4象限</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(() => {
              const rsMap = new Map(ssData.map((s) => [s.industry, s.regional_shift]));
              const best = lqData.filter((r) => r.lq > 1 && (rsMap.get(r.industry) ?? 0) > 0);
              const caution = lqData.filter((r) => r.lq > 1 && (rsMap.get(r.industry) ?? 0) <= 0);
              const growing = lqData.filter((r) => r.lq <= 1 && (rsMap.get(r.industry) ?? 0) > 0);
              const declining = lqData.filter((r) => r.lq <= 1 && (rsMap.get(r.industry) ?? 0) <= 0);

              const handleSignalClick = (industries: typeof best) => {
                const names = new Set(industries.map((r) => r.industry));
                if (selectedSignalIndustries && [...names].every((n) => selectedSignalIndustries.has(n)) && names.size === selectedSignalIndustries.size) {
                  setSelectedSignalIndustries(null);
                } else {
                  setSelectedSignalIndustries(names);
                }
              };

              return (
                <>
                  <Card className="border-l-4 cursor-pointer hover:shadow-md transition-shadow" style={{ borderLeftColor: "#2A9D8F" }} onClick={() => handleSignalClick(best)}>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{best.length}</div>
                      <p className="text-xs text-muted-foreground">最優良（LQ&gt;1 &amp; RS&gt;0）</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 cursor-pointer hover:shadow-md transition-shadow" style={{ borderLeftColor: "#D4A843" }} onClick={() => handleSignalClick(caution)}>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{caution.length}</div>
                      <p className="text-xs text-muted-foreground">要警戒（LQ&gt;1 &amp; RS&lt;0）</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 cursor-pointer hover:shadow-md transition-shadow" style={{ borderLeftColor: "#6B7280" }} onClick={() => handleSignalClick(growing)}>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{growing.length}</div>
                      <p className="text-xs text-muted-foreground">成長中（LQ&lt;1 &amp; RS&gt;0）</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 cursor-pointer hover:shadow-md transition-shadow" style={{ borderLeftColor: "#E76F51" }} onClick={() => handleSignalClick(declining)}>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{declining.length}</div>
                      <p className="text-xs text-muted-foreground">衰退（LQ&lt;1 &amp; RS&lt;0）</p>
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* LQ Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">産業</th>
              <th className="text-right p-2">地域雇用</th>
              <th className="text-right p-2">全国雇用</th>
              <th className="text-right p-2">LQ</th>
              <th className="text-right p-2">基盤雇用推計</th>
            </tr>
          </thead>
          <tbody>
            {[...lqData].sort((a, b) => b.lq - a.lq).map((r) => (
              <tr key={r.industry} className={`border-b hover:bg-muted/50 cursor-default transition-colors ${selectedSignalIndustries?.has(r.industry) ? "bg-yellow-50 dark:bg-yellow-950/30" : ""}`}>
                <td className="p-2">{r.industry}</td>
                <td className="text-right p-2">{r.local_emp.toLocaleString()}</td>
                <td className="text-right p-2">{r.national_emp.toLocaleString()}</td>
                <td className="text-right p-2 font-mono">{r.lq.toFixed(3)}</td>
                <td className="text-right p-2">{Math.round(r.basic_emp_estimate).toLocaleString()}</td>
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
            特化係数（LQ）が1.0を超える産業は、この地域から域外へ財やサービスを「輸出」し、外部資金を流入させる基盤産業です。この外部資金の流入がテナント需要を生み、不動産価値を支える根源的な力です。
          </p>
          <p className="font-medium">着目ポイント:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>LQ &gt; 1.5 の産業が複数ある → 経済基盤が多様で投資リスクが低い</li>
            <li>LQ &gt; 2.0 の産業が1つだけ → 一極集中リスクに注意</li>
            <li>基盤雇用の推計: LQ &gt; 1.0 の産業について、全国平均を超える部分の雇用を「域外向け輸出に必要な雇用（基盤雇用）」と推定します</li>
          </ul>
          <p className="font-mono text-xs mt-2">
            計算式: LQ = (地域の産業i雇用 / 地域の総雇用) ÷ (全国の産業i雇用 / 全国の総雇用)
          </p>
        </div>
      </details>
    </div>
  );
}
