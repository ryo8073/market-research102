"use client";

import { useMemo } from "react";
import PlotlyChart from "@/components/plotly-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  lq_table,
  total_basic_employment,
  shift_share_table,
  type LQRow,
} from "@/lib/calculator";
import type { MunicipalityData } from "@/lib/use-municipality-data";

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
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
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

      {/* LQ Bar Chart */}
      <PlotlyChart
        data={[
          {
            type: "bar",
            x: sorted.map((r) => r.lq),
            y: sorted.map((r) => r.industry),
            orientation: "h",
            marker: {
              color: sorted.map((r) =>
                r.lq > 1.0 ? "#2A9D8F" : "#6B7280"
              ),
            },
          },
        ]}
        layout={{
          title: { text: "産業別 LQ" },
          height: 600,
          margin: { l: 200 },
          shapes: [
            {
              type: "line", x0: 1, x1: 1, y0: -0.5, y1: sorted.length - 0.5,
              line: { color: "red", dash: "dash", width: 2 },
            },
          ],
          xaxis: { title: { text: "LQ" } },
        }}
      />

      {/* Investment Signal Matrix (if shift-share available) */}
      {ssData && ssData.length > 0 && (
        <>
          <h3 className="text-lg font-semibold">投資シグナル 4象限</h3>
          <div className="grid grid-cols-4 gap-3">
            {(() => {
              const rsMap = new Map(ssData.map((s) => [s.industry, s.regional_shift]));
              const best = lqData.filter((r) => r.lq > 1 && (rsMap.get(r.industry) ?? 0) > 0);
              const caution = lqData.filter((r) => r.lq > 1 && (rsMap.get(r.industry) ?? 0) <= 0);
              const growing = lqData.filter((r) => r.lq <= 1 && (rsMap.get(r.industry) ?? 0) > 0);
              const declining = lqData.filter((r) => r.lq <= 1 && (rsMap.get(r.industry) ?? 0) <= 0);
              return (
                <>
                  <Card className="border-l-4" style={{ borderLeftColor: "#2A9D8F" }}>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{best.length}</div>
                      <p className="text-xs text-muted-foreground">最優良（LQ&gt;1 &amp; RS&gt;0）</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: "#D4A843" }}>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{caution.length}</div>
                      <p className="text-xs text-muted-foreground">要警戒（LQ&gt;1 &amp; RS&lt;0）</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: "#6B7280" }}>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{growing.length}</div>
                      <p className="text-xs text-muted-foreground">成長中（LQ&lt;1 &amp; RS&gt;0）</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4" style={{ borderLeftColor: "#E76F51" }}>
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
              <tr key={r.industry} className="border-b hover:bg-slate-50">
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
