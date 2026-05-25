"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ---------- Table of Contents ---------- */
const TOC = [
  { id: "intro", label: "はじめに: CI102とは何か" },
  { id: "ch1-lq", label: "第1章: 特化係数（LQ）" },
  { id: "ch2-ebm", label: "第2章: 経済基盤乗数（EBM）" },
  { id: "ch3-per", label: "第3章: 人口雇用比率（PER）" },
  { id: "ch4-shift", label: "第4章: シフトシェア分析" },
  { id: "ch5-gap", label: "第5章: 小売ギャップ分析" },
  { id: "ch6-score", label: "第6章: 投資適格スコア" },
  { id: "ch7-spatial", label: "第7章: 空間データ分析" },
  { id: "ch8-compare", label: "第8章: 地域比較分析" },
  { id: "summary", label: "まとめ: 投資判断に活かす" },
];

/* ---------- Reusable Section Wrapper ---------- */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl font-bold text-[#1B2A4A] dark:text-white">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm md:prose-base dark:prose-invert max-w-none space-y-6">
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

/* ---------- Formula display ---------- */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/50 px-4 py-3 font-mono text-sm md:text-base overflow-x-auto">
      {children}
    </div>
  );
}

/* ---------- Interpretation table ---------- */
function InterpTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left border-b-2 border-foreground/20 px-3 py-2 font-semibold bg-muted/30">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-foreground/10">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Callout boxes ---------- */
function CaseStudy({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-l-[#2A9D8F] bg-green-50 dark:bg-green-950/20 p-4 space-y-2">
      <p className="font-semibold text-[#2A9D8F]">{title}</p>
      {children}
    </div>
  );
}

function ClientTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-l-[#D4A843] bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
      <p className="font-semibold text-[#D4A843]">お客様への説明ポイント</p>
      {children}
    </div>
  );
}

