"use client";

import { useState, useMemo } from "react";
import { useMuniIndustryMatrix, computeCustomMetro } from "@/lib/use-muni-industry";
import { PREFECTURES } from "@/lib/codes";

export default function CustomMetroTab() {
  const { matrix, loading, error } = useMuniIndustryMatrix();
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [filterPref, setFilterPref] = useState<number>(13);
  const [search, setSearch] = useState("");

  // フィルタリングされた市区町村リスト
  const filteredAreas = useMemo(() => {
    if (!matrix) return [];
    return Object.entries(matrix)
      .filter(([code, entry]) => {
        if (code === "00000") return false;
        if (entry.pref_code !== filterPref) return false;
        if (search && !entry.area_name.includes(search)) return false;
        return true;
      })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, entry]) => ({ code, ...entry }));
  }, [matrix, filterPref, search]);

  // カスタム経済圏の計算結果
  const result = useMemo(() => {
    if (!matrix || selectedAreas.size === 0) return null;
    return computeCustomMetro(matrix, Array.from(selectedAreas));
  }, [matrix, selectedAreas]);

  const toggleArea = (code: string) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAllInPref = () => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      filteredAreas.forEach((a) => next.add(a.code));
      return next;
    });
  };

  const clearSelection = () => setSelectedAreas(new Set());

  if (loading) return <div className="text-sm text-slate-500">市区町村業種データを読み込み中...</div>;
  if (error || !matrix) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        データ読み込みエラー: {error || "データなし"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">カスタム経済圏分析</h2>
        <p className="text-sm text-gray-700">
          複数の市区町村を選択して<strong>独自の経済圏として合算評価</strong>します。
          例: 「藤沢市 + 鎌倉市 + 茅ヶ崎市 + 平塚市」で湘南エリア、「函館市 + 北斗市 + 七飯町」で道南エリアなど。
        </p>
      </div>

      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-3 text-sm">
        <strong>💡 使い方</strong>:
        左側で県を選んで市区町村にチェックを入れると、右側に合算結果が即座に表示されます。
        都道府県をまたいで選択することも可能（例: 神奈川県と東京都を組み合わせて湘南＋多摩エリア）。
      </div>

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
        {/* 左: 選択UI */}
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <label className="text-sm font-semibold">県を選ぶ:</label>
            <select
              value={filterPref}
              onChange={(e) => setFilterPref(Number(e.target.value))}
              className="rounded px-2 py-1 text-sm border"
            >
              {Object.entries(PREFECTURES).map(([code, name]) => (
                <option key={code} value={code}>
                  {String(code).padStart(2, "0")} {name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="市区町村名で検索"
            className="w-full rounded px-2 py-1 text-sm border"
          />
          <div className="flex gap-2 text-xs">
            <button
              onClick={selectAllInPref}
              className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200"
            >
              県内すべて選択
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200"
            >
              全クリア
            </button>
            <span className="ml-auto text-slate-500 self-center">
              選択中: <strong>{selectedAreas.size}市区町村</strong>
            </span>
          </div>

          <div className="max-h-[400px] overflow-y-auto border rounded">
            {filteredAreas.map((a) => {
              const checked = selectedAreas.has(a.code);
              const empSum = Object.values(a.employment).reduce((s, v) => s + v, 0);
              return (
                <label
                  key={a.code}
                  className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm hover:bg-slate-50 ${
                    checked ? "bg-emerald-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleArea(a.code)}
                    className="accent-emerald-600"
                  />
                  <span className="flex-1 truncate">{a.area_name}</span>
                  <span className="text-xs text-slate-500">{empSum.toLocaleString()}人</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* 右: 結果 */}
        <div className="space-y-3">
          {!result ? (
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center text-slate-500 text-sm">
              👈 左側で市区町村を選択してください
            </div>
          ) : (
            <>
              {/* 選択された市区町村サマリ */}
              <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                <strong>選択中の経済圏</strong>: {selectedAreas.size}市区町村
                ({Array.from(selectedAreas).slice(0, 5).map((c) => matrix[c]?.area_name).filter(Boolean).join("、")}
                {selectedAreas.size > 5 ? ` ほか${selectedAreas.size - 5}市区町村` : ""})
              </div>

              {/* KPI */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <KpiBox label="総雇用" value={result.total_employment.toLocaleString()} />
                <KpiBox label="基盤雇用" value={Math.round(result.basic_employment).toLocaleString()} />
                <KpiBox label="基盤雇用比率" value={`${result.basic_ratio.toFixed(1)}%`} sub="Orlando: 20.2%" />
                <KpiBox label="EBM" value={result.ebm.toFixed(2)} sub="Orlando: 4.94 / 健全 3-6" />
                <KpiBox label="基盤産業数" value={String(result.n_basic_industries)} />
                <KpiBox label="HHI" value={result.hhi.toFixed(0)} sub="低=多角化" />
              </div>

              {/* 多角化指標 */}
              <div className="rounded-lg border bg-white p-3">
                <p className="text-sm font-semibold mb-2">📊 多角化指標</p>
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1">有効業種数 (1/HHI)</td>
                      <td className="text-right py-1 font-semibold">{result.effective_n_industries.toFixed(2)}</td>
                      <td className="text-right py-1 text-slate-500">最大17</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1">シャノンエントロピー</td>
                      <td className="text-right py-1 font-semibold">{result.shannon_entropy.toFixed(3)}</td>
                      <td className="text-right py-1 text-slate-500">最大2.833</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 基盤産業 TOP */}
              <div className="rounded-lg border bg-white p-3">
                <p className="text-sm font-semibold mb-2">基盤産業 TOP {Math.min(result.top_lq_industries.length, 10)}</p>
                {result.top_lq_industries.length === 0 ? (
                  <p className="text-xs text-slate-500">LQ &gt; 1.0 の業種がありません。</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-slate-600">
                        <th className="py-1">業種</th>
                        <th className="text-right py-1">雇用</th>
                        <th className="text-right py-1">LQ</th>
                        <th className="text-right py-1">基盤雇用</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.top_lq_industries.map((r) => (
                        <tr key={r.industry} className="border-b last:border-b-0">
                          <td className="py-1">{r.industry}</td>
                          <td className="text-right py-1">{r.local_emp.toLocaleString()}</td>
                          <td className="text-right py-1">{r.lq.toFixed(2)}</td>
                          <td className="text-right py-1">{Math.round(r.basic_emp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* 解釈ガイド */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs space-y-1">
                <p><strong>EBM の解釈</strong>:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {result.ebm >= 3.0 && result.ebm <= 6.0 && (
                    <li>EBM {result.ebm.toFixed(2)} = 教科書MSA健全レンジ（多角化＋輸出基盤）</li>
                  )}
                  {result.ebm > 8.0 && (
                    <li>EBM {result.ebm.toFixed(2)} = 基盤雇用が薄く乗数が機械的膨張（経済圏が狭すぎる可能性。隣接市町村を追加検討）</li>
                  )}
                  {result.ebm < 2.5 && result.ebm > 0 && (
                    <li>EBM {result.ebm.toFixed(2)} = 過剰特化または集計範囲が広すぎる</li>
                  )}
                  {result.basic_ratio >= 15 && result.basic_ratio <= 30 && (
                    <li>基盤雇用比率 {result.basic_ratio.toFixed(1)}% = 健全レンジ（Orlando 20.2%並）</li>
                  )}
                  <li>これは<strong>大分類17業種版</strong>での計算。詳細な特化を見る場合は通常のスコアカードで中分類版もご確認ください</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
