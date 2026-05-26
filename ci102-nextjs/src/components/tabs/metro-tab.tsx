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

      {/* このページから読み取れること（解説） */}
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm" open>
        <summary className="cursor-pointer font-semibold">
          📖 このページの読み方 — なぜ都市圏でも EBM が大きく基盤率が低く出るのか
        </summary>
        <div className="mt-3 space-y-3 text-slate-700">
          <p>
            単独自治体（千代田区PER 0.05、横浜市EBM 11.43など）の歪みは
            都市圏集計で<strong>大幅に正規化</strong>されます。実際、東京圏（1都3県）の
            PER 1.93 は教科書 Orlando MSA の 1.91 とほぼ一致。
          </p>
          <p>
            <strong>しかし都市圏でも EBM が 11-29、基盤雇用比率が 3-9% と教科書範囲を外れます。</strong>
            これは『経済圏の歪み』ではなく<strong>日本固有の産業構造</strong>を反映する数学的帰結です。
          </p>

          <p className="font-semibold mt-3">なぜか — 3つの構造的理由：</p>
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              <strong>東京一極集中による『LQ平均化』</strong>:
              LQ は『地域シェア ÷ 全国シェア』。日本では金融・情報通信・本社機能の
              30-40% が東京圏に集中するため、他都市圏でこれらの業種は
              『全国シェアと同等』（LQ ≈ 1.0）に収まりやすい。
              東京圏自身も『全国の30-40%』を占めるためLQが頭打ちになる。
            </li>
            <li>
              <strong>大分類17業種の粒度の粗さ</strong>:
              『卸売・小売業』『情報通信業』のように幅広いカテゴリでまとめると、
              細分の特化産業（例: 金融商品取引業・情報サービス業・機械器具卸売業）が
              『全産業』レベルで相殺される。中分類95業種で再計算すると基盤率が大幅に上がる。
            </li>
            <li>
              <strong>EBM = 1 / 基盤雇用比率 という双曲関係</strong>:
              基盤雇用比率が 5% → EBM 20、10% → EBM 10、20% → EBM 5。
              基盤雇用が薄いと EBM は機械的に膨張する。
              <strong>EBM の大きさ自体は経済の強さの指標ではない</strong>。
            </li>
          </ol>

          <p className="font-semibold mt-3">読み取り方の指針：</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><strong>PER が 1.5-2.5 の範囲に入るか</strong> — 経済圏として閉じているサイン（教科書1.91付近）</li>
            <li><strong>基盤雇用比率 8% 以上</strong> — 何らかの輸出基盤を持つ経済圏（日本ではこれが現実的上限）</li>
            <li><strong>EBM の絶対値ではなく『相対比較』で使う</strong> — 都市圏間で比べたとき、EBM が低い圏ほど多角化（経済基盤が広い）</li>
            <li><strong>基盤産業の中身を見る</strong> — どの業種で特化しているかが、その都市圏の経済キャラクター</li>
          </ul>

          <p className="text-xs text-slate-500 mt-3">
            注: ここで使用する『総雇用』は経済センサス活動調査の事業所所在地ベース民営事業所＋公務。
            『人口』は国勢調査2020年（2015年組替）の常住地ベース。両者の地理的単位がほぼ揃うことで
            都市圏レベルでは PER の歪みが解消される。
          </p>
        </div>
      </details>

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

          {/* 多角化指標と東京の特異性 */}
          {metro.hhi != null && (
            <details className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4" open>
              <summary className="cursor-pointer text-base font-semibold text-emerald-900">
                🏆 なぜ東京圏のEBMが日本で最も低い（最も健全）のか — 多角化指標で実証
              </summary>
              <div className="mt-3 space-y-3 text-sm text-slate-700">
                <p>
                  EBMの大小ランキングを見ると、<strong>東京圏 11.41 が日本最大の都市圏なのに最も健全</strong>。
                  一見すると逆説的ですが、これを<strong>4つの多角化指標</strong>で検証すると、
                  東京圏は『多くの輸出産業を持つ多角化大都市圏』という性質が明確になります。
                </p>

                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-white">
                      <th className="text-left py-2 px-2">指標</th>
                      <th className="text-right py-2 px-2">この都市圏</th>
                      <th className="text-right py-2 px-2">日本他圏平均</th>
                      <th className="text-left py-2 px-2 pl-4">意味</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">基盤産業数（LQ&gt;1.0）</td>
                      <td className="text-right">{metro.n_basic_industries}業種</td>
                      <td className="text-right text-slate-500">~7-9業種</td>
                      <td className="text-xs pl-4">多くの分野で全国シェア超</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">HHI（産業集中度）</td>
                      <td className="text-right">{metro.hhi?.toFixed(0)}</td>
                      <td className="text-right text-slate-500">~1100</td>
                      <td className="text-xs pl-4">低いほど多角化（リスク分散）</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">有効業種数（1/HHI₀₋₁）</td>
                      <td className="text-right">{metro.effective_n_industries?.toFixed(1)}</td>
                      <td className="text-right text-slate-500">~9</td>
                      <td className="text-xs pl-4">実質いくつの業種で経済が回るか</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">シャノンエントロピー</td>
                      <td className="text-right">{metro.shannon_entropy?.toFixed(3)}</td>
                      <td className="text-right text-slate-500">~2.43</td>
                      <td className="text-xs pl-4">業種の多様性（最大2.83）</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">TOP5業種シェア</td>
                      <td className="text-right">{metro.top5_share?.toFixed(1)}%</td>
                      <td className="text-right text-slate-500">~64%</td>
                      <td className="text-xs pl-4">上位5業種への依存度（低いほど分散）</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2">最大LQ業種</td>
                      <td className="text-right">{metro.max_lq?.toFixed(2)}</td>
                      <td className="text-right text-slate-500">~1.58</td>
                      <td className="text-xs pl-4">飛び抜けた特化があるか</td>
                    </tr>
                  </tbody>
                </table>

                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <p className="font-semibold">💡 東京圏が他都市圏とどう違うか（実データ）</p>
                  <ol className="list-decimal pl-5 mt-2 space-y-1.5">
                    <li>
                      <strong>基盤産業数が最多（9業種）</strong>:
                      情報通信業 LQ=2.10、専門・技術サービス業 LQ=1.39、不動産業 LQ=1.31、
                      金融業 LQ=1.29 など、複数分野で全国シェア超。観光地・工業都市の
                      『1業種大特化』とは対照的。
                    </li>
                    <li>
                      <strong>HHI 960 で最低（最も多角化）</strong>:
                      他都市圏平均 HHI 1104 より 13% 低い。経済リスクが特定産業に
                      集中していない。
                    </li>
                    <li>
                      <strong>TOP5シェア 58.0%</strong>:
                      他都市圏平均 64.4% より低く、上位産業への依存度が小さい。
                      残り40%超を11業種以上が支える。
                    </li>
                    <li>
                      <strong>輸出指向の高付加価値業種で特化</strong>:
                      金融・情報・本社機能（管理事務所）・専門サービス等。
                      物理的な財ではなくサービスを全国に提供する『東京モデル』。
                    </li>
                  </ol>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="font-semibold">📚 教科書 Orlando MSA との対比</p>
                  <p className="mt-1">
                    Orlando MSA EBM 4.94 = 観光（Leisure）・金融（Financial）・専門サービス（Professional）の
                    <strong>3業種で強く特化</strong>している大都市圏。LQ平均が高い（1.45）が、
                    特化分野は狭い（基盤産業 7業種）。
                  </p>
                  <p className="mt-2">
                    東京圏 EBM 11.41 = 9業種で<strong>広く中程度に特化</strong>している大都市圏。
                    平均LQは低めだが、基盤産業数とエントロピーは最大。
                  </p>
                  <p className="mt-2">
                    <strong>どちらも『多角化された健全な大都市圏』</strong>だが、
                    特化のパターンが異なる。日本固有の東京一極集中構造により、
                    東京圏は「広く深い」特化、Orlando は「狭く深い」特化。
                  </p>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded p-3">
                  <p className="font-semibold">⚠️ EBM絶対値だけで判断しないこと</p>
                  <p className="mt-1">
                    EBM 11.41（東京圏）と 28.98（大阪圏）の差は『東京が17ポイント健全』では<strong>ありません</strong>。
                    Orlando MSA 4.94 を絶対基準にすれば、両方とも『教科書範囲外』。
                    しかし<strong>日本の都市圏内では相対順位として意味がある</strong>:
                    東京圏は『日本の大都市圏で最も多角化』、大阪圏は『東京一極集中の影響で特化業種が少ない』。
                  </p>
                </div>
              </div>
            </details>
          )}

          {/* 全都市圏一覧 */}
          <details className="rounded-lg border bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              ℹ️ 全都市圏で比較する（多角化指標付き）
            </summary>
            <table className="w-full text-xs mt-3">
              <thead>
                <tr className="border-b text-left text-slate-600">
                  <th className="py-2">都市圏</th>
                  <th className="text-right py-2">人口</th>
                  <th className="text-right py-2">EBM</th>
                  <th className="text-right py-2">基盤率</th>
                  <th className="text-right py-2">基盤産業</th>
                  <th className="text-right py-2">HHI</th>
                  <th className="text-right py-2">有効業種</th>
                  <th className="text-right py-2">最大LQ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(allMetros)
                  .sort((a, b) => a[1].ebm - b[1].ebm)
                  .map(([key, m]) => (
                  <tr
                    key={key}
                    className={`border-b last:border-b-0 ${key === selectedKey ? "bg-amber-50" : ""}`}
                  >
                    <td className="py-2 font-medium">{m.name}</td>
                    <td className="text-right py-2">{m.population.toLocaleString()}</td>
                    <td className="text-right py-2 font-semibold">{m.ebm.toFixed(2)}</td>
                    <td className="text-right py-2">{m.basic_ratio.toFixed(1)}%</td>
                    <td className="text-right py-2">{m.n_basic_industries ?? "—"}</td>
                    <td className="text-right py-2">{m.hhi?.toFixed(0) ?? "—"}</td>
                    <td className="text-right py-2">{m.effective_n_industries?.toFixed(1) ?? "—"}</td>
                    <td className="text-right py-2">{m.max_lq?.toFixed(2) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-2">
              ※ EBM昇順表示（最も健全 → 不健全）。HHI低・有効業種数多 = 多角化されている。
            </p>
          </details>
        </>
      )}
    </div>
  );
}