/* ---------- Main Page ---------- */
export default function LearnPage() {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    TOC.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-gray-950">
      {/* Header */}
      <header className="text-white px-4 py-3 shadow-md md:px-6 md:py-4 bg-[#1B2A4A] dark:bg-gray-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1"
            >
              &larr; ダッシュボード
            </Link>
            <span className="text-white/30">|</span>
            <h1 className="text-lg font-bold tracking-tight md:text-xl">
              CI102 分析手法ガイド
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/compare"
              className="text-sm text-white/70 hover:text-white transition-colors hidden md:inline-flex"
            >
              地域比較 &rarr;
            </Link>
            <Badge variant="outline" className="text-white border-white/30 hidden md:inline-flex">
              CCIM 不動産投資のための市場分析
            </Badge>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar TOC (desktop) */}
        <nav className="hidden lg:block w-64 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto py-6 pl-6 pr-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            目次
          </p>
          <ul className="space-y-1">
            {TOC.map(({ id, label }) => (
              <li key={id}>
                <button
                  onClick={() => scrollTo(id)}
                  className={`text-left w-full text-sm px-3 py-1.5 rounded transition-colors ${
                    activeId === id
                      ? "bg-[#1B2A4A]/10 dark:bg-white/10 text-[#1B2A4A] dark:text-white font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 py-6 md:px-6 space-y-6">
          {/* Mobile TOC */}
          <nav className="lg:hidden">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">目次</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {TOC.map(({ id, label }) => (
                    <li key={id}>
                      <button
                        onClick={() => scrollTo(id)}
                        className="text-left w-full text-sm px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </nav>

          {/* ======================== はじめに ======================== */}
          <Section id="intro" title="はじめに: CI102とは何か">
            <p>
              CI102（Market Analysis for Commercial Investment Real Estate）は、
              CCIM（Certified Commercial Investment Member）が体系化した
              不動産投資のための市場分析手法です。
            </p>
            <p>
              不動産の価値は、その立地の経済構造によって決まります。
              「駅から近い」「築年数が浅い」といった物件固有の条件だけでなく、
              その地域に<strong>どんな産業が集まり、どれだけの雇用を生み、
              どれだけの人口を支えているか</strong>が、長期的な投資収益を左右します。
            </p>
            <p>
              CI102は以下の6つの分析ツールを組み合わせ、地域経済の構造を数値で把握します。
            </p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 not-prose">
              {[
                { n: "LQ", label: "特化係数", desc: "地域の産業集積度" },
                { n: "EBM", label: "経済基盤乗数", desc: "波及効果の大きさ" },
                { n: "PER", label: "人口雇用比率", desc: "住宅需要の推計" },
                { n: "SS", label: "シフトシェア", desc: "成長要因の分解" },
                { n: "Gap", label: "ギャップ分析", desc: "商業機会の発見" },
                { n: "Score", label: "投資適格", desc: "総合判断スコア" },
              ].map((t) => (
                <div key={t.n} className="rounded-lg border p-3 text-center">
                  <Badge className="mb-1">{t.n}</Badge>
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
              ))}
            </div>
            <p>
              これらの分析は相互に連結しています。LQで基盤産業を特定し、
              EBMで波及効果を測り、PERで住宅需要に変換し、
              シフトシェアで競争力を検証し、ギャップ分析で商業機会を探る
              ——この一連のフローが、データに基づいた投資判断を可能にします。
            </p>
          </Section>

          {/* ======================== 第1章: LQ ======================== */}
          <Section id="ch1-lq" title="第1章: 特化係数（LQ）— 地域の強みを数値化する">
            <h3 className="font-semibold text-lg">なぜ重要か</h3>
            <p>
              不動産投資では「この地域にはどんな産業が集まっているか」が根本的な問いです。
              特化係数（Location Quotient）は、ある産業が全国平均と比べてどれだけ集積しているかを
              1つの数字で表します。LQが高い産業は<strong>基盤産業</strong>
              ——域外から資金を呼び込み、地域経済を下支えする産業です。
            </p>

            <h3 className="font-semibold text-lg">計算式</h3>
            <Formula>
              LQ = (地域の産業i従業者数 &divide; 地域の総従業者数) &divide; (全国の産業i従業者数 &divide; 全国の総従業者数)
            </Formula>
            <p className="text-sm text-muted-foreground">
              分子は「地域内でのその産業のシェア」、分母は「全国でのその産業のシェア」。
              両者を割ることで、全国平均に対する相対的な集積度がわかります。
            </p>

            <h3 className="font-semibold text-lg">読み方</h3>
            <InterpTable
              headers={["LQ値", "意味", "投資への示唆"]}
              rows={[
                ["LQ > 1.0", "全国平均以上に集積 → 基盤産業", "域外から資金を呼び込む。テナント需要の源泉。"],
                ["LQ = 1.0", "全国平均並み", "域内消費向け。安定だが成長ドライバーにはなりにくい。"],
                ["LQ < 1.0", "全国平均以下", "域内需要を満たしきれていない可能性。"],
              ]}
            />
            <p>
              ただしLQが高いだけでは不十分です。雇用の絶対数が少ない産業（例: 鉱業のLQ=2.37でも従業者1,500人程度）は
              地域経済への実質的な影響力が限られます。<strong>LQと雇用規模を併せて評価</strong>することが重要です。
            </p>

            <h3 className="font-semibold text-lg">基盤雇用の推計</h3>
            <p>LQが1.0を超える産業には「基盤雇用」が存在します。これは全国平均を超える分の雇用であり、域外需要に対応している部分です。</p>
            <Formula>
              基盤雇用 = 地域の産業i従業者数 &times; (1 - 1/LQ)　（LQ &gt; 1の場合のみ）
            </Formula>

            <h3 className="font-semibold text-lg">ケーススタディ: 東京都の情報通信業</h3>
            <CaseStudy title="東京都 — 情報通信業 LQ = 3.36">
              <p>
                東京都の情報通信業のLQは3.36。全国平均の3倍以上の雇用が集中しています。
                推定基盤雇用は約73.7万人。この産業は域外（地方企業・海外企業）向けに
                サービスを提供し、東京に外部資金を流入させています。
              </p>
              <p>
                この資金がオフィス需要を支え、周辺の住宅・商業不動産の価値を底上げしています。
                東京には他にも金融業（LQ=1.76、基盤雇用18.4万人）、
                学術研究・専門サービス業（LQ=1.74、基盤雇用25.8万人）など
                複数の基盤産業が存在し、産業構造が多角化されています。
              </p>
              <p className="text-sm text-muted-foreground">
                比較: 北海道の最大LQ産業は鉱業・採石業（LQ=2.37）ですが、
                基盤雇用はわずか約1,000人。LQの高さと経済インパクトは別の指標で測る必要があります。
              </p>
            </CaseStudy>

            <h3 className="font-semibold text-lg">お客様への説明ポイント</h3>
            <ClientTip>
              <p className="italic">
                「この地域にはLQが1.5以上の基盤産業が5つあります。
                つまり、5つの異なる産業が域外から安定的に資金を呼び込んでいるため、
                1つの産業が不振でも他が補完します。これが投資リスクを低減する構造です。」
              </p>
              <p className="italic">
                「逆に、基盤産業が1つしかない地域は企業城下町のリスクがあります。
                その1社が撤退すれば、テナント需要も人口も急減する可能性があります。」
              </p>
            </ClientTip>

            <h3 className="font-semibold text-lg">知っておくべき制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-2">
                <li>
                  <strong>「全国どこでも同じ消費パターン」という前提がある:</strong>{" "}
                  LQは、全国の消費者が同じ割合で各産業のサービスを利用していると仮定して計算しています。
                  そのため、観光客が多い京都・沖縄、自衛隊基地がある地域、大学が集中する学園都市などでは、
                  域外からの特殊な需要がLQを歪める場合があります。
                </li>
                <li>
                  <strong>「製造業」の中身が見えない:</strong>{" "}
                  産業大分類のLQでは、同じ「製造業」でも自動車工場と食品工場では
                  必要な不動産の種類も雇用の質も全く異なります。
                  LQ=1.0だから基盤産業ではない、と即断しないよう注意してください。
                </li>
                <li>
                  <strong>データは「過去の写真」:</strong>{" "}
                  経済センサス（2021年6月調査）は、その時点の産業構造を切り取ったスナップショットです。
                  調査後に進出した企業（例: TSMCの熊本工場）や撤退した企業の影響は反映されていません。
                </li>
              </ul>
            </div>
          </Section>

          {/* ======================== 第2章: EBM ======================== */}
          <Section id="ch2-ebm" title="第2章: 経済基盤乗数（EBM）— 波及効果を測る">
            <h3 className="font-semibold text-lg">なぜ重要か</h3>
            <p>
              基盤産業が1人の雇用を生むと、その従業者の消費活動が域内にさらなる雇用を生みます。
              レストラン、小売店、医療機関、学校——これらの「非基盤雇用」は基盤産業が生む需要に
              支えられています。経済基盤乗数（Economic Base Multiplier）は、
              この<strong>波及効果の大きさ</strong>を数値化します。
            </p>

            <h3 className="font-semibold text-lg">計算式</h3>
            <Formula>
              EBM = 総雇用 &divide; 基盤雇用
            </Formula>
            <p>
              例えば EBM=5.0 なら、基盤雇用1人に対して非基盤雇用4人が支えられている構造です。
              基盤雇用が100人増えると、総雇用は500人増える波及効果があることを意味します。
            </p>

            <h3 className="font-semibold text-lg">読み方</h3>
            <InterpTable
              headers={["EBM値", "意味", "投資への示唆"]}
              rows={[
                ["EBM > 10", "波及効果が大きい（基盤比率が低い）", "少数の基盤産業に強く依存。波及は大きいが、基盤産業の変動リスクも増幅される。"],
                ["EBM 3〜10", "バランスの取れた構造", "基盤・非基盤のバランスが良い。安定した投資環境。"],
                ["EBM < 3", "基盤比率が高い", "域外依存度が高い。輸出型経済だが、域内消費基盤が薄い可能性。"],
              ]}
            />

            <h3 className="font-semibold text-lg">ケーススタディ: 大阪 vs 北海道</h3>
            <CaseStudy title="大阪府 EBM=20.57 vs 北海道 EBM=11.34">
              <p>
                大阪府のEBM=20.57（基盤比率4.9%）。総雇用472万人に対し基盤雇用は約23万人。
                少数の基盤産業が巨大な域内経済を支えています。
                波及効果は大きいものの、基盤産業が縮小すると影響も大きく増幅されます。
              </p>
              <p>
                北海道のEBM=11.34（基盤比率8.8%）。基盤比率が高い分、
                域外依存の産業が相対的に多く、波及効果はやや控えめです。
                しかし基盤が分散しているため、特定産業への依存リスクは低い傾向があります。
              </p>
            </CaseStudy>

            <h3 className="font-semibold text-lg">需要予測カスケード</h3>
            <p>
              EBMの真価は「What-Ifシミュレーション」に使える点です。
              基盤雇用の変化がどこまで波及するかを段階的に計算できます。
            </p>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <p className="font-semibold">シミュレーション例: 大阪府に基盤雇用 +100人の場合</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>基盤雇用 +100人</li>
                <li>総雇用変化 = 100 &times; EBM(20.57) = <strong>+2,057人</strong></li>
                <li>人口変化 = 2,057 &times; PER(1.87) = <strong>+3,847人</strong></li>
                <li>住戸需要 = 3,847 &divide; 世帯人員(2.14) = <strong>+1,798戸</strong></li>
              </ol>
              <p className="text-xs text-muted-foreground mt-2">
                注意: これはシミュレーションであり予測ではありません。
                実際の雇用変化（2016→2021年の実績）と併せて判断してください。
              </p>
            </div>

            <h3 className="font-semibold text-lg">お客様への説明ポイント</h3>
            <ClientTip>
              <p className="italic">
                「仮にこの地域に新たな基盤産業が100人の雇用を生んだ場合、
                波及効果により総雇用は約2,000人増加し、約1,800戸の住宅需要が
                新たに生まれる計算になります。これが不動産需要の底上げメカニズムです。」
              </p>
              <p className="italic">
                「ただし逆も真です。基盤産業が100人縮小すれば同じ規模の需要が消えます。
                だからこそ、基盤産業の多角化が重要なのです。」
              </p>
            </ClientTip>

            <h3 className="font-semibold text-lg">知っておくべき制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-2">
                <li>
                  <strong>乗数は「今の写真」でしかない:</strong>{" "}
                  EBM=20の地域でも、基盤産業が入れ替われば乗数は大きく変わります。
                  例えば製造業中心の地域にIT企業が参入し始めた場合、5年後のEBMは全く違う値になり得ます。
                </li>
                <li>
                  <strong>「100人増えたら500人増える」は直線的な仮定:</strong>{" "}
                  カスケード計算は基盤雇用の変化が比例的に波及すると仮定していますが、
                  実際には住宅供給の上限・インフラ容量・労働市場の逼迫などで波及効果は頭打ちになります。
                  特に1,000人以上の大規模変動シミュレーションでは過大推計に注意してください。
                </li>
                <li>
                  <strong>シミュレーション結果は「予測」ではない:</strong>{" "}
                  ダッシュボードの数字は「仮にX人増えたら」の参考値であり、
                  「X人増える見通し」ではありません。お客様に説明する際は、
                  実績の雇用変化（2016→2021年）と並べて示すことが重要です。
                </li>
              </ul>
            </div>
          </Section>

          {/* ======================== 第3章: PER ======================== */}
          <Section id="ch3-per" title="第3章: 人口雇用比率（PER）— 住宅需要を推計する">
            <h3 className="font-semibold text-lg">なぜ重要か</h3>
            <p>
              雇用が増えると人口が増え、人口が増えると住宅需要が増えます。
              人口雇用比率（Population-Employment Ratio）は、雇用1人あたり
              何人の人口を支えているかを示す比率で、雇用変化を人口変化に換算するための
              「変換係数」として使います。
            </p>

            <h3 className="font-semibold text-lg">計算式</h3>
            <Formula>
              PER = 人口 &divide; 総雇用
            </Formula>

            <h3 className="font-semibold text-lg">読み方</h3>
            <InterpTable
              headers={["PER値", "意味", "投資への示唆"]}
              rows={[
                ["PER < 1.5", "雇用密度が非常に高い（昼間人口流入型）", "通勤圏が広い。オフィス・商業投資向き。"],
                ["PER 1.5〜2.0", "雇用と居住のバランス型", "職住近接。住宅・商業のバランスの取れた投資。"],
                ["PER > 2.0", "居住者比率が高い（ベッドタウン型）", "住宅投資向きだが、雇用が域外に依存。"],
              ]}
            />

            <h3 className="font-semibold text-lg">ケーススタディ: 東京(1.36) vs 北海道(2.29)</h3>
            <CaseStudy title="PERが示す地域の性格の違い">
              <p>
                東京都のPER=1.36。人口1,352万人に対し雇用993万人。
                近隣県からの通勤者を大量に受け入れる「雇用吸引型」の地域です。
                雇用が100人増えても人口増は136人にとどまります。
                つまり雇用増がそのまま居住人口増に直結しにくい——オフィス・商業投資向きの構造です。
              </p>
              <p>
                北海道のPER=2.29。人口538万人に対し雇用235万人。
                雇用が100人増えると人口は229人増える計算になります。
                1人の雇用が扶養家族を含めてより多くの居住者を生む「居住型」の地域で、
                住宅投資における雇用変化のインパクトが大きくなります。
              </p>
            </CaseStudy>

            <h3 className="font-semibold text-lg">住戸需要への変換</h3>
            <p>人口変化を住戸需要に変換するには、世帯人員数で割ります。</p>
            <Formula>
              住戸需要 = 人口変化 &divide; 1世帯あたり人員数
            </Formula>
            <p className="text-sm text-muted-foreground">
              東京都の世帯人員は1.87人、北海道は2.18人。
              東京は単身・少人数世帯が多いため、同じ人口増でもより多くの住戸が必要になります。
            </p>

            <h3 className="font-semibold text-lg">お客様への説明ポイント</h3>
            <ClientTip>
              <p className="italic">
                「この地域はPERが2.3と高く、雇用者1人あたり2.3人の人口を支えています。
                新たな雇用が生まれた場合、住宅需要への波及効果が大きい地域です。
                賃貸住宅投資に適した構造と言えます。」
              </p>
              <p className="italic">
                「一方、東京のようにPERが低い地域では、雇用増が住宅需要よりも
                オフィス・商業需要に直結しやすい傾向があります。」
              </p>
            </ClientTip>

            <h3 className="font-semibold text-lg">知っておくべき制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-2">
                <li>
                  <strong>「通勤圏」の存在を忘れない:</strong>{" "}
                  PERは夜間人口（そこに住んでいる人）と雇用の比率です。
                  東京のように埼玉・千葉・神奈川から大量の通勤者が流入する地域ではPERが低くなります。
                  つまり「雇用が増えても、住む場所は隣県」ということが起きます。
                  ダッシュボードの昼間人口と比較して、人口流入の実態を把握してください。
                </li>
                <li>
                  <strong>1世帯あたりの人数は変わり続けている:</strong>{" "}
                  住戸需要の計算に使う世帯人員数は国勢調査（2020年）時点の値です。
                  単身世帯の増加・高齢化の進行により、同じ人口100人でも2020年より多くの住戸が必要になっている可能性があります。
                </li>
              </ul>
            </div>
          </Section>

          {/* ======================== 第4章: シフトシェア ======================== */}
          <Section id="ch4-shift" title="第4章: シフトシェア分析 — 成長の要因を分解する">
            <h3 className="font-semibold text-lg">なぜ重要か</h3>
            <p>
              ある地域の雇用が増えた（または減った）とき、それは「日本全体が成長したから」なのか、
              「成長産業に恵まれたから」なのか、「その地域に固有の競争力があるから」なのか
              ——この疑問に答えるのがシフトシェア分析です。
              不動産投資では、<strong>地域固有の競争力（Regional Shift）</strong>が
              持続的なテナント需要の源泉になります。
            </p>

            <h3 className="font-semibold text-lg">計算式 — 3要因分解</h3>
            <p>産業iの雇用変化を3つの要因に分解します。</p>
            <Formula>
              <div className="space-y-1">
                <div>NS（全国成長要因） = 地域の産業i雇用(t0) &times; 全国総雇用成長率</div>
                <div>IM（産業構成要因） = 地域の産業i雇用(t0) &times; (産業i全国成長率 - 全国総雇用成長率)</div>
                <div>RS（地域シフト） = 地域の産業i雇用(t0) &times; (地域の産業i成長率 - 産業i全国成長率)</div>
              </div>
            </Formula>
            <p>
              3つの合計は必ず実際の変化量に一致します（恒等式）。
            </p>
            <Formula>
              実変化 = NS + IM + RS
            </Formula>

            <h3 className="font-semibold text-lg">読み方</h3>
            <InterpTable
              headers={["要因", "意味", "投資への示唆"]}
              rows={[
                ["NS（全国成長）", "日本全体の景気による影響", "コントロール不能。景気循環の影響。"],
                ["IM（産業構成）", "成長産業を多く持つかどうか", "産業ポートフォリオの質。IM正なら有利な構成。"],
                ["RS（地域シフト）", "全国の同業種と比べた地域固有の競争力", "最重要指標。RS正なら地域が産業を「引きつけている」。"],
              ]}
            />

            <h3 className="font-semibold text-lg">ケーススタディ: 東京都の産業別RS</h3>
            <CaseStudy title="東京都 — スター産業と課題産業（2016→2021年）">
              <p className="font-medium">RS正のスター産業:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  情報通信業: RS = +62,576人（全国平均を上回る成長。
                  NS=+92,780, IM=+114,821も大きく、3要因すべて正の「黄金の成長」）
                </li>
                <li>
                  卸売業・小売業: RS = +53,860人（産業全体はIM=-186,445と縮小傾向だが、
                  東京の競争力で覆している）
                </li>
                <li>
                  学術研究・専門サービス業: RS = +50,962人（高度人材の集積が競争力の源泉）
                </li>
              </ul>
              <p className="font-medium mt-3">RS負の課題産業:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  教育・学習支援業: RS = -139,299人（IM=+262,920と成長産業であるにも関わらず、
                  東京での競争力が低下。地方分散やオンライン化の影響が考えられる）
                </li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                東京都全体のRS合計は+208,726人。全国を大幅に上回る競争優位を持つことを示しています。
              </p>
            </CaseStudy>

            <h3 className="font-semibold text-lg">お客様への説明ポイント</h3>
            <ClientTip>
              <p className="italic">
                「雇用の増加だけを見ると楽観的に見えますが、シフトシェア分析で要因を分解すると
                違った景色が見えます。この地域の情報通信業はRS=+6.3万人。
                つまり全国の情報通信業の平均成長を超えて、この地域が特に企業を引きつけています。
                この競争力がテナント需要の持続性を裏付けます。」
              </p>
              <p className="italic">
                「一方、RSが負の産業は全国より速く縮小しているということです。
                その産業のテナントが主要顧客であれば、リスク要因として認識すべきです。」
              </p>
            </ClientTip>

            <h3 className="font-semibold text-lg">知っておくべき制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-2">
                <li>
                  <strong>「いつからいつまで」で結果が大きく変わる:</strong>{" "}
                  本アプリは2016年→2021年の5年間を分析期間に使っています。
                  もし2011年→2021年の10年間で分析すれば、東日本大震災の影響で全く異なる結果になります。
                  好況期だけを切り取るか、不況を含むかで、同じ地域でもRSの符号が逆転し得ます。
                </li>
                <li>
                  <strong>2021年はコロナの影響が色濃く残っている:</strong>{" "}
                  飲食・宿泊・娯楽業のRSが大きくマイナスに見える地域がありますが、
                  これは一時的な需要蒸発の影響であり、長期的な競争力の喪失とは限りません。
                  コロナ後の回復データ（次回2026年経済センサス）と比較する必要があります。
                </li>
                <li>
                  <strong>「なぜ強いか」は教えてくれない:</strong>{" "}
                  RSは「全国平均より強い/弱い」を示しますが、その理由（立地、政策、人材、コスト）は示しません。
                  RS=+10,000人の産業があっても、それが補助金効果なのか本質的な競争力なのかは別途調査が必要です。
                </li>
              </ul>
            </div>
          </Section>

          {/* ======================== 第5章: ギャップ分析 ======================== */}
          <Section id="ch5-gap" title="第5章: 小売ギャップ分析 — 出店機会を見つける">
            <h3 className="font-semibold text-lg">なぜ重要か</h3>
            <p>
              商業不動産投資において「この地域にどんな店舗が足りないか」を数値で把握することは
              テナント誘致戦略の基盤になります。ギャップ分析は、地域の
              <strong>購買力（需要）</strong>と<strong>実際の売上高（供給）</strong>の差を
              セクターごとに算出し、出店機会とカニバリゼーションリスクを可視化します。
            </p>

            <h3 className="font-semibold text-lg">計算式</h3>
            <Formula>
              <div className="space-y-1">
                <div>ギャップ = 需要（推計購買力） - 供給（実売上高）</div>
                <div>ギャップ係数 = (需要 - 供給) &divide; (需要 + 供給) &times; 100</div>
              </div>
            </Formula>
            <p className="text-sm text-muted-foreground">
              ギャップ係数は-100から+100の範囲で正規化されており、
              規模の異なるセクター間で比較可能です。
            </p>

            <h3 className="font-semibold text-lg">読み方</h3>
            <InterpTable
              headers={["ギャップ係数", "状態", "投資への示唆"]}
              rows={[
                ["係数 > +10", "漏損（Leakage）", "域内の購買力が域外に流出。出店余地あり。商業不動産の需要が見込める。"],
                ["-10 ≦ 係数 ≦ +10", "均衡", "需給がほぼバランス。現状維持が妥当。"],
                ["係数 < -10", "余剰（Surplus）", "供給過多。新規出店はカニバリゼーションのリスク。テナント退去リスクに注意。"],
              ]}
            />
            <p>
              &plusmn;10を閾値とするのはCI102の標準的な基準です。
              ただし絶対額（ギャップ金額）も併せて確認してください。
              係数が高くても金額が小さければビジネス規模が限られます。
            </p>

            <h3 className="font-semibold text-lg">漏損と余剰の意味</h3>
            <div className="grid sm:grid-cols-2 gap-4 not-prose">
              <div className="rounded-lg border-l-4 border-l-[#2A9D8F] p-3 bg-green-50 dark:bg-green-950/20">
                <p className="font-semibold text-sm text-[#2A9D8F]">漏損（Leakage）</p>
                <p className="text-sm mt-1">
                  域内の消費者が域外で購入している。つまり<strong>出店すれば取り込める需要</strong>が存在する。
                  商業施設の新設やテナント誘致の根拠になる。
                </p>
              </div>
              <div className="rounded-lg border-l-4 border-l-[#E76F51] p-3 bg-red-50 dark:bg-red-950/20">
                <p className="font-semibold text-sm text-[#E76F51]">余剰（Surplus）</p>
                <p className="text-sm mt-1">
                  域外からも顧客を引き付けているか、供給過多の状態。
                  新規出店は<strong>既存店舗との共食い（カニバリゼーション）</strong>リスクが高い。
                </p>
              </div>
            </div>

            <h3 className="font-semibold text-lg">ケーススタディ: 東京都の小売ギャップ</h3>
            <CaseStudy title="東京都 — 集積ギャップ係数 -50.9（大幅余剰）">
              <p>
                東京都全体のギャップ係数は-50.9。大幅な供給過多です。
                これは東京に全国から人が集まり購買が行われるため、
                域内購買力以上の売上が計上されるためです。
              </p>
              <p>
                ただしセクター別に見ると差があります:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>農耕用品小売業: 係数+93.0（深刻な漏損 — 都市部では当然の結果）</li>
                <li>燃料小売業: 係数+43.7（自動車依存度の低さを反映）</li>
                <li>各種商品卸売業: 係数-78.3（百貨店・総合スーパーが集積）</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                北海道は逆にギャップ係数+11.9（軽度の漏損）。33セクターに出店機会があり、
                商業不動産のテナント誘致に活用できるデータです。
              </p>
            </CaseStudy>

            <h3 className="font-semibold text-lg">お客様への説明ポイント</h3>
            <ClientTip>
              <p className="italic">
                「この地域では食料品小売に大きな漏損があります。
                つまり住民が食料品を域外で購入している状態です。
                食品スーパーのテナント誘致を提案する際の根拠データになります。
                ギャップ金額は年間約XX億円で、十分な商圏規模です。」
              </p>
              <p className="italic">
                「逆にこのセクターは余剰です。新規出店は既存テナントとの共食いになるため、
                この用途のテナントを入れる場合は慎重に検討すべきです。」
              </p>
            </ClientTip>

            <h3 className="font-semibold text-lg">知っておくべき制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-2">
                <li>
                  <strong>ネット通販（EC）の購買は見えない:</strong>{" "}
                  需要推計は「住民が地元で買い物する」前提の人口按分です。
                  Amazonや楽天で購入した金額は域内の売上に計上されないため、
                  書籍・家電・衣料品などEC比率の高いセクターでは「漏損」が実態より大きく出ます。
                  漏損=出店機会と即断せず、EC化率の高いセクターかどうかを確認してください。
                </li>
                <li>
                  <strong>「港区の住民が銀座で買い物する」は漏損に見える:</strong>{" "}
                  域内需要は人口ベースで推計するため、隣接自治体で日常的に買い物する行動は
                  「購買力の流出＝漏損」として計上されます。都市部では商圏が自治体境界と一致しないことに注意してください。
                </li>
                <li>
                  <strong>所得の違いが反映されていない:</strong>{" "}
                  需要は「人口 × 全国平均の1人あたり支出」で計算しています。
                  港区のように平均所得が高い地域では実際の購買力が過小に、
                  地方の低所得地域では過大に推計されている可能性があります。
                </li>
              </ul>
            </div>
          </Section>

          {/* ======================== 第6章: 投資適格スコア ======================== */}
          <Section id="ch6-score" title="第6章: 投資適格スコア — 総合判断">
            <h3 className="font-semibold text-lg">なぜ重要か</h3>
            <p>
              個々の分析指標はそれぞれ価値がありますが、最終的な投資判断では
              それらを<strong>統合した評価</strong>が必要です。
              投資適格スコアは、5つの要素を重み付けして100点満点で算出する
              総合指標です。
            </p>

            <h3 className="font-semibold text-lg">5つの評価要素</h3>
            <InterpTable
              headers={["要素", "配点", "内容", "高スコアの条件"]}
              rows={[
                ["EBMスコア", "20点", "経済基盤乗数の大きさ", "EBMが高い（波及効果が大きい）"],
                ["基盤比率スコア", "20点", "基盤雇用の割合", "基盤比率が高い（域外依存の産業が充実）"],
                ["RSスコア", "25点", "地域シフトの合計", "RS合計が正（地域固有の競争力あり）"],
                ["ギャップスコア", "20点", "小売ギャップの状態", "適度な漏損（出店機会あり）"],
                ["規模スコア", "15点", "経済圏の大きさ（総雇用）", "総雇用が大きい（市場規模が十分）"],
              ]}
            />

            <h3 className="font-semibold text-lg">読み方</h3>
            <InterpTable
              headers={["スコア", "評価", "投資への示唆"]}
              rows={[
                ["80〜100", "優良", "経済基盤が強固で投資環境が整っている。"],
                ["60〜79", "良好", "一定の強みがあるが、一部に課題も。セクター選定が重要。"],
                ["40〜59", "標準", "地域特性を深く理解した上での投資判断が必要。"],
                ["0〜39", "要注意", "構造的な課題あり。リスク許容度の高い投資家向け。"],
              ]}
            />

            <h3 className="font-semibold text-lg">ケーススタディ: 3地域の比較</h3>
            <CaseStudy title="スコアの内訳を読み解く">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">地域</th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">総合<br/><span className="text-[10px] font-normal text-muted-foreground">/100</span></th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">EBM<br/><span className="text-[10px] font-normal text-muted-foreground">/20</span></th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">基盤比率<br/><span className="text-[10px] font-normal text-muted-foreground">/20</span></th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">RS<br/><span className="text-[10px] font-normal text-muted-foreground">/25</span></th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">ギャップ<br/><span className="text-[10px] font-normal text-muted-foreground">/20</span></th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">規模<br/><span className="text-[10px] font-normal text-muted-foreground">/15</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-foreground/10">
                      <td className="px-3 py-2 font-medium">大阪府</td>
                      <td className="px-3 py-2 text-right font-bold text-[#2A9D8F]">69.3</td>
                      <td className="px-3 py-2 text-right">20.0</td>
                      <td className="px-3 py-2 text-right">3.2</td>
                      <td className="px-3 py-2 text-right">25.0</td>
                      <td className="px-3 py-2 text-right">6.1</td>
                      <td className="px-3 py-2 text-right">15.0</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="px-3 py-2 font-medium">東京都</td>
                      <td className="px-3 py-2 text-right font-bold text-[#2A9D8F]">62.2</td>
                      <td className="px-3 py-2 text-right">10.6</td>
                      <td className="px-3 py-2 text-right">11.5</td>
                      <td className="px-3 py-2 text-right">25.0</td>
                      <td className="px-3 py-2 text-right">0.0</td>
                      <td className="px-3 py-2 text-right">15.0</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="px-3 py-2 font-medium">北海道</td>
                      <td className="px-3 py-2 text-right font-bold text-[#D4A843]">53.3</td>
                      <td className="px-3 py-2 text-right">20.0</td>
                      <td className="px-3 py-2 text-right">5.9</td>
                      <td className="px-3 py-2 text-right">0.0</td>
                      <td className="px-3 py-2 text-right">12.4</td>
                      <td className="px-3 py-2 text-right">15.0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm mt-3">
                各要素のスコアは配点（EBM・基盤比率・ギャップ=各20点、RS=25点、規模=15点）に対する
                寄与点で表示。5要素の合計が100点満点の総合スコアになります。
              </p>
              <p className="text-sm">
                大阪府（69.3点）はEBM 20.0/20、RS 25.0/25、規模 15.0/15 が満点で、波及効果と競争力が強み。
                ただし基盤比率が3.2/20と低く、少数の基盤産業への依存が課題です。
              </p>
              <p className="text-sm">
                東京都（62.2点）はRS 25.0/25と規模 15.0/15が満点だが、ギャップが0.0/20。
                小売市場が供給過多のため、商業施設の新規投資には不向きです。
                オフィス・住宅が投資対象として適しています。
              </p>
              <p className="text-sm">
                北海道（53.3点）はRS 0.0/25（地域シフトが負）。
                産業の競争力低下が構造的な課題です。一方でギャップが12.4/20と高く、
                小売漏損が大きいため、商業施設への投資機会は存在します。
              </p>
            </CaseStudy>

            <h3 className="font-semibold text-lg">お客様への説明ポイント</h3>
            <ClientTip>
              <p className="italic">
                「この地域の投資適格スコアは69点です。RSが高く地域の競争力は十分ですが、
                基盤比率が低いため特定産業への依存リスクがあります。
                投資する場合は、基盤産業のテナントを1社に集中させず、
                複数業種に分散することをお勧めします。」
              </p>
              <p className="italic">
                「スコアが低い地域でも、ギャップ分析で明確な出店機会が見つかれば
                セクター限定の投資は検討に値します。スコアは入口の判断基準であり、
                最終判断は個別の物件分析とセットで行います。」
              </p>
            </ClientTip>
          </Section>

          {/* ======================== 第7章: 空間データ分析 ======================== */}
          <Section id="ch7-spatial" title="第7章: 空間データ分析 — Driving Distance & リスク評価">
            <h3 className="font-semibold text-lg">CI102のDriving Distance分析とは</h3>
            <p>
              CI102テキストでは「Trade Area（商圏）」の定量化にDriving Distance（車での到達距離/時間）を用います。
              商業施設の商圏は「車で15分圏内」のように定義され、この範囲内の人口・所得が
              その施設のポテンシャル顧客となります。
            </p>
            <Formula>
              Trade Area Population = 車でN分以内に到達可能な範囲の居住人口
            </Formula>
            <p>
              本ダッシュボードでは、OSRM（Open Source Routing Machine）を用いて各市区町村の重心から
              最寄りの鉄道駅・医療施設・商業施設への実走行距離/時間を算出しています。
            </p>

            <h3 className="font-semibold text-lg mt-6">車依存度スコアの読み方</h3>
            <InterpTable
              headers={["車依存度", "意味", "不動産への影響", "テナント戦略"]}
              rows={[
                ["0-20", "公共交通が充実", "駅近プレミアム10-30%", "全業種対応可"],
                ["20-40", "鉄道+バスでカバー", "駅距離に比例した減価", "住居・近隣商業"],
                ["40-70", "車優位", "駐車場台数が価値の鍵", "ロードサイド商業・物流"],
                ["70-100", "完全車依存", "幹線道路接道・視認性が全て", "GS・コンビニ・ドラッグストア"],
              ]}
            />

            <h3 className="font-semibold text-lg mt-6">災害リスクとCap Rate調整</h3>
            <p>
              不動産鑑定実務では、災害リスクの高い地域には利回りの上乗せ（リスクプレミアム）を適用します。
              これは「同じ立地条件ならリスクの低い物件を選好する」市場の合理的な判断を反映しています。
            </p>
            <InterpTable
              headers={["浸水リスク", "Cap Rate調整", "投資判断", "具体的対策"]}
              rows={[
                ["50%以上", "+200bps", "原則回避", "建物価値の大幅毀損リスク"],
                ["30-50%", "+150bps", "慎重検討", "RC造・1F非居住設計が条件"],
                ["15-30%", "+100bps", "条件付き可", "個別ハザードマップ確認必須"],
                ["5-15%", "+50bps", "通常範囲", "一般的な保険付保で対応"],
                ["5%未満", "+0bps", "良好", "リスクプレミアム不要"],
              ]}
            />

            <h3 className="font-semibold text-lg mt-6">空間データの重ね合わせ</h3>
            <p>
              地図タブでは、経済データ（基盤雇用比率・セグメント）の上に国土数値情報の空間レイヤーを
              重ねて表示できます。これにより以下の分析が可能になります:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>洪水浸水区域 × 地価</strong>: リスクが地価に織り込まれているか確認</li>
              <li><strong>鉄道駅 × 商業施設</strong>: 駅勢圏と商圏の重なりを可視化</li>
              <li><strong>DID × 立地適正化計画</strong>: 行政の投資方針と実際の都市化範囲の一致度</li>
              <li><strong>用途地域</strong>: 建築可能な用途の確認（住居専用/商業/工業）</li>
            </ul>

            <CaseStudy title="実践例: 地方都市の投資判断">
              <p>
                秋田県（車依存度スコア平均70超）で商業物件を検討する場合:
                最寄り駅まで車25分であれば、テナントは「車で来る客」前提の業種に限定されます。
                駐車場30台以上、幹線道路接道、視認性の良い角地 — これらが「地方型の好立地条件」です。
                東京の「駅徒歩5分」と同じ発想では失敗します。
              </p>
            </CaseStudy>

            <ClientTip>
              <p>
                「この地域は車依存度が高い（スコア○○）ため、テナント誘致は車来店型の業種に絞るべきです。
                駐車場の確保が物件価値を左右する最大の要因になります。
                逆に言えば、駅前物件と違い取得競争が緩やかで、利回りを確保しやすいメリットもあります。」
              </p>
            </ClientTip>

            <div className="rounded-lg border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 mt-4">
              <p className="font-semibold text-amber-700">知っておくべき制限事項</p>
              <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                <li>OSRM走行距離は「自由走行時の最短ルート」であり、渋滞・信号待ちは加味されていない</li>
                <li>浸水想定は「想定最大規模降雨」のシミュレーションであり、被災確率ではない</li>
                <li>国土数値情報の更新頻度はデータセットにより異なる（詳細はDATA_UPDATE_PLAN.md参照）</li>
                <li>ポリゴンデータの精度は元のShapefile（数メートル〜数十メートル）に依存</li>
              </ul>
            </div>
          </Section>

          {/* ======================== 第8章: 地域比較分析 ======================== */}
          <Section id="ch8-compare" title="第8章: 地域比較分析 — 目的別プリセットとベンチマーク">
            <h3 className="font-semibold text-lg">なぜ比較するのか</h3>
            <p>
              CI102の分析は1つの地域だけ見ても「良い/悪い」の判断ができません。
              必ず<strong>比較対象</strong>が必要です。ESRIのBusiness Analystや
              STDBが「類似エリア比較」を重視するのも同じ理由です。
            </p>
            <p>
              本ダッシュボードの比較ページ（/compare）では、最大4地域を選択して
              レーダーチャート・KPIテーブル・パーセンタイル分布で多角的に比較できます。
            </p>

            <h3 className="font-semibold text-lg mt-6">目的別プリセットの考え方</h3>
            <p>
              同じ地域でも、投資目的によって「良い」の定義が変わります:
            </p>
            <InterpTable
              headers={["プリセット", "重視する指標", "なぜ重視するか", "典型的な物件"]}
              rows={[
                ["住居系投資", "人口動態(30%)・アクセス(15%)・リスク(15%)", "住宅需要は人口に直結。安全性重視", "マンション・アパート"],
                ["商業系投資", "Gap係数(25%)・アクセス(20%)・RS(15%)", "商圏の需給ギャップ+集客力が鍵", "店舗・SC"],
                ["オフィス投資", "EBM(25%)・基盤比率(20%)・RS(20%)", "雇用の質と成長力がテナント需要を決定", "オフィスビル"],
                ["リスク回避型", "リスク(30%)・人口(25%)・アクセス(15%)", "資産価値の保全を最優先", "住居・医療施設"],
              ]}
            />
            <p>
              重み付けはCI102テキストのSite Selection（立地選定）フレームワークに基づいています。
              実務では、これをさらにクライアントの投資方針・リスク許容度に合わせてカスタマイズします。
            </p>

            <h3 className="font-semibold text-lg mt-6">スコアカードの読み方</h3>
            <p>
              各地域に A+ 〜 D のグレードが付きます。これは全47都道府県のmin-maxスケーリングで
              正規化した後、プリセットの重み付けで合算した総合点です。
            </p>
            <InterpTable
              headers={["グレード", "スコア", "意味", "投資判断"]}
              rows={[
                ["A+ / A / A-", "70-100", "選択プリセットで上位", "積極投資を推奨"],
                ["B+ / B / B-", "40-69", "中位", "個別物件の精査で判断"],
                ["C+ / C", "20-39", "下位", "特別な理由がない限り回避"],
                ["D", "0-19", "最下位", "投資不適格"],
              ]}
            />

            <h3 className="font-semibold text-lg mt-6">パーセンタイル分布の見方</h3>
            <p>
              パーセンタイルバーは「全国47都道府県の中で、この地域がどの位置にいるか」を直感的に示します。
              灰色の帯が全国の10-90パーセンタイル（「普通の範囲」）、濃い帯が25-75パーセンタイル（「中央の半分」）。
              カラーのマーカーが選択した地域の位置です。
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>マーカーが帯の右端にある → その指標で全国上位</li>
              <li>マーカーが帯の左端にある → その指標で全国下位</li>
              <li>複数地域のマーカーが近い → その指標では差がない（他の指標で差別化）</li>
            </ul>

            <CaseStudy title="実践例: 東京 vs 大阪 vs 福岡">
              <p>
                3都市を「商業系投資」プリセットで比較すると:
                東京はアクセスA+だが商業密度が飽和（Gap係数が低い）。
                福岡はGap係数が高く出店機会がある一方、規模は小さい。
                大阪はバランスが良いが競争が激しい。
                — このように、「1つの正解」ではなく「投資目的に応じた最適解」が見えてきます。
              </p>
            </CaseStudy>

            <ClientTip>
              <p>
                「投資候補の3地域を比較した結果、○○プリセット（ご要望の投資目的）では
                A地域がグレードA-（スコア72）で最も適合しています。
                B地域はアクセスでは勝りますが、人口減少リスクが高く総合B+に留まります。
                最終判断には個別物件のキャッシュフロー分析との照合が必要です。」
              </p>
            </ClientTip>

            <div className="rounded-lg border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4 mt-4">
              <p className="font-semibold text-amber-700">知っておくべき制限事項</p>
              <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                <li>スコアは都道府県単位の集計値。同一県内でも市区町村で大きく異なる</li>
                <li>プリセットの重み付けは教育目的の参考値。実務では案件ごとに調整が必要</li>
                <li>パーセンタイルは全47都道府県のmin-maxスケーリング。母数が47のため個別値の微差に過大な意味を持たせない</li>
                <li>enhanced_scoreのリスク/アクセス/人口調整値はNLNIデータに依存。未取得の場合は経済スコアのみ</li>
              </ul>
            </div>
          </Section>

          {/* ======================== まとめ ======================== */}
          <Section id="summary" title="まとめ: 分析を投資判断に活かす">
            <h3 className="font-semibold text-lg">CI102の8つの分析を組み合わせた総合判断フロー</h3>
            <div className="space-y-3 not-prose">
              {[
                {
                  step: "Step 1",
                  title: "LQで基盤産業を特定する",
                  desc: "どの産業が域外から資金を呼び込んでいるかを把握。基盤産業の数と規模が地域の経済的安定性を決める。",
                },
                {
                  step: "Step 2",
                  title: "EBMで波及効果を測る",
                  desc: "基盤雇用の変化がどれだけの総雇用・人口・住宅需要に波及するかをシミュレーション。",
                },
                {
                  step: "Step 3",
                  title: "シフトシェアで競争力を検証する",
                  desc: "雇用成長の要因を分解し、地域固有の競争力（RS）を確認。RSが負なら構造的な課題がある。",
                },
                {
                  step: "Step 4",
                  title: "ギャップ分析で商業機会を探す",
                  desc: "漏損セクターは出店機会、余剰セクターはリスク。テナント誘致戦略のデータ基盤。",
                },
                {
                  step: "Step 5",
                  title: "不動産取引データと照合する",
                  desc: "実際の取引価格・利回りと経済分析の結論が整合しているかを確認。",
                },
                {
                  step: "Step 6",
                  title: "投資判断を下す",
                  desc: "投資適格スコアを入口に、個別物件のDCF分析（Proformer等）と組み合わせて最終判断。",
                },
              ].map((s) => (
                <div key={s.step} className="flex gap-4 items-start rounded-lg border p-4">
                  <Badge className="shrink-0 mt-0.5">{s.step}</Badge>
                  <div>
                    <p className="font-semibold text-sm">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="font-semibold text-lg mt-6">すべてのデータは「過去の写真」である</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3 text-sm">
              <p>
                CI102で使用するデータはすべて<strong>遅行指標（Lagging Indicators）</strong>
                ——つまり「過去に何が起きたか」を教えてくれますが、「これから何が起きるか」は教えてくれません。
              </p>
              <InterpTable
                headers={["データソース", "いつの写真？", "今との差", "具体的に何が見えない？"]}
                rows={[
                  ["経済センサス", "2021年6月", "約5年前", "TSMC熊本進出、リモートワーク普及後の産業構造変化"],
                  ["国勢調査", "2020年10月", "約6年前", "コロナ後の人口移動（東京→地方、外国人労働者増）"],
                  ["建築着工統計", "2023年", "約2-3年前", "直近の建設コスト高騰・金利上昇の影響"],
                  ["MLIT取引価格", "四半期ごと", "約3ヶ月前", "現在進行中の取引、売り出し中の物件"],
                ]}
              />
              <p>
                たとえば、2021年の経済センサスでは「飲食業の雇用が大幅減」と出ますが、
                これはコロナ禍の一時的な影響です。2024年以降の回復は次回センサス（2026年）まで反映されません。
                同様に、TSMCの熊本進出（2024年稼働開始）による雇用・不動産需要の変化も、
                現在のデータには全く含まれていません。
              </p>
              <p className="font-semibold">
                CI102テキスト（Mueller &amp; Laposa）でも繰り返し強調されています:
              </p>
              <p className="italic border-l-2 border-amber-400 pl-3">
                &ldquo;Data tells you where you&apos;ve been, not where you&apos;re going.&rdquo;
                <br />（データは過去を語るが、未来を保証しない）
              </p>
              <p>
                この分析は投資判断の<strong>出発点（Starting Point）</strong>です。
                最終判断には、最新の市場調査、物件個別のデューデリジェンス、
                現地の不動産業者へのヒアリング、そして何より
                <strong>自分の目で現地を見ること</strong>が不可欠です。
              </p>
            </div>

            <h3 className="font-semibold text-lg mt-6">最後に</h3>
            <p>
              CI102の分析は、不動産投資の判断を「勘」から「データ」に変える枠組みです。
              すべてのデータは過去のスナップショットであり、将来の保証ではありません。
              しかし、経済構造を数値で理解し、空間データと重ね合わせることで、
              リスクの所在を明確にし、お客様に根拠のある提案ができるようになります。
            </p>
            <p>
              ダッシュボードでは、ここで学んだ8つの分析手法を
              47都道府県の実データで実際に操作できます。
            </p>

            <div className="not-prose mt-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-lg bg-[#1B2A4A] dark:bg-white text-white dark:text-[#1B2A4A] px-6 py-3 font-medium text-sm hover:opacity-90 transition-opacity"
              >
                ダッシュボードで分析を試す &rarr;
              </Link>
            </div>
          </Section>

          {/* Footer */}
          <footer className="border-t pt-4 mt-8">
            <p className="text-xs text-muted-foreground text-center">
              CI102 不動産投資のための市場分析 | CCIM Institute |
              データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
