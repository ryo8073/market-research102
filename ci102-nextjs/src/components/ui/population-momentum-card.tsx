"use client";

import { Card, CardContent } from "@/components/ui/card";

export interface Census2025 {
  population: number;
  population_2020: number;
  households: number;
  pop_change_pct: number;
  hh_change_pct: number;
  national_pop_change_pct: number;
  momentum_gap: number;
  momentum_class:
    | "growth"
    | "resilient"
    | "outperform_decline"
    | "decline"
    | "severe_decline";
  density: number;
  source: string;
}

type Cls = Census2025["momentum_class"];

const DEMAND: Record<Cls, { label: string; color: string; emoji: string }> = {
  growth: { label: "成長", color: "#16A34A", emoji: "📈" },
  resilient: { label: "維持", color: "#0D9488", emoji: "🛡️" },
  outperform_decline: { label: "緩やか縮小", color: "#CA8A04", emoji: "⚖️" },
  decline: { label: "減少", color: "#EA580C", emoji: "⚠️" },
  severe_decline: { label: "深刻な減少", color: "#E11D48", emoji: "⛔" },
};

const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const upDown = (v: number) => (v >= 0 ? "▲" : "▼");
const tone = (v: number) => (v >= 0 ? "#16A34A" : "#DC2626");
const shortName = (s: string) =>
  s.split(/\s+/).pop()?.replace(/(市|区|町|村|都|府|県)$/, "") ?? s;

/** 需要×供給から購入スタンスを決定 */
function buyStance(cls: Cls, gap: number, supply: number | null) {
  if (cls === "severe_decline")
    return {
      label: "取得は原則見送り",
      color: "#E11D48",
      text:
        "需要が構造的に縮小。中心部の希少立地か、医療・介護等ディフェンシブ用途に限定して検討。",
    };
  const demandUp = cls === "growth" || cls === "resilient" || gap >= 0;
  if (supply == null)
    return demandUp
      ? {
          label: "需要は追い風（供給を要確認）",
          color: "#0D9488",
          text:
            "需要は良好。投資判断ハブで供給側スコア(EBM・基盤雇用)と突き合わせ、購入可否を最終判断してください。",
        }
      : {
          label: "需要は逆風（供給を要確認）",
          color: "#EA580C",
          text:
            "需要は縮小局面。取得するなら出口(売却)戦略を先に設計し、供給側スコアと価格を精査。",
        };
  const supplyOk = supply >= 55;
  if (demandUp && supplyOk)
    return {
      label: "積極取得を検討",
      color: "#16A34A",
      text:
        "需要(人口)と供給(雇用基盤)がともに良好。開発・取得の順張り候補。価格と利回りが見合えば主力対象。",
    };
  if (demandUp && !supplyOk)
    return {
      label: "選別取得（需要先行）",
      color: "#0D9488",
      text:
        "需要は追い風だが雇用基盤は弱め。基盤産業の中身とテナント信用力を精査し、駅近・DID内に絞って取得。",
    };
  if (!demandUp && supplyOk)
    return {
      label: "条件付取得（出口前提）",
      color: "#CA8A04",
      text:
        "雇用基盤は堅いが需要は逆風。保有期間と出口(売却)戦略を先に設計し、高稼働物件に限定。",
    };
  return {
    label: "取得は慎重・原則見送り",
    color: "#E11D48",
    text:
      "需要・供給とも弱い。新規取得は見送り、既存保有は用途転換・早期出口を検討。",
  };
}

function locationHint(cls: Cls): string {
  if (cls === "growth" || cls === "resilient")
    return "市内では 駅近・DID中心部・居住誘導区域 を優先。地価上昇の初期なら開発余地も検討可。";
  if (cls === "outperform_decline" || cls === "decline")
    return "需要が残るのは DID中心部・生活利便が集積するエリア。郊外・立地適正化計画の区域外は回避。";
  return "取得するなら 中心部の希少立地 か 医療・介護等の底堅い用途 に限定。";
}

// scale (需要 全国比バー)
const S_LO = -10, S_HI = 5;
const sPos = (v: number) =>
  ((Math.min(S_HI, Math.max(S_LO, v)) - S_LO) / (S_HI - S_LO)) * 100;
