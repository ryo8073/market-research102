"use client";

import { useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
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

/** Map EBM value to a color gradient (blue=low, teal=mid, red=high)
 * Real data range: ~4 (low basic ratio) to ~25 (high basic ratio)
 * e.g. Tokyo=5.79, Hokkaido=11.34, Osaka=20.57 */
function ebmColor(ebm: number): string {
  if (ebm <= 5) return "#3B82F6";   // blue: low EBM
  if (ebm <= 8) return "#2A9D8F";   // teal
  if (ebm <= 12) return "#D4A843";  // gold
  if (ebm <= 18) return "#E76F51";  // orange
  return "#DC2626";                  // red: very high EBM
}

interface CrossDatum {
  name: string;
  prefCode: number;
  gapFactor: number;
  medianPrice: number;
  ebm: number;
  totalEmp: number;
}

/* Custom tooltip for the scatter chart */
function CrossTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d: CrossDatum = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{d.name}</p>
      <p>漏損/余剰: {d.gapFactor.toFixed(1)}</p>
      <p>㎡単価: ¥{d.medianPrice.toLocaleString()}</p>
      <p>EBM: {d.ebm.toFixed(2)}</p>
    </div>
  );
}

export default function CrossTab({ areas, highlightPrefCode }: Props) {
  const crossData = useMemo<CrossDatum[]>(() => {
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
        totalEmp,
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
      <div className="rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-sm">
        <p className="font-medium mb-2">4象限の読み方</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
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

      {/* EBM color legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground px-1">
        <span className="font-medium">EBM:</span>
        {[
          { label: "~5", color: "#3B82F6" },
          { label: "~8", color: "#2A9D8F" },
          { label: "~12", color: "#D4A843" },
          { label: "~18", color: "#E76F51" },
          { label: "18+", color: "#DC2626" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div aria-label="小売ギャップと取引単価のクロス分析散布図">
        <ResponsiveContainer width="100%" height={600}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 70 }}>
            <XAxis
              dataKey="gapFactor"
              type="number"
              name="漏損/余剰係数"
              tick={{ fontSize: 11 }}
              label={{ value: "小売漏損/余剰係数", position: "bottom", offset: 10, fontSize: 12 }}
            />
            <YAxis
              dataKey="medianPrice"
              type="number"
              name="㎡単価中央値"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => `¥${(v / 1000).toFixed(0)}k`}
              label={{ value: "㎡単価中央値（円）", angle: -90, position: "insideLeft", offset: -10, fontSize: 12 }}
            />
            <ZAxis dataKey="totalEmp" type="number" range={[40, 400]} name="総雇用" />
            <Tooltip content={<CrossTooltip />} />
            <ReferenceLine x={0} stroke="#6B7280" strokeDasharray="3 3" />
            <ReferenceLine y={priceMedian} stroke="#6B7280" strokeDasharray="3 3" />
            <Scatter data={crossData} name="都道府県">
              {crossData.map((d, i) => (
                <Cell key={i} fill={ebmColor(d.ebm)} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Educational content */}
      <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="font-medium cursor-pointer">ℹ️ この分析の読み方</summary>
        <div className="mt-2 space-y-2">
          <p>
            47都道府県を「小売漏損/余剰係数」（横軸）と「㎡単価中央値」（縦軸）の2軸にプロットし、投資機会を4象限で分類します。
          </p>
          <div className="space-y-1 text-xs">
            <p className="p-1.5 rounded" style={{ backgroundColor: "rgba(42,157,143,0.1)" }}>
              <strong>右下: 需要あり × 安い → 最優先投資候補</strong><br />
              漏損が大きい（購買力が流出）のに不動産が安い地域。出店の好機。
            </p>
            <p className="p-1.5 rounded" style={{ backgroundColor: "rgba(212,168,67,0.1)" }}>
              <strong>右上: 需要あり × 高い → エントリーコスト注意</strong><br />
              需要はあるが不動産が高い。利回りの精査が必要。
            </p>
            <p className="p-1.5 rounded" style={{ backgroundColor: "rgba(107,114,128,0.1)" }}>
              <strong>左下: 余剰 × 安い → 様子見</strong><br />
              供給過多で不動産も安い。構造的な問題の可能性。
            </p>
            <p className="p-1.5 rounded" style={{ backgroundColor: "rgba(231,111,81,0.1)" }}>
              <strong>左上: 余剰 × 高い → 回避</strong><br />
              供給過多なのに不動産が高い。最もリスクが高い象限。
            </p>
          </div>
          <p className="text-xs">
            バブルサイズは総雇用規模、色はEBM（経済基盤乗数）を示します。色が暖色ほど乗数効果が大きい地域です。
          </p>
        </div>
      </details>
    </div>
  );
}
