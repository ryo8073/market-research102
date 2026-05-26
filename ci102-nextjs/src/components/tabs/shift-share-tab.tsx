"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, Line,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShiftShareResult } from "@/lib/calculator";
import type { MunicipalityData } from "@/lib/use-municipality-data";
import { ReadingGuide } from "@/components/ui/reading-guide";

type Granularity = "major" | "mid";

interface Props {
  precomputed: ShiftShareResult[];
  precomputedMid?: ShiftShareResult[];
  topRsIndustry?: string;
  topRsValue?: number;
  topRsIndustryMid?: string;
  topRsValueMid?: number;
  rsTotal?: number;
  rsTotalMid?: number;
  selectedCity?: MunicipalityData | null;
}

export default function ShiftShareTab({
  precomputed,
  precomputedMid,
  topRsIndustry,
  topRsValue,
  topRsIndustryMid,
  topRsValueMid,
  rsTotal,
  rsTotalMid,
  selectedCity,
}: Props) {
  const hasMid = (precomputedMid?.length ?? 0) > 0;
  const [granularity, setGranularity] = useState<Granularity>("major");

  const activeData = granularity === "mid" && precomputedMid ? precomputedMid : precomputed;
  const activeTopIndustry = granularity === "mid" ? topRsIndustryMid : topRsIndustry;
  const activeTopValue = granularity === "mid" ? topRsValueMid : topRsValue;
  const activeRsTotal = granularity === "mid" ? rsTotalMid : rsTotal;

  const ssData = useMemo(
    () => [...activeData].sort((a, b) => b.regional_shift - a.regional_shift),
    [activeData],
  );

  const stars = ssData.filter((r) => r.regional_shift > 0 && r.actual_change > 0);

  return (
    <div className="space-y-6">
      {/* Granularity toggle */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 bg-slate-50">
        <span className="text-sm font-medium">業種粒度:</span>
        <div className="inline-flex rounded-md border overflow-hidden">
          <button
            type="button"
            onClick={() => setGranularity("major")}
            className={`px-4 py-1.5 text-sm transition-colors ${
              granularity === "major"
                ? "bg-slate-900 text-white"
                : "bg-white hover:bg-slate-100"
            }`}
          >
            大分類17業種
          </button>
          <button
            type="button"
            onClick={() => hasMid && setGranularity("mid")}
            disabled={!hasMid}
            className={`px-4 py-1.5 text-sm transition-colors border-l ${
              granularity === "mid"
                ? "bg-slate-900 text-white"
                : hasMid
                  ? "bg-white hover:bg-slate-100"
                  : "bg-slate-100 text-muted-foreground cursor-not-allowed"
            }`}
            title={hasMid ? "" : "中分類データを取得中"}
          >
            中分類95業種
          </button>
        </div>
        {granularity === "mid" && (
          <span className="text-xs text-muted-foreground">
            民営事業所のみ（公務S・農林漁業A,B除く）。Top20+下位20を表示
          </span>
        )}
        {granularity === "major" && (
          <span className="text-xs text-muted-foreground">
            全産業A〜T。粗い粒度ゆえ「卸売業，小売業」のような大区分しか見えない
          </span>
        )}
      </div>

      {/* Highlight cards for top RS */}
      {(activeTopIndustry || activeRsTotal !== undefined) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {activeTopIndustry && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">
                  最強RS産業（{granularity === "mid" ? "中分類" : "大分類"}）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{activeTopIndustry}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  RS = {activeTopValue?.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 }) ?? "—"} 人
                </p>
              </CardContent>
            </Card>
          )}
          {activeRsTotal !== undefined && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">RS合計</CardTitle></CardHeader>
              <CardContent>
                <div className={`text-lg font-bold ${activeRsTotal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {activeRsTotal.toLocaleString(undefined, { signDisplay: "always", maximumFractionDigits: 0 })} 人
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  正なら全国平均を上回る競争力、負ならその逆
                </p>
              </CardContent>
            </Card>
          )}
          {hasMid && granularity === "major" && topRsIndustryMid && topRsIndustryMid !== topRsIndustry && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2"><CardTitle className="text-xs text-blue-700">💡 中分類で見ると</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-bold text-blue-900">{topRsIndustryMid}</div>
                <p className="text-xs text-blue-700 mt-1">
                  大分類「{topRsIndustry}」の内訳で、中分類では「{topRsIndustryMid}」が最強RS
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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

      {/* Reading Guide */}
      <ReadingGuide steps={[
        { title: "RS（地域シフト）に注目", description: "緑色のRS部分が正の産業は、全国同産業を上回る競争力を持つ「スター産業」。テナント需要の源泉。" },
        { title: "赤い●と棒の差を見る", description: "赤い●が実際の変化。棒の合計と一致（NS+IM+RS=実績）。IMが負でもRSが正なら地域固有の競争力あり。" },
        { title: "粒度を切り替えて検証", description: "大分類で見えなかった『中分類でのスター産業』が見える場合あり。例: 大分類「情報通信業」→ 中分類「情報サービス業」「通信業」のどちらが伸びているか。" },
      ]} />

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
            <h3 className="text-sm font-semibold mb-2">
              シフトシェア分析（NS / IM / RS 3要因分解）— {granularity === "mid" ? "中分類95業種" : "大分類17業種"}
            </h3>
            <ResponsiveContainer width="100%" height={Math.max(500, chartData.length * 28)}>
              <ComposedChart data={chartData} layout="vertical" margin={{ left: 180, right: 30, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="industry" width={170} tick={{ fontSize: 10 }} />
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
            競争優位を持つスター産業 ({granularity === "mid" ? "中分類" : "大分類"}): {stars.slice(0, 10).map((r) => r.industry).join("、")}
            {stars.length > 10 && ` ほか${stars.length - 10}業種`}
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
            {ssData.map((r) => (
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
        {granularity === "mid" && (
          <p className="text-xs text-muted-foreground mt-2">
            ※ 中分類95業種のうち RS上位20+下位20 を表示しています。中位はチャート容量節約のため省略。
          </p>
        )}
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
          <p className="text-xs">
            <strong>粒度の使い分け:</strong> 大分類は全産業をカバーし、地域全体の構造変化を把握。中分類は民営事業所のみだが業種解像度が高く、テナント候補の具体性が増す（例: 「宿泊業」と「飲食サービス業」を区別）。
          </p>
        </div>
      </details>
    </div>
  );
}