// matrix
const G_LO = -6, G_HI = 6;
const mY = (gap: number) =>
  100 - ((Math.min(G_HI, Math.max(G_LO, gap)) - G_LO) / (G_HI - G_LO)) * 100;
const mX = (s: number) => Math.min(100, Math.max(0, s));

export function PopulationMomentumCard({
  area,
  c,
  supplyScore = null,
}: {
  area: string;
  c: Census2025;
  supplyScore?: number | null;
}) {
  const d = DEMAND[c.momentum_class] ?? DEMAND.decline;
  const gap = c.momentum_gap;
  const above = gap >= 0;
  const st = buyStance(c.momentum_class, gap, supplyScore);
  const short = shortName(area);
  const popDelta = c.population - c.population_2020;

  const divergence =
    c.pop_change_pct < 0 && c.hh_change_pct > 0
      ? `人口は減っても世帯は ${fmtPct(c.hh_change_pct)} 増 → 単身・小世帯化。賃貸・ワンルーム系の需要は底堅い可能性。`
      : c.pop_change_pct > 0 && c.hh_change_pct > c.pop_change_pct + 2
      ? `世帯が人口以上（${fmtPct(c.hh_change_pct)}）に増加 → ファミリー〜単身まで住宅需要の裾野が広い。`
      : null;

  return (
    <Card className="overflow-hidden border-t-4 shadow-sm" style={{ borderTopColor: st.color }} data-print-block>
      <CardContent className="pt-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-sm font-extrabold tracking-tight">
              🧭 立地・購入判断サポート
              <span className="ml-1 font-semibold text-muted-foreground">— {area}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
              需要（人口モメンタム 2020→2025 実測）×供給（CI102経済スコア）で「買うべきか」を可視化
            </p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-extrabold text-white shadow" style={{ backgroundColor: d.color }}>
            需要: {d.emoji} {d.label} {fmtPct(c.pop_change_pct)}
          </span>
        </div>

        {/* 購入スタンス（意思決定の答えを最上部に） */}
        <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: `${st.color}12`, borderLeft: `5px solid ${st.color}` }}>
          <p className="text-[11px] font-bold tracking-widest text-muted-foreground">購入スタンス</p>
          <p className="text-[22px] font-black leading-tight" style={{ color: st.color }}>{st.label}</p>
          <p className="text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-200 mt-0.5">{st.text}</p>
        </div>

        {/* Body: matrix (供給あり) or scale (需要のみ) + metrics */}
        <div className="grid grid-cols-1 md:grid-cols-[270px_1fr] gap-5 items-start">
          {supplyScore != null ? (
            <div>
              <p className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300 text-center mb-1.5">
                需要 × 供給 判断マトリクス
              </p>
              <div className="relative mx-auto rounded-[10px] border overflow-hidden" style={{ width: 250, height: 250 }}>
                <div className="absolute left-0 top-0 w-1/2 h-1/2" style={{ background: "#EF444410" }} />
                <div className="absolute right-0 top-0 w-1/2 h-1/2" style={{ background: "#F59E0B10" }} />
                <div className="absolute left-0 bottom-0 w-1/2 h-1/2" style={{ background: "#0D948810" }} />
                <div className="absolute right-0 bottom-0 w-1/2 h-1/2" style={{ background: "#16A34A14" }} />
                <span className="absolute left-1.5 top-1 text-[11px] font-bold" style={{ color: "#DC2626" }}>取得回避</span>
                <span className="absolute right-1.5 top-1 text-[11px] font-bold" style={{ color: "#D97706" }}>出口前提で条件付</span>
                <span className="absolute left-1.5 bottom-1 text-[11px] font-bold" style={{ color: "#0D9488" }}>需要先行・供給精査</span>
                <span className="absolute right-1.5 bottom-1 text-[11px] font-bold" style={{ color: "#16A34A" }}>積極取得</span>
                <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300" />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-300" />
                <div className="absolute rounded-full border-[3px] border-white shadow-md z-10"
                  style={{ width: 15, height: 15, left: `${mX(supplyScore)}%`, top: `${mY(gap)}%`, transform: "translate(-50%,-50%)", backgroundColor: st.color }}>
                  <span className="absolute left-[18px] -top-0.5 whitespace-nowrap rounded bg-white/85 dark:bg-slate-900/80 px-1 text-[11px] font-extrabold text-slate-900 dark:text-white">{short}</span>
                </div>
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-muted-foreground">供給スコア（雇用基盤）→</span>
              </div>
              <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                縦=需要が全国平均より強い/弱い　横=供給(CI102スコア {Math.round(supplyScore)}/100)
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-end gap-2">
                <span className="text-[42px] leading-none font-black" style={{ color: tone(c.pop_change_pct) }}>{fmtPct(c.pop_change_pct)}</span>
                <span className="text-[11px] font-semibold text-muted-foreground pb-1.5">5年間の<br/>人口増減率</span>
              </div>
              <div className="relative h-4 rounded-lg mt-4" style={{ background: "linear-gradient(90deg,#EF4444 0%,#F59E0B 33%,#FDE047 55%,#86EFAC 73%,#16A34A 100%)" }}>
                <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-slate-900 dark:bg-white" style={{ left: `${sPos(c.national_pop_change_pct)}%`, transform: "translateX(-1px)" }}>
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-white/90 dark:bg-slate-900/90 px-1 text-[11px] font-bold">全国 {fmtPct(c.national_pop_change_pct)}</span>
                </div>
                <div className="absolute top-1/2 h-4 w-4 rounded-full border-[3px] border-white shadow-md z-10" style={{ left: `${sPos(c.pop_change_pct)}%`, transform: "translate(-50%,-50%)", backgroundColor: d.color }} />
              </div>
              <div className="mt-6 flex justify-between text-[11px] font-semibold text-muted-foreground"><span>-10%</span><span>-5%</span><span>0%</span><span>+5%</span></div>
            </div>
          )}

          {/* metrics */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2 rounded-xl border bg-muted/40 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-muted-foreground">人口 (2025)</p>
              <p className="text-xl font-extrabold">{c.population.toLocaleString()}</p>
              <p className="text-xs font-extrabold" style={{ color: tone(c.pop_change_pct) }}>{upDown(c.pop_change_pct)} {fmtPct(c.pop_change_pct)}（{popDelta.toLocaleString()}人）</p>
            </div>
            <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-muted-foreground">世帯 (2025)</p>
              <p className="text-lg font-extrabold">{c.households.toLocaleString()}</p>
              <p className="text-xs font-extrabold" style={{ color: tone(c.hh_change_pct) }}>{upDown(c.hh_change_pct)} {fmtPct(c.hh_change_pct)}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 px-3 py-2 text-center">
              <p className="text-[11px] font-semibold text-muted-foreground">人口密度</p>
              <p className="text-lg font-extrabold">{c.density.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">人/km²</p>
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">需要 全国比</span>
              <span className="text-xs font-extrabold" style={{ color: above ? "#16A34A" : "#DC2626" }}>{above ? "+" : ""}{gap.toFixed(1)}pt {above ? "上回る" : "下回る"}</span>
            </div>
          </div>
        </div>

        {divergence && (
          <p className="mt-3.5 rounded-lg bg-slate-100 dark:bg-slate-800/50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">💡 {divergence}</p>
        )}

        {/* 立地選定ヒント */}
        <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
          <span className="font-extrabold text-[#1B2A4A] dark:text-white mr-2">📍 立地選定のヒント</span>
          {locationHint(c.momentum_class)}
        </p>

        {/* 次のアクション */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-extrabold text-[#1B2A4A] dark:text-white text-xs mr-1">✓ 次のアクション</span>
          {["① 供給の中身(経済基盤タブ)", "② 価格・利回り(不動産タブ)", "③ リスク(洪水・アクセス)", "④ DCFで最終判断"].map((s) => (
            <span key={s} className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 px-2.5 py-1 text-[11px] font-bold">{s}</span>
          ))}
        </div>

        <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
          出典: {c.source}　│　需要=直近実測（本指標）× 供給=CI102経済分析(2021)。両輪で購入可否を判断します。
        </p>
      </CardContent>
    </Card>
  );
}
