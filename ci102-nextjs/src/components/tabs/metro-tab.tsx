"use client";

import { useState } from "react";
import { useMetroData, MetroData } from "@/lib/use-metro-data";

const ORLANDO_BENCHMARK = { per: 1.91, ebm: 4.94, basic_ratio: 20.2 };

export default function MetroTab() {
  const { allMetros, loading, error } = useMetroData();
  const [selectedKey, setSelectedKey] = useState<string>("tokyo");

  if (loading) {
    return <div className="text-sm text-gray-500">都市圏データを読み込み中...</div>;
  }
  if (error || !allMetros) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        都市圏データの読み込みに失敗しました: {error || "データなし"}
      </div>
    );
  }

  const metro = allMetros[selectedKey];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">都市圏分析（MSA相当）</h2>
        <p className="text-sm text-gray-700">
          CI102 の経済基盤理論は MSA（Metropolitan Statistical Area = 通勤経済圏）を前提とします。
          日本の単独自治体だと通勤流入（千代田区など）や流出（横浜・神戸など）で EBM・PER が歪みます。
          本タブは複数の都道府県を合算して<strong>経済圏として再評価</strong>します。
        </p>
      </div>

      {/* 都市圏セレクタ */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(allMetros).map(([key, m]) => (
          <button
            key={key}
            onClick={() => setSelectedKey(key)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              selectedKey === key
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      {metro && (
        <>
          {/* 都市圏概要 */}
          <div className="rounded-lg border bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              <strong>構成:</strong> {metro.pref_names.join(" + ")}
            </p>
            <p className="text-sm text-slate-600 mt-1">{metro.note}</p>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-slate-500">人口</div>
              <div className="text-xl font-semibold mt-1">{metro.population.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-slate-500">総雇用</div>
              <div className="text-xl font-semibold mt-1">{metro.total_employment.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-slate-500">PER</div>
              <div className="text-xl font-semibold mt-1">{metro.per.toFixed(2)}</div>
              <div className="text-xs text-slate-400 mt-0.5">教科書: 1.91</div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-slate-500">EBM</div>
              <div className="text-xl font-semibold mt-1">{metro.ebm.toFixed(2)}</div>
              <div className="text-xs text-slate-400 mt-0.5">教科書: 4.94</div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-xs text-slate-500">基盤雇用比率</div>
              <div className="text-xl font-semibold mt-1">{metro.basic_ratio.toFixed(1)}%</div>
              <div className="text-xs text-slate-400 mt-0.5">教科書: 20.2%</div>
            </div>
          </div>

          {/* 教科書との比較表 */}
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm font-semibold mb-3">教科書 Orlando MSA との比較</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="py-2">指標</th>
                  <th className="text-right py-2">Orlando MSA</th>
                  <th className="text-right py-2">{metro.name}</th>
                  <th className="text-right py-2">判定</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "PER", value: metro.per, benchmark: ORLANDO_BENCHMARK.per, low: 1.5, high: 2.5 },
                  { label: "EBM", value: metro.ebm, benchmark: ORLANDO_BENCHMARK.ebm, low: 3.0, high: 6.0 },
                  { label: "基盤雇用比率(%)", value: metro.basic_ratio, benchmark: ORLANDO_BENCHMARK.basic_ratio, low: 15.0, high: 30.0 },
                ].map((row) => {
                  const inRange = row.value >= row.low && row.value <= row.high;
                  return (
                    <tr key={row.label} className="border-b last:border-b-0">
                      <td className="py-2">{row.label}</td>
                      <td className="text-right py-2 text-slate-500">{row.benchmark}</td>
                      <td className="text-right py-2 font-semibold">{row.value.toFixed(row.label.includes("%") ? 1 : 2)}</td>
                      <td className="text-right py-2">
                        {inRange ? (
                          <span className="text-emerald-700">✅ 健全</span>
                        ) : (
                          <span className="text-amber-700">⚠️ 範囲外</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 基盤産業 */}
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm font-semibold mb-3">基盤産業 TOP（LQ &gt; 1.0）</p>
            {metro.top_lq_industries.length === 0 ? (
              <p className="text-sm text-slate-500">基盤産業がありません。</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-600">
                    <th className="py-2">産業</th>
                    <th className="text-right py-2">LQ</th>
                    <th className="text-right py-2">基盤雇用推計</th>
                  </tr>
                </thead>
                <tbody>
                  {metro.top_lq_industries.map((ind, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-2">{ind.industry}</td>
                      <td className="text-right py-2">{ind.lq.toFixed(2)}</td>
                      <td className="text-right py-2">{Math.round(ind.basic_emp_estimate).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 全都市圏一覧 */}
          <details className="rounded-lg border bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              ℹ️ 全都市圏で比較する
            </summary>
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="py-2">都市圏</th>
                  <th className="text-right py-2">人口</th>
                  <th className="text-right py-2">総雇用</th>
                  <th className="text-right py-2">PER</th>
                  <th className="text-right py-2">EBM</th>
                  <th className="text-right py-2">基盤率(%)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(allMetros).map(([key, m]) => (
                  <tr
                    key={key}
                    className={`border-b last:border-b-0 ${key === selectedKey ? "bg-amber-50" : ""}`}
                  >
                    <td className="py-2">{m.name}</td>
                    <td className="text-right py-2">{m.population.toLocaleString()}</td>
                    <td className="text-right py-2">{m.total_employment.toLocaleString()}</td>
                    <td className="text-right py-2">{m.per.toFixed(2)}</td>
                    <td className="text-right py-2">{m.ebm.toFixed(2)}</td>
                    <td className="text-right py-2">{m.basic_ratio.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
