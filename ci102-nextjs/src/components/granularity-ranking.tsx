"use client";

/**
 * 全47都道府県 粒度効果ランキング — Phase 6.6 拡張。
 *
 * Mulligan凸性質を全47都道府県で一覧表示。「どの県が最も粒度効果が大きいか」
 * 「教科書範囲内に入る県はどれか」を一覧で把握できる。
 *
 * 教育的発見:
 *   - 日本の半数以上の県が L2 で教科書範囲 (≤5.5) に入る
 *   - 大阪・福岡など主要地方都市は依然として高い (細分類化の余地)
 *   - 「日本は東京一極集中で他県の経済基盤が薄い」という従来観点への定量的反論
 */
import { useState } from "react";
import { useAllGranularityProgression, type GranularityProgression } from "@/lib/use-granularity-progression";

type SortKey = "ebm_l0" | "ebm_l2" | "reduction" | "compression";

export function GranularityRanking() {
  const { data, loading, error } = useAllGranularityProgression();
  const [sortKey, setSortKey] = useState<SortKey>("ebm_l2");
  const [asc, setAsc] = useState(true);

  if (loading) {
    return <div className="text-sm text-slate-500">粒度ランキングデータ読込中...</div>;
  }
  if (error || !data) {
    return null;
  }

  // 47県のリストを整形
  const rows = Object.entries(data).map(([code, d]) => ({
    code,
    pref_name: d.pref_name,
    ebm_l0: d.levels[0].ebm,
    ebm_l1: d.levels[1].ebm,
    ebm_l2: d.levels[2].ebm,
    reduction: d.ebm_reduction,
    compression: d.compression_pct,
    n_basic_l2: d.levels[2].n_basic,
    in_range: d.in_textbook_range,
    basic_ratio_l2: d.levels[2].basic_ratio_pct,
  }));

  // ソート
  const sorted = [...rows].sort((a, b) => {
    const av = (a as unknown as Record<string, number>)[sortKey] ?? 0;
    const bv = (b as unknown as Record<string, number>)[sortKey] ?? 0;
    return asc ? av - bv : bv - av;
  });

  const inRangeCount = rows.filter((r) => r.in_range).length;

  // 圧縮率最大 (L2 が L0 の何%まで圧縮されたか、低いほど効果大)
  const mostCompressed = [...rows].sort((a, b) => a.compression - b.compression)[0];
  // L2 教科書最近接 (Orlando 4.94 との差の絶対値が最小)
  const closestToOrlando = [...rows].sort((a, b) => Math.abs(a.ebm_l2 - 4.94) - Math.abs(b.ebm_l2 - 4.94))[0];
  // L0→L2 削減幅最大
  const biggestReduction = [...rows].sort((a, b) => b.reduction - a.reduction)[0];

  const flipSort = (key: SortKey) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const sortIcon = (key: SortKey) => (sortKey === key ? (asc ? " ↑" : " ↓") : "");

  return (
    <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50/30 p-4 space-y-3" data-print-block>
      <div>
        <p className="text-base font-semibold text-indigo-900">
          🌀 全47都道府県 Mulligan凸性質ランキング
        </p>
        <p className="text-xs text-slate-700 mt-1">
          業種粒度を細かくすると EBM が単調減少する Mulligan & Murphy (1995) の理論を、
          全47都道府県で実証。どの県が最も粒度効果が大きいか、どの県が教科書 Orlando MSA 4.94 に近いかを一覧表示。
        </p>
      </div>

      {/* ハイライト3つ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded bg-emerald-50 border border-emerald-200 p-2">
          <p className="text-[11px] text-emerald-700">教科書範囲内 (L2 ≤ 5.5) の県数</p>
          <p className="text-2xl font-bold text-emerald-900">{inRangeCount} / 47</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            日本の {(inRangeCount / 47 * 100).toFixed(0)}% の県が、米国 Orlando MSA と同等以上の多角化を持つ
          </p>
        </div>
        <div className="rounded bg-blue-50 border border-blue-200 p-2">
          <p className="text-[11px] text-blue-700">教科書値 (4.94) 最近接</p>
          <p className="text-base font-bold text-blue-900">{closestToOrlando.pref_name}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            L2 EBM = {closestToOrlando.ebm_l2.toFixed(2)} (差: {(closestToOrlando.ebm_l2 - 4.94).toFixed(2)})
          </p>
        </div>
        <div className="rounded bg-purple-50 border border-purple-200 p-2">
          <p className="text-[11px] text-purple-700">最も粒度効果大 (L0→L2 圧縮率)</p>
          <p className="text-base font-bold text-purple-900">{mostCompressed.pref_name}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {mostCompressed.compression.toFixed(0)}% に圧縮 (L0 {mostCompressed.ebm_l0.toFixed(2)} → L2 {mostCompressed.ebm_l2.toFixed(2)})
          </p>
        </div>
      </div>

      {/* ランキングテーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-indigo-100 sticky top-0">
            <tr>
              <th className="text-left p-1.5 w-32">都道府県</th>
              <th
                className="text-right p-1.5 cursor-pointer hover:bg-indigo-200"
                onClick={() => flipSort("ebm_l0")}
              >
                L0 大分類17{sortIcon("ebm_l0")}
              </th>
              <th className="text-right p-1.5">L1 中分類95</th>
              <th
                className="text-right p-1.5 cursor-pointer hover:bg-indigo-200"
                onClick={() => flipSort("ebm_l2")}
              >
                L2 +細分類{sortIcon("ebm_l2")}
              </th>
              <th
                className="text-right p-1.5 cursor-pointer hover:bg-indigo-200"
                onClick={() => flipSort("reduction")}
              >
                L0→L2 削減{sortIcon("reduction")}
              </th>
              <th
                className="text-right p-1.5 cursor-pointer hover:bg-indigo-200"
                onClick={() => flipSort("compression")}
              >
                圧縮率%{sortIcon("compression")}
              </th>
              <th className="text-right p-1.5">基盤業種(L2)</th>
              <th className="text-center p-1.5">教科書範囲</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.code}
                className={`border-b last:border-b-0 ${r.in_range ? "bg-emerald-50/50" : ""} hover:bg-slate-100`}
              >
                <td className="p-1.5 font-medium">{r.pref_name}</td>
                <td className="text-right p-1.5 font-mono">{r.ebm_l0.toFixed(2)}</td>
                <td className="text-right p-1.5 font-mono text-slate-500">{r.ebm_l1.toFixed(2)}</td>
                <td className="text-right p-1.5 font-mono font-bold" style={{ color: r.in_range ? "#047857" : r.ebm_l2 < 7 ? "#0891b2" : "#b91c1c" }}>
                  {r.ebm_l2.toFixed(2)}
                </td>
                <td className="text-right p-1.5 font-mono text-emerald-700">
                  -{r.reduction.toFixed(2)}
                </td>
                <td className="text-right p-1.5 font-mono text-slate-600">
                  {r.compression.toFixed(0)}%
                </td>
                <td className="text-right p-1.5">{r.n_basic_l2}</td>
                <td className="text-center p-1.5">
                  {r.in_range ? "✓" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 教育的解釈 */}
      <div className="rounded bg-amber-50 border border-amber-200 p-3 text-xs space-y-1.5">
        <p className="font-semibold">💡 ランキングから読み取れる発見</p>
        <ul className="list-disc list-inside space-y-1 text-slate-700">
          <li>
            <strong>{inRangeCount}/47県 (約{(inRangeCount / 47 * 100).toFixed(0)}%) が L2 で教科書範囲内</strong>:
            「日本は東京一極集中で地方は経済基盤が薄い」という従来観点は、業種粒度が粗いことによる<strong>過大評価の人工物</strong>だった可能性。
            細分類化すれば、多くの県が米国の健全大都市圏 (Orlando MSA EBM 4.94) と同等の多様性を持つ。
          </li>
          <li>
            <strong>圧縮率が小さい県 (L2 が L0 の半分以下)</strong>: 大分類では多くの業種が「全国平均」に紛れていたが、細分類化で特化業種が表面化。
            <strong>本来の経済基盤が強い</strong>サイン。
          </li>
          <li>
            <strong>L2 がまだ 7-10 の県</strong>: 卸売・小売業の細分類化だけでは下げきれない。
            <strong>製造業・サービス業の細分類化</strong>でさらに低下する余地あり (将来課題)。
          </li>
          <li>
            <strong>教科書範囲内の都道府県の特徴</strong>: 観光特化県 (沖縄・京都)・首都圏中心 (東京)・産業集積県 (愛知)。
            米国 Orlando 型「狭く深い特化」と日本固有の「広く中程度の特化」が両立する。
          </li>
        </ul>
      </div>

      <p className="text-[11px] text-slate-500">
        ※ L2 は卸売・小売業 (G大分類、12中分類) を 156細分類に展開。他大分類 (製造業/サービス業等) は中分類維持。
        全業種完全細分類は e-Stat 個別テーブル取得が必要 (将来課題)。
      </p>
    </div>
  );
}
