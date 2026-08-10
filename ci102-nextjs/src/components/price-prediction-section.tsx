"use client";

/**
 * 🤖 地価予測 ML セクション — Phase 6.5。
 *
 * 教育的目的:
 *   1. マクロ経済データだけで地価の何%が説明できるかを示す
 *   2. 各経済指標の地価への寄与度を可視化
 *   3. 残差 = 「経済データで説明できない地域固有要因」(観光、ブランド、政策等)
 */
import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { usePriceModel, predictPrice, explainContributions, type PriceModel } from "@/lib/use-price-model";
import type { PrefectureData } from "@/lib/use-prefecture-data";

interface Props {
  /** 選択中の都道府県データ (個別予測表示用) */
  pref: PrefectureData | null;
}

export function PricePredictionSection({ pref }: Props) {
  const { model, loading, error } = usePriceModel();

  const prefPrediction = useMemo(() => {
    if (!model || !pref) return null;
    const features = {
      population: pref.population || 0,
      ebm: pref.ebm || 0,
      basic_ratio: pref.basic_ratio || 0,
      rs_total: pref.rs_total || 0,
      aggregate_gap_factor: pref.aggregate_gap_factor || 0,
      pop_change_pct: pref.pop_change_pct || 0,
      flood_risk_avg_pct: pref.flood_risk_avg_pct || 0,
      total_daily_riders: pref.total_daily_riders || 0,
      did_total_population: pref.did_total_population || 0,
      num_medical: pref.num_medical || 0,
    };
    const predicted = predictPrice(model, features);
    const contributions = explainContributions(model, features);
    return { predicted, contributions, actual: pref.median_unit_price ?? null };
  }, [model, pref]);

  if (loading) return <div className="text-sm text-slate-500">予測モデル読込中...</div>;
  if (error || !model) return null;

  return (
    <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50/30 p-4 space-y-4" data-print-block>
      <div>
        <p className="text-sm font-semibold">🤖 地価予測 ML モデル — マクロ経済の説明力</p>
        <p className="text-xs text-slate-600 mt-1">
          47都道府県の経済データ ({model.features.length}変数) で <strong>median 地価 (¥/m²) を線形回帰</strong>。
          <strong> R² = {(model.r_squared * 100).toFixed(1)}%</strong> ({model.r_squared >= 0.85 ? "極めて高い説明力" : model.r_squared >= 0.7 ? "高い説明力" : "中程度の説明力"})。
          つまり、地価の <strong>{(model.r_squared * 100).toFixed(0)}%</strong> はマクロ経済で説明でき、残り
          <strong> {((1 - model.r_squared) * 100).toFixed(0)}%</strong> は経済データで説明できない地域固有要因 (観光・ブランド・規制等)。
        </p>
      </div>

      {/* 個別予測 */}
      {prefPrediction && pref && (
        <div className="rounded bg-white border-2 border-indigo-200 p-3 space-y-3">
          <p className="text-sm font-semibold">{pref.pref_name} の地価予測</p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded bg-slate-50 p-2">
              <p className="text-xs text-slate-500">マクロ予測</p>
              <p className="text-lg font-bold">¥{Math.round(prefPrediction.predicted).toLocaleString()}</p>
              <p className="text-xs text-slate-400">/m²</p>
            </div>
            {prefPrediction.actual != null ? (
              <>
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-xs text-slate-500">実取引価格 (MLIT中央値)</p>
                  <p className="text-lg font-bold">¥{prefPrediction.actual.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">/m²</p>
                </div>
                <div className="rounded bg-amber-50 border border-amber-200 p-2">
                  <p className="text-xs text-slate-500">残差 (実 − 予測)</p>
                  <p
                    className="text-lg font-bold"
                    style={{ color: (prefPrediction.actual - prefPrediction.predicted) > 0 ? "#047857" : "#b91c1c" }}
                  >
                    {(prefPrediction.actual - prefPrediction.predicted) > 0 ? "+" : ""}
                    ¥{Math.round(prefPrediction.actual - prefPrediction.predicted).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(prefPrediction.actual - prefPrediction.predicted) > 0
                      ? "経済以外のプレミアム"
                      : "経済データほどの地価がない"}
                  </p>
                </div>
              </>
            ) : (
              <div className="col-span-2 rounded bg-slate-50 p-2 text-slate-400">
                MLIT 取引価格データなし
              </div>
            )}
          </div>

          {/* 寄与度 Top */}
          <details open className="mt-2">
            <summary className="text-xs font-medium text-slate-700 cursor-pointer">
              各経済指標の寄与度 (どの要因が地価を押し上げ/下げているか)
            </summary>
            <table className="w-full text-xs mt-2">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-1">指標</th>
                  <th className="text-right p-1">寄与度 (¥/m²)</th>
                  <th className="text-left p-1">方向</th>
                </tr>
              </thead>
              <tbody>
                {prefPrediction.contributions.slice(0, 8).map((c) => (
                  <tr key={c.key} className="border-b">
                    <td className="p-1">{c.description}</td>
                    <td className="text-right p-1 font-mono" style={{ color: c.contribution > 0 ? "#059669" : "#dc2626" }}>
                      {c.contribution >= 0 ? "+" : ""}
                      {Math.round(c.contribution).toLocaleString()}
                    </td>
                    <td className="p-1">
                      <div className="w-20 h-2 bg-slate-100 rounded relative">
                        <div
                          className="absolute top-0 h-2 rounded"
                          style={{
                            backgroundColor: c.contribution > 0 ? "#059669" : "#dc2626",
                            width: `${Math.min(100, (Math.abs(c.contribution) / Math.abs(prefPrediction.contributions[0].contribution)) * 100)}%`,
                            left: c.contribution > 0 ? "50%" : undefined,
                            right: c.contribution < 0 ? "50%" : undefined,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      {/* 全国: 予測 vs 実績 散布図 */}
      <PredictionScatter model={model} highlightedPref={pref?.pref_name} />

      {/* 教育的注釈 */}
      <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 space-y-1">
        <p className="font-semibold">💡 教育的解釈</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>
            <strong>残差 +</strong> = 経済データで説明される以上に地価が高い (観光地・首都圏通勤プレミアム等)
          </li>
          <li>
            <strong>残差 −</strong> = 経済データから期待される地価より低い (供給過多・土地利用規制等)
          </li>
          <li>
            <strong>R² = {(model.r_squared * 100).toFixed(1)}%</strong>: シンプルな線形モデルでも地価の大部分を経済要因で説明可能 = 不動産投資は<strong>マクロ経済分析が決定的</strong>
          </li>
          <li>
            限界: 線形モデルは「人口10倍 → 地価10倍」の関係を仮定。実際は非線形 (大都市集中効果) なので、上位都市の予測誤差が大きい
          </li>
        </ul>
      </div>
    </div>
  );
}

function PredictionScatter({ model, highlightedPref }: { model: PriceModel; highlightedPref?: string }) {
  const data = model.predictions.map((p) => ({
    name: p.pref_name,
    actual: p.actual,
    predicted: p.predicted,
    residual: p.residual,
    isHighlight: p.pref_name === highlightedPref,
  }));

  const maxVal = Math.max(...data.map((d) => Math.max(d.actual, d.predicted)));

  return (
    <div className="bg-white rounded border p-2">
      <p className="text-xs font-semibold mb-1">予測 vs 実績 (47都道府県)</p>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 5, right: 10, left: 30, bottom: 30 }}>
          <XAxis
            type="number"
            dataKey="predicted"
            name="マクロ予測"
            tick={{ fontSize: 10 }}
            label={{ value: "マクロ予測 (¥/m²)", position: "insideBottom", offset: -10, fontSize: 11 }}
            tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
            domain={[0, maxVal]}
          />
          <YAxis
            type="number"
            dataKey="actual"
            name="実取引価格"
            tick={{ fontSize: 10 }}
            label={{ value: "実取引価格 (¥/m²)", angle: -90, position: "insideLeft", fontSize: 11 }}
            tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`}
            domain={[0, maxVal]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload[0]) return null;
              const p = payload[0].payload as typeof data[0];
              return (
                <div className="bg-white border rounded shadow p-2 text-xs">
                  <p className="font-semibold">{p.name}</p>
                  <p>実: ¥{p.actual.toLocaleString()}</p>
                  <p>予測: ¥{Math.round(p.predicted).toLocaleString()}</p>
                  <p style={{ color: p.residual > 0 ? "#059669" : "#dc2626" }}>
                    残差: {p.residual >= 0 ? "+" : ""}¥{Math.round(p.residual).toLocaleString()}
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: maxVal, y: maxVal }]}
            stroke="#94a3b8"
            strokeDasharray="3 3"
            label={{ value: "完全予測線 (y=x)", fontSize: 9, fill: "#94a3b8", position: "insideTopRight" }}
          />
          <Scatter data={data} fill="#6366f1">
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.isHighlight ? "#dc2626" : "#6366f1"} r={entry.isHighlight ? 8 : 5} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-500 mt-1">
        45°線上 = 完全予測。上にズレるほど「マクロ予測より高い実地価」(プラスプレミアム)、下にズレるほど逆。
        {highlightedPref && (
          <span className="text-rose-600"> 赤=選択中の {highlightedPref}</span>
        )}
      </p>
    </div>
  );
}
