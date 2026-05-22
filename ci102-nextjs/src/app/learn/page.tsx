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

            <h3 className="font-semibold text-lg">この分析手法の制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>消費パターンの均一性仮定:</strong> LQは「全国の消費パターンが均一」という前提に基づいています。
                  観光地・軍事基地・大学都市など、域外からの消費や特殊な需要構造を持つ地域では、
                  LQが基盤雇用を正確に反映しない場合があります。
                </li>
                <li>
                  <strong>産業分類の粒度:</strong> 大分類レベルのLQは、同一産業内の多様性を隠します。
                  例えば「製造業」のLQが1.0でも、自動車部品製造と食品製造では不動産需要への影響が大きく異なります。
                </li>
                <li>
                  <strong>遅行指標:</strong> 経済センサス（2021年）は調査時点のスナップショットであり、
                  公表時にはすでに数年遅れています。調査後の企業進出・撤退は反映されていません。
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

            <h3 className="font-semibold text-lg">この分析手法の制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>静的乗数:</strong> EBMは分析時点のスナップショットであり、
                  基盤産業の構成が変化すればEBMも変動します。過去のEBMで将来の波及効果を推計する際は、
                  産業構造の安定性を前提としている点に注意が必要です。
                </li>
                <li>
                  <strong>線形仮定:</strong> カスケード計算は「基盤雇用の変化が非基盤雇用に線形に波及する」と仮定しています。
                  実際には、大規模な雇用変動ではインフラ制約・住宅供給制約により非線形な効果が生じます。
                </li>
                <li>
                  <strong>シミュレーション ≠ 予測:</strong> EBMカスケードはWhat-If分析であり、予測ではありません。
                  「仮にX人増えたら」の仮定に基づく参考値として、実績データと必ず併せて評価してください。
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

            <h3 className="font-semibold text-lg">この分析手法の制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>通勤圏の影響:</strong> PERは夜間人口（居住者）と雇用の比率です。
                  東京のように大量の通勤者が流入する地域ではPERが低くなり、雇用増が居住人口増に直結しません。
                  昼間人口を併せて確認してください。
                </li>
                <li>
                  <strong>世帯構成の変化:</strong> 住戸需要への変換に使う世帯人員数は国勢調査時点の値です。
                  単身世帯化・高齢化の進行により、同じ人口増でも必要住戸数は変動します。
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

            <h3 className="font-semibold text-lg">この分析手法の制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>分析期間への依存:</strong> シフトシェアの結果は分析期間の選び方で大きく変わります。
                  好況期のみ（2016→2021）と不況期を跨ぐ期間では、同じ地域でもNS/IM/RSの符号が逆転する場合があります。
                  本アプリは経済センサス2016年→2021年の5年間を使用しています。
                </li>
                <li>
                  <strong>コロナ禍の影響:</strong> 2021年はコロナ禍の影響が残る時期です。
                  飲食・宿泊・娯楽業のRS値は一時的な需要減の影響を受けており、
                  長期的な競争力を反映していない可能性があります。
                </li>
                <li>
                  <strong>因果関係ではない:</strong> RSが正でも「なぜその地域が競争力を持つか」は示しません。
                  立地優位性、政策支援、コスト優位など、RSの背景にある要因は別途調査が必要です。
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

            <h3 className="font-semibold text-lg">この分析手法の制限事項</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2 text-sm">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>EC・越境購買の未反映:</strong> 需要推計は人口ベースの按分であり、
                  ECサイトでの購入、隣接自治体への越境購買、観光消費は反映されません。
                  EC比率の高いセクター（書籍・家電等）では漏損が過大に見積もられる傾向があります。
                </li>
                <li>
                  <strong>需要推計の精度:</strong> 域内需要は「人口 × 全国1人あたり支出額」で按分しており、
                  所得水準・年齢構成・消費性向の地域差を反映していません。
                  高所得地域では需要が過小に、低所得地域では過大に推計される可能性があります。
                </li>
                <li>
                  <strong>供給側データの制約:</strong> 供給額は経済センサスの年間商品販売額であり、
                  新規出店・閉店のタイムラグ、季節変動は反映されていません。
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
              headers={["要素", "重み", "内容", "高スコアの条件"]}
              rows={[
                ["EBMスコア", "20%", "経済基盤乗数の大きさ", "EBMが高い（波及効果が大きい）"],
                ["基盤比率スコア", "20%", "基盤雇用の割合", "基盤比率が高い（域外依存の産業が充実）"],
                ["RSスコア", "25%", "地域シフトの合計", "RS合計が正（地域固有の競争力あり）"],
                ["ギャップスコア", "15%", "小売ギャップの状態", "適度な漏損（出店機会あり）"],
                ["規模スコア", "20%", "経済圏の大きさ（総雇用）", "総雇用が大きい（市場規模が十分）"],
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
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">総合</th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">EBM</th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">基盤比率</th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">RS</th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">ギャップ</th>
                      <th className="text-right border-b-2 border-foreground/20 px-3 py-2 bg-muted/30">規模</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-foreground/10">
                      <td className="px-3 py-2 font-medium">大阪府</td>
                      <td className="px-3 py-2 text-right font-bold text-[#2A9D8F]">69.3</td>
                      <td className="px-3 py-2 text-right">100.0</td>
                      <td className="px-3 py-2 text-right">16.2</td>
                      <td className="px-3 py-2 text-right">100.0</td>
                      <td className="px-3 py-2 text-right">30.3</td>
                      <td className="px-3 py-2 text-right">100.0</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="px-3 py-2 font-medium">東京都</td>
                      <td className="px-3 py-2 text-right font-bold text-[#2A9D8F]">62.2</td>
                      <td className="px-3 py-2 text-right">53.2</td>
                      <td className="px-3 py-2 text-right">57.6</td>
                      <td className="px-3 py-2 text-right">100.0</td>
                      <td className="px-3 py-2 text-right">0.0</td>
                      <td className="px-3 py-2 text-right">100.0</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="px-3 py-2 font-medium">北海道</td>
                      <td className="px-3 py-2 text-right font-bold text-[#D4A843]">53.3</td>
                      <td className="px-3 py-2 text-right">100.0</td>
                      <td className="px-3 py-2 text-right">29.4</td>
                      <td className="px-3 py-2 text-right">0.0</td>
                      <td className="px-3 py-2 text-right">61.9</td>
                      <td className="px-3 py-2 text-right">100.0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm mt-3">
                大阪府（69.3点）はEBMとRS、規模が満点で、波及効果と競争力が強み。
                ただし基盤比率スコアが16.2と低く、少数の基盤産業への依存が課題です。
              </p>
              <p className="text-sm">
                東京都（62.2点）はRSと規模が満点だが、ギャップスコアが0.0。
                小売市場が供給過多のため、商業施設の新規投資には不向きです。
                オフィス・住宅が投資対象として適しています。
              </p>
              <p className="text-sm">
                北海道（53.3点）はRSが0.0（地域シフトが負）。
                産業の競争力低下が構造的な課題です。一方でギャップスコアは61.9と高く、
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

          {/* ======================== まとめ ======================== */}
          <Section id="summary" title="まとめ: 分析を投資判断に活かす">
            <h3 className="font-semibold text-lg">CI102の6つの分析を組み合わせた総合判断フロー</h3>
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

            <h3 className="font-semibold text-lg mt-6">遅行指標（Lagging Indicators）としてのCI102データ</h3>
            <div className="rounded-lg border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3 text-sm">
              <p>
                CI102の分析に使用するすべてのデータは<strong>遅行指標（Lagging Indicators）</strong>です。
                過去の実績を集計した統計であり、現在の市場状況や将来の動向を直接予測するものではありません。
              </p>
              <InterpTable
                headers={["データソース", "調査時点", "公表タイミング", "注意点"]}
                rows={[
                  ["経済センサス", "2021年6月", "2023年公表", "コロナ禍直後。リモートワーク普及前の産業構造。次回2026年"],
                  ["国勢調査", "2020年10月", "2021年公表", "人口は2015年値の2020年境界組替。次回2025年（結果は2026-27年）"],
                  ["建築着工統計", "年次更新", "翌年公表", "過去の着工実績。建設コスト・金利変動は未反映"],
                  ["MLIT取引価格", "四半期更新", "約3ヶ月遅れ", "成約事例のみ。売り出し中・未成約は含まない"],
                ]}
              />
              <p>
                <strong>統計公表から現在までの市場変化</strong>（企業の進出・撤退、再開発計画、インフラ整備、
                金利政策の変更、人口移動トレンドの変化等）はこれらのデータに反映されていません。
                投資判断には、これらの統計分析を<strong>最新の市場調査・物件個別のデューデリジェンス・
                現地ヒアリング</strong>と組み合わせることが不可欠です。
              </p>
              <p>
                CI102テキスト（Mueller &amp; Laposa）でも繰り返し強調されているように、
                「データは過去を語るが、未来を保証しない（Data tells you where you&apos;ve been, not where you&apos;re going）」。
                分析結果は投資判断の<strong>出発点</strong>であり、<strong>結論</strong>ではありません。
              </p>
            </div>

            <h3 className="font-semibold text-lg mt-6">最後に</h3>
            <p>
              CI102の分析は、不動産投資の判断を「勘」から「データ」に変える枠組みです。
              すべてのデータは過去のスナップショットであり、将来の保証ではありません。
              しかし、経済構造を数値で理解することで、リスクの所在を明確にし、
              お客様に根拠のある提案ができるようになります。
            </p>
            <p>
              ダッシュボードでは、ここで学んだ6つの分析手法を
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
