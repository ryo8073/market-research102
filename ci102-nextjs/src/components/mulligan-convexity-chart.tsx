"use client";

/**
 * 🌀 Mulligan凸性質 動的可視化チャート — Phase 6.6。
 *
 * 業種粒度 (17 → 95 → ~250) と EBM/基盤率の関係を1画面で表示。
 * 教科書 Orlando MSA 4.94 を基準線として、各都道府県の EBM が
 * 細分化により単調減少して教科書値に近づく様子を可視化する。
 *
 * 理論 (Mulligan & Murphy 1995):
 *   業種を細分類化すると、より多くの「特化業種」が LQ>1 として
 *   検出される。結果として基盤雇用が単調増加 → EBM が単調減少。
 *
 * 教育的意義:
 *   - 「大分類17で見た EBM は過大評価」を視覚的に証明
 *   - 教科書値 (Orlando 4.94) との差を粒度ごとに表示
 *   - 「真の EBM はもっと低い」直感を養う
 */
import { useGranularityProgression } from "@/lib/use-granularity-progression";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

interface Props {
  prefCode: number;
}

export function MulliganConvexityChart({ prefCode }: Props) {
  const { data, loading, error } = useGranularityProgression(prefCode);

  if (loading) {
    return (
      <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/30 p-4 text-sm text-slate-500">
        🌀 Mulligan凸性質チャート 読込中...
      </div>
    );
  }
  if (error || !data) return null;

  // チャートデータ整形
  const chartData = data.levels.map((lv) => ({
    label: lv.label,
    n_industries: lv.n_industries,
    ebm: lv.ebm,
    basic_ratio: lv.basic_ratio_pct,
    n_basic: lv.n_basic,
  }));

  // Orlando ベンチマーク (3点すべてに参考値として水平線)
  const orlandoEbm = data.orlando_benchmark.ebm;

  // 各段階の EBM 変化幅
  const ebm_L0_to_L1 = data.levels[1].ebm - data.levels[0].ebm;
  const ebm_L1_to_L2 = data.levels[2].ebm - data.levels[1].ebm;
  const ebm_total_change = data.levels[2].ebm - data.levels[0].ebm;
  const ebm_to_orlando = data.levels[2].ebm - orlandoEbm;

  return (
    <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50/40 p-4 space-y-3" data-print-block>
      <div>
        <p className="text-sm font-semibold text-indigo-900">
          🌀 Mulligan凸性質 — {data.pref_name} の EBM が業種粒度でどう変わるか
        </p>
        <p className="text-xs text-slate-700 mt-1">
          Mulligan &amp; Murphy (1995) 理論: <strong>業種を細分類化すると、より多くの特化業種が検出され基盤雇用が増加 → EBM が単調減少</strong>。
          下記チャートは、{data.pref_name} の EBM が大分類17→中分類95→(+卸売小売細分類156) と粒度を細かくすると教科書 Orlando MSA 4.94 に近づく様子を視覚化。
        </p>
      </div>

      {/* メインチャート: EBM (折れ線) + 基盤率% (バー) */}
      <div className="bg-white rounded border p-2">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 50, left: 10, bottom: 30 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              interval={0}
              angle={-8}
              textAnchor="end"
              height={50}
            />
            <YAxis
              yAxisId="ebm"
              orientation="left"
              tick={{ fontSize: 10 }}
              label={{ value: "EBM (左軸)", angle: -90, position: "insideLeft", fontSize: 11 }}
              domain={[0, "auto"]}
            />
            <YAxis
              yAxisId="ratio"
              orientation="right"
              tick={{ fontSize: 10 }}
              label={{ value: "基盤率 % (右軸)", angle: 90, position: "insideRight", fontSize: 11 }}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0].payload as typeof chartData[0];
                return (
                  <div className="bg-white border rounded shadow p-2 text-xs">
                    <p className="font-semibold">{d.label}</p>
                    <p>業種数: <strong>{d.n_industries}</strong></p>
                    <p>EBM: <strong className="text-indigo-700">{d.ebm.toFixed(2)}</strong></p>
                    <p>基盤雇用比率: <strong>{d.basic_ratio.toFixed(1)}%</strong></p>
                    <p>基盤業種数 (LQ&gt;1): <strong>{d.n_basic}</strong></p>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              yAxisId="ebm"
              y={orlandoEbm}
              stroke="#dc2626"
              strokeDasharray="5 5"
              label={{
                value: `Orlando MSA 教科書値 ${orlandoEbm}`,
                position: "right",
                fontSize: 10,
                fill: "#dc2626",
              }}
            />
            <Bar yAxisId="ratio" dataKey="basic_ratio" name="基盤雇用比率 (%)" fill="#a5b4fc">
              {chartData.map((_, i) => (
                <Cell key={i} fill={i === 0 ? "#c7d2fe" : i === 1 ? "#a5b4fc" : "#6366f1"} />
              ))}
            </Bar>
            <Line
              yAxisId="ebm"
              type="monotone"
              dataKey="ebm"
              name="EBM"
              stroke="#4338ca"
              strokeWidth={3}
              dot={{ r: 6, fill: "#4338ca" }}
              label={{
                position: "top",
                fontSize: 11,
                fontWeight: "bold",
                fill: "#4338ca",
                formatter: (v: unknown) => Number(v).toFixed(2),
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 数値サマリ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded bg-white border p-2">
          <p className="text-slate-500">L0→L1 変化 (大分類→中分類)</p>
          <p className="text-base font-bold" style={{ color: ebm_L0_to_L1 < 0 ? "#059669" : "#dc2626" }}>
            EBM {ebm_L0_to_L1 >= 0 ? "+" : ""}
            {ebm_L0_to_L1.toFixed(2)}
          </p>
        </div>
        <div className="rounded bg-white border p-2">
          <p className="text-slate-500">L1→L2 変化 (+細分類156)</p>
          <p className="text-base font-bold" style={{ color: ebm_L1_to_L2 < 0 ? "#059669" : "#dc2626" }}>
            EBM {ebm_L1_to_L2 >= 0 ? "+" : ""}
            {ebm_L1_to_L2.toFixed(2)}
          </p>
        </div>
        <div className="rounded bg-white border p-2">
          <p className="text-slate-500">L0→L2 合計変化</p>
          <p className="text-base font-bold" style={{ color: ebm_total_change < 0 ? "#059669" : "#dc2626" }}>
            EBM {ebm_total_change >= 0 ? "+" : ""}
            {ebm_total_change.toFixed(2)}
          </p>
        </div>
        <div className="rounded bg-white border p-2">
          <p className="text-slate-500">教科書値との残差 (L2 - {orlandoEbm})</p>
          <p
            className="text-base font-bold"
            style={{ color: Math.abs(ebm_to_orlando) < 1 ? "#059669" : ebm_to_orlando > 0 ? "#d97706" : "#0891b2" }}
          >
            {ebm_to_orlando >= 0 ? "+" : ""}
            {ebm_to_orlando.toFixed(2)}
          </p>
        </div>
      </div>

      {/* 業種別寄与分析 — 各 level で新規に基盤入りした業種 */}
      <details className="rounded bg-white border-2 border-indigo-200 p-3 text-xs" open>
        <summary className="font-semibold cursor-pointer">
          🔍 業種別寄与分析 — 各 level で新規に基盤入り (LQ&gt;1) した業種
        </summary>
        <div className="mt-2 grid md:grid-cols-2 gap-3">
          {/* L0 → L1 で新規追加 */}
          <div>
            <p className="font-medium text-indigo-700 text-[11px] mb-1">
              L0 → L1 で新規 (大分類では見えなかった中分類の特化業種)
            </p>
            {data.levels[1].newly_added && data.levels[1].newly_added.length > 0 ? (
              <table className="w-full text-[11px]">
                <thead className="bg-indigo-50">
                  <tr>
                    <th className="text-left p-1">業種</th>
                    <th className="text-right p-1 w-12">LQ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels[1].newly_added.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="p-1">{r.name}</td>
                      <td className="text-right p-1 font-mono font-semibold text-indigo-700">{r.lq.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-400 text-[10px]">新規追加なし</p>
            )}
          </div>

          {/* L1 → L2 で新規追加 */}
          <div>
            <p className="font-medium text-indigo-700 text-[11px] mb-1">
              L1 → L2 で新規 (細分類化で初めて見えた特化業種)
            </p>
            {data.levels[2].newly_added && data.levels[2].newly_added.length > 0 ? (
              <table className="w-full text-[11px]">
                <thead className="bg-indigo-50">
                  <tr>
                    <th className="text-left p-1">業種</th>
                    <th className="text-right p-1 w-12">LQ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels[2].newly_added.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="p-1">{r.name}</td>
                      <td className="text-right p-1 font-mono font-semibold text-indigo-700">{r.lq.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-400 text-[10px]">新規追加なし</p>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">
          ※ 「新規追加」=この粒度で初めて LQ&gt;1 になった業種。L1 で消えた業種もあり得ますが (大分類で過大評価された業種)、ここでは表示していません。
        </p>
      </details>

      {/* 教育的解釈 */}
      <div className="rounded bg-amber-50 border border-amber-200 p-3 text-xs space-y-1.5">
        <p className="font-semibold">💡 このチャートから読み取れること</p>
        <ul className="list-disc list-inside space-y-1 text-slate-700">
          <li>
            <strong>EBM の単調減少</strong>: 大分類17 → 中分類95 → +細分類 と粒度を細かくするほど EBM が下がる
            (Mulligan &amp; Murphy 1995 の数学的予測通り)。
          </li>
          <li>
            <strong>基盤雇用率の単調増加</strong>: 細分類で「隠れた特化業種」が表面化し、
            「域外輸出に必要な雇用」が増えるため。
          </li>
          {ebm_to_orlando < 1 && ebm_to_orlando > -1 && (
            <li className="text-emerald-700">
              <strong>✓ 教科書値とほぼ一致</strong>: L2 (細分類済) EBM が Orlando MSA 4.94 と近い差
              ({ebm_to_orlando >= 0 ? "+" : ""}{ebm_to_orlando.toFixed(2)})。
              この都道府県は<strong>米国の健全大都市圏と同等の経済基盤多様性</strong>を持つ。
            </li>
          )}
          {ebm_to_orlando >= 1 && (
            <li className="text-amber-700">
              <strong>⚠ まだ教科書値より高い</strong>: 残り
              {ebm_to_orlando.toFixed(2)} の差は、製造業・サービス業を細分類化していないため
              (現在は卸売・小売業のみ細分類)。全業種を細分類化できれば、さらに教科書値に近づく可能性。
            </li>
          )}
          {ebm_to_orlando <= -1 && (
            <li className="text-cyan-700">
              <strong>✓ 教科書値を下回る</strong>: L2 EBM が 4.94 を下回る
              → <strong>Orlando MSA より多角化された経済基盤</strong>を持つ。
            </li>
          )}
          <li>
            <strong>大分類17で得た EBM は過大評価</strong>: 細分類化で {Math.abs(ebm_total_change).toFixed(1)} 点減少。
            意思決定で「大分類だけで判断すると経済基盤を過小評価する」リスクがある。
          </li>
        </ul>
        <p className="text-[10px] text-slate-500 mt-1.5">
          ※ L2 は卸売・小売業のみ細分類化 (156業種)。製造業・サービス業など他大分類も細分類化すれば、さらに EBM が下がると予想される。
          全業種完全細分類は e-Stat 個別テーブル取得が必要 (将来課題)。
        </p>
      </div>
    </div>
  );
}
