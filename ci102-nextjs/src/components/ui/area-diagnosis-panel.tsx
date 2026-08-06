"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import type { MunicipalityData } from "@/lib/use-municipality-data";

type Cls = NonNullable<PrefectureData["census2025"]>["momentum_class"];

const DCLASS: Record<Cls, number> = {
  growth: 85,
  resilient: 70,
  outperform_decline: 55,
  decline: 38,
  severe_decline: 20,
};

function rating(score: number): { label: string; color: string } {
  if (score >= 75) return { label: "強い", color: "#16A34A" };
  if (score >= 60) return { label: "やや強い", color: "#0D9488" };
  if (score >= 45) return { label: "中立", color: "#CA8A04" };
  if (score >= 30) return { label: "やや弱い", color: "#EA580C" };
  return { label: "弱い", color: "#E11D48" };
}

const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const fmtNum = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function stance(overall: number, demand: number, supply: number) {
  if (overall >= 70)
    return { label: "積極取得を検討", color: "#16A34A", text: "需要・供給・将来性が揃う優良市場。価格と利回りが見合えば主力対象。" };
  if (overall >= 55)
    return demand >= supply
      ? { label: "選別取得（需要先行）", color: "#0D9488", text: "需要は追い風。供給(雇用基盤)の中身を精査し、立地を絞って取得。" }
      : { label: "条件付取得（出口前提）", color: "#CA8A04", text: "供給は堅いが需要は伸び悩み。出口戦略を設計のうえ高稼働物件に限定。" };
  if (overall >= 40)
    return { label: "様子見・厳選", color: "#EA580C", text: "強みは局所的。中心部の希少立地・底堅い用途に限定して検討。" };
  return { label: "取得は原則見送り", color: "#E11D48", text: "需要・供給とも弱い。新規取得は見送り、保有資産は早期出口・用途転換を検討。" };
}

// EBM健全度（CI102: 3〜6が健全域）
function ebmHealth(ebm: number): number {
  if (ebm >= 3 && ebm <= 6) return 100;
  if (ebm >= 2 && ebm <= 8) return 75;
  if (ebm >= 1.5 && ebm <= 10) return 55;
  return 35;
}
function supplyFromBase(ebm: number, basicRatio: number, totalEmp: number): number {
  const ebmScore = ebmHealth(ebm);
  const ratioScore = clamp(basicRatio * 4, 0, 100); // 25%→100
  const scaleScore = clamp(Math.log10(Math.max(1, totalEmp)) * 20 - 20, 0, 100);
  return Math.round(0.5 * ebmScore + 0.35 * ratioScore + 0.15 * scaleScore);
}

type Need = { icon: string; label: string; why: string };

export function AreaDiagnosisPanel({
  area,
  pref,
  city = null,
}: {
  area: string;
  pref: PrefectureData;
  city?: MunicipalityData | null;
}) {
  // モメンタム: 市区町村の速報があれば細分、なければ都道府県
  const c = city?.census2025 ?? pref.census2025;
  if (!c) return null;
  const momoFine = !!city?.census2025;
  const pop2020 = c.population_2020;
  const popDelta = c.population - pop2020;
  const hh2020 = Math.round(c.households / (1 + (c.hh_change_pct || 0) / 100));
  const hhDelta = c.households - hh2020;
  const ssTable = pref.shift_share_table ?? [];
  const ssNat = ssTable.reduce((sum, i) => sum + i.national_growth, 0);
  const ssMix = ssTable.reduce((sum, i) => sum + i.industry_mix, 0);
  const ssActual = pref.actual_emp_change ?? ssTable.reduce((sum, i) => sum + i.actual_change, 0);
  const rsMid = pref.rs_total_mid ?? null;

  const su = pref.suitability_score;
  const gap = c.momentum_gap;
  const agg = pref.aggregate_gap_factor ?? 0;
  const leak = pref.num_leakage_sectors ?? 0;
  const rs = pref.rs_total ?? 0;

  // 経済基盤: 市区町村が選択されていれば細分エリア、なければ都道府県（いずれも中分類95業種）
  const useCity = !!city;
  const ebScopeName = useCity ? city!.area_name : pref.pref_name;
  const scopeTag = useCity ? "市区町村レベル" : "都道府県レベル";
  const totalEmp = (useCity ? city!.total_emp : pref.total_employment) ?? 0;
  const ebmMid = (useCity ? (city!.ebm_mid ?? city!.ebm) : (pref.ebm_mid ?? pref.ebm)) ?? pref.ebm ?? 0;
  const basicMid = Math.round(((useCity ? (city!.basic_emp_mid ?? city!.basic_emp) : (pref.basic_emp_mid ?? pref.basic_emp)) ?? 0));
  const basicRatioMid = (useCity ? (city!.basic_ratio_mid ?? city!.basic_ratio) : (pref.basic_ratio_mid ?? pref.basic_ratio)) ?? 0;
  const baseInd = ((useCity ? city!.top_lq_industries_mid : pref.top_lq_industries_mid) ?? pref.top_lq_industries ?? []).slice(0, 5);
  const basicPct = totalEmp > 0 ? (basicMid / totalEmp) * 100 : basicRatioMid;
  const nonBasic = Math.max(0, totalEmp - basicMid);
  const resolvedPop = c.population;
  const perLocal = totalEmp > 0 ? resolvedPop / totalEmp : (pref.per ?? 0);

  // 将来需要予測（社人研 2025→2035・都道府県）→ 世帯・住宅戸数へ換算
  const pp = pref.pop_projection;
  const pop2025 = pp?.["2025"] ?? pref.population;
  const pop2035 = pp?.["2035"] ?? null;
  const pph = pref.persons_per_household || 0;
  let fd: { dPop: number; dHH: number; dPct: number } | null = null;
  if (pop2035 && pph > 0) {
    const dPop = pop2035 - pop2025;
    const dHH = Math.round(pop2035 / pph - pop2025 / pph);
    fd = { dPop: Math.round(dPop), dHH, dPct: (dPop / pop2025) * 100 };
  }
  const dPct = fd?.dPct ?? null;

  // スコア（将来性は規模非依存に正規化: RSを雇用比に変換）
  const rsShare = totalEmp > 0 ? (rs / totalEmp) * 100 : 0;
  const demand = Math.min(100, (DCLASS[c.momentum_class] ?? 40) + Math.min(10, leak * 3) + (agg > 10 ? 5 : 0));
  const supply = useCity
    ? supplyFromBase(ebmMid, basicRatioMid, totalEmp)
    : Math.round(0.45 * (su?.ratio_score ?? 0) + 0.25 * (su?.ebm_score ?? 0) + 0.3 * (su?.scale_score ?? 0));
  let future = 50 + clamp(gap * 4, -24, 24) + clamp(rsShare * 8, -12, 12) + (dPct != null ? clamp(dPct * 1.2, -18, 12) : 0);
  future = Math.round(clamp(future, 0, 100));
  const overall = Math.round(0.4 * demand + 0.3 * supply + 0.3 * future);
  const st = stance(overall, demand, supply);

  const lq = (pref.top_lq_industries ?? []).filter((i) => i.lq > 1).slice(0, 3);
  const rsWin = [...(pref.shift_share_table ?? [])]
    .sort((a, b) => b.regional_shift - a.regional_shift)
    .filter((i) => i.regional_shift > 0)
    .slice(0, 3);

  const projTxt = dPct != null ? `${fmtPct(dPct)}（2025→2035推計・都道府県）` : "—";
  const lqNames = lq.length ? lq.map((i) => `${i.industry}(LQ ${i.lq.toFixed(2)})`).join("、") : "際立った特化産業なし";
  const rsNames = rsWin.length ? rsWin.map((i) => `${i.industry}(RS ${fmtNum(i.regional_shift)})`).join("、") : "競争優位産業なし";

  const gapTxt = agg > 5 ? "購買力の域外流出＝出店余地あり" : agg < -5 ? "供給過多ぎみ" : "ほぼ均衡";
  const demandTxt = `人口モメンタム ${fmtPct(c.pop_change_pct)}（全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt・${momoFine ? "市区町村実測" : "都道府県実測"}）／世帯 ${fmtPct(c.hh_change_pct)}。長期人口は ${projTxt}。小売需給ギャップ ${agg >= 0 ? "+" : ""}${agg.toFixed(1)}（${gapTxt}）。PER ${perLocal.toFixed(2)}。`;
  const supplyTxt = `経済基盤（${ebScopeName}・中分類）: 基盤雇用 ${basicMid.toLocaleString()} 人・基盤比率 ${basicRatioMid.toFixed(1)}%、EBM ${ebmMid.toFixed(1)}（基盤雇用1人が総雇用を約${ebmMid.toFixed(1)}人支える波及力）。総雇用 ${totalEmp.toLocaleString()} 人。${ebmMid >= 3 && ebmMid <= 6 ? "EBMはCI102健全域(3〜6)。" : ebmMid > 6 ? "EBMがやや高く基盤過小/通勤流入の可能性。" : "EBMが低く基盤依存度が高い。"}${basicRatioMid >= 12 ? "輸出基盤に厚みあり。" : "輸出基盤はやや薄め。"}`;
  const strengthTxt = `特化（域外を稼ぐ産業）: ${lqNames}。全国を上回る競争力で伸びる産業: ${rsNames}。市場規模スコア ${(su?.scale_score ?? 0).toFixed(0)}/100。`;
  const futureTxt = `将来性は「直近需要(全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt)×競争力(RSが雇用の${rsShare >= 0 ? "+" : ""}${rsShare.toFixed(2)}%)×長期推計(${projTxt})」で評価。${rs > 0 ? "競争力は全国平均を上回り、基盤雇用の純増余地がある。" : "競争力は全国平均を下回り、構造的に劣後。"}`;

  // CI102 指標の計算フロー（LQ→基盤雇用→EBM→PER→予測カスケード）
  const lqEx = baseInd.slice(0, 3);
  const whatIfBasic = 1000;
  const dEmp = ebmMid * whatIfBasic;
  const dPopWI = perLocal * dEmp;
  const dUnitsWI = pph > 0 ? dPopWI / pph : 0;
  const calcSteps: Array<{ title: string; formula: string; calc: string; note: string }> = [
    {
      title: "① 特化係数 LQ（何で稼ぐ地域か）",
      formula: "LQ = (地域の産業別従業者比) ÷ (全国の産業別従業者比)",
      calc: lqEx.length ? `例: ${lqEx.map((i) => `${i.industry} LQ ${i.lq.toFixed(2)}`).join(" / ")}` : "特化産業なし",
      note: "LQ>1 = 全国平均より特化 = 域外に売って所得を稼ぐ『基盤』産業。",
    },
    {
      title: "② 基盤雇用 Basic Employment",
      formula: "基盤雇用 = Σ 各産業の超過雇用（LQ>1分）= local_emp × (1 − 1/LQ)",
      calc: `基盤雇用 ${basicMid.toLocaleString()} 人 ／ 総雇用 ${totalEmp.toLocaleString()} 人（基盤比率 ${basicRatioMid.toFixed(1)}%）`,
      note: "域外需要に支えられた雇用。地域経済のエンジン。",
    },
    {
      title: "③ 経済基盤乗数 EBM",
      formula: "EBM = 総雇用 ÷ 基盤雇用",
      calc: `EBM = ${totalEmp.toLocaleString()} ÷ ${basicMid.toLocaleString()} = ${ebmMid.toFixed(2)}`,
      note: `基盤雇用1人が地域全体で約${ebmMid.toFixed(1)}人の雇用を生む波及力。${ebmMid >= 3 && ebmMid <= 6 ? "CI102健全域(3〜6)。" : ebmMid > 6 ? "高め=基盤過小/通勤流入の可能性。" : "低め=基盤依存度が高い。"}`,
    },
    {
      title: "④ 人口・雇用比 PER",
      formula: "PER = 人口 ÷ 総雇用",
      calc: `PER = ${resolvedPop.toLocaleString()} ÷ ${totalEmp.toLocaleString()} = ${perLocal.toFixed(2)}`,
      note: "雇用1人あたりの人口。雇用増が人口(需要)へ波及する係数。",
    },
    {
      title: "⑤ 予測カスケード（乗数の効き方）",
      formula: "Δ基盤雇用 →(×EBM) Δ総雇用 →(×PER) Δ人口 →(÷世帯人員) Δ住宅戸数",
      calc: `基盤+${whatIfBasic.toLocaleString()}人 → 総雇用 +${Math.round(dEmp).toLocaleString()} → 人口 +${Math.round(dPopWI).toLocaleString()} → 住宅 +${Math.round(dUnitsWI).toLocaleString()} 戸`,
      note: "新規の基盤雇用(工場誘致・本社移転等)が住宅需要へ波及する理論量。投資インパクトの試算に。",
    },
  ];

  // このエリアのニーズ（用途別・細分）
  const segNeed: Record<string, Need> = {
    "商業・観光型": { icon: "🏨", label: "宿泊・店舗・都市型賃貸", why: "商業・観光の集積 → 来街者×就業者の複合需要" },
    "工業基盤型": { icon: "🏭", label: "物流・工業・従業員向け住宅", why: "製造・物流が基盤 → 倉庫・寮・社宅の需要" },
    "都市サービス集積型": { icon: "🏢", label: "オフィス・都市型賃貸", why: "都市機能の集積 → 就業者向け住宅とオフィス" },
    "公務・教育型": { icon: "🎓", label: "学生・単身・ファミリー賃貸", why: "公務・教育の安定雇用 → 底堅い賃貸需要" },
    "高齢縮小型": { icon: "🏥", label: "医療・介護中心", why: "人口縮小・高齢化 → ディフェンシブ用途に限定" },
  };
  const needs: Need[] = [];
  const seg = city?.segment;
  if (seg && segNeed[seg]) needs.push(segNeed[seg]);
  if (c.pop_change_pct < 0 && c.hh_change_pct > 0)
    needs.push({ icon: "🏠", label: "単身・小世帯向け賃貸", why: `世帯増(${fmtPct(c.hh_change_pct)})×人口減 → 世帯分裂。ワンルーム/1LDKが底堅い` });
  if (dPct != null && dPct < -5)
    needs.push({ icon: "🏥", label: "医療・介護・シニア住宅", why: "長期人口が縮小 → 高齢化。ディフェンシブ用途に恒常需要" });
  if (agg > 10) needs.push({ icon: "🛒", label: "商業（出店余地）", why: `購買力が域外流出（漏損 +${agg.toFixed(1)}）→ 未充足の商業需要` });
  else if (agg < -10) needs.push({ icon: "🏢", label: "商業は差別化立地に限定", why: `小売が供給過多（余剰 ${agg.toFixed(1)}）→ 出店は競争激化` });
  if (basicRatioMid >= 12 && rs > 0)
    needs.push({ icon: "💼", label: "基盤就業者向け住宅", why: `輸出基盤が厚く(${basicRatioMid.toFixed(0)}%)競争力も上向き → 就業者の実需が安定` });
  const seenNeed = new Set<string>();
  const needsTop = needs.filter((n) => (seenNeed.has(n.label) ? false : (seenNeed.add(n.label), true))).slice(0, 5);

  // 投資の根拠(✓)と留意点(⚠)
  const strengths: string[] = [];
  const risks: string[] = [];
  if (c.momentum_class === "growth" || c.momentum_class === "resilient" || gap >= 0)
    strengths.push(`需要が全国平均を上回る（人口 ${fmtPct(c.pop_change_pct)}・全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt）（国勢調査2025速報）`);
  if (c.pop_change_pct < 0 && c.hh_change_pct > 0)
    strengths.push(`世帯増で賃貸・単身向け需要が底堅い（世帯 ${fmtPct(c.hh_change_pct)}）（国勢調査2025速報）`);
  lq.forEach((i) => strengths.push(`${i.industry}に特化（LQ ${i.lq.toFixed(2)}）＝域外から所得を稼ぐ基盤（経済センサス2021 / LQ）`));
  rsWin.slice(0, 2).forEach((i) => strengths.push(`${i.industry}が全国を上回る競争力で伸長（RS ${fmtNum(i.regional_shift)}）（シフトシェア分析）`));
  if (agg > 10) strengths.push(`小売購買力が域外へ流出＝出店余地（漏損 +${agg.toFixed(1)}）（小売ギャップ）`);
  if (fd && fd.dHH > 0) strengths.push(`長期で世帯純増 約${fd.dHH.toLocaleString()}（都道府県推計→住宅純需要の拡大）`);
  if (ebmMid >= 3 && ebmMid <= 6) strengths.push(`EBM ${ebmMid.toFixed(1)} はCI102健全域(3〜6)＝基盤と波及のバランス良好`);

  if (c.momentum_class === "decline" || c.momentum_class === "severe_decline")
    risks.push(`直近人口が減少（${fmtPct(c.pop_change_pct)}・全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt）（国勢調査2025速報）`);
  if (dPct != null && dPct < -10) risks.push(`長期人口が大きく縮小見込み（${fmtPct(dPct)} 2025→2035）（社人研推計）`);
  if (basicRatioMid < 5) risks.push(`輸出基盤が薄く域外需要ショックに弱い（基盤比率 ${basicRatioMid.toFixed(1)}%）（EBM/基盤雇用）`);
  if (ebmMid > 8) risks.push(`EBMが高く基盤過小/通勤流入の可能性 → 経済圏での再評価を推奨（EBM ${ebmMid.toFixed(1)}）`);
  if (agg < -10) risks.push(`小売が供給過多＝新規出店は競争激化（余剰 ${agg.toFixed(1)}）（小売ギャップ）`);
  if (rs < 0) risks.push(`競争力が全国平均を下回る（RS ${fmtNum(rs)}）（シフトシェア分析）`);
  const strengthsTop = strengths.slice(0, 4);
  const risksTop = risks.slice(0, 4);

  const Chip = ({ label, score }: { label: string; score: number }) => {
    const r = rating(score);
    return (
      <div className="rounded-xl border bg-muted/40 px-3 py-2.5">
        <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
        <div className="text-base font-black" style={{ color: r.color }}>{r.label}</div>
        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{score}<span className="text-muted-foreground">/100</span></div>
        <div className="mt-1.5 h-[5px] rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: r.color }} />
        </div>
      </div>
    );
  };

  const Section = ({ icon, title, score, body }: { icon: string; title: string; score: number; body: string }) => {
    const r = rating(score);
    return (
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-base">{icon}</span>
          <span className="text-[13px] font-extrabold flex-1">{title}</span>
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white" style={{ backgroundColor: r.color }}>{r.label} {score}</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{body}</p>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden shadow-sm" data-print-block>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <p className="text-[17px] font-extrabold tracking-tight">
              🏙️ CI102 エリア総合診断 <span className="font-semibold text-muted-foreground">— {area}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              需要・供給・強み・将来性をCI102手法で統合し、購入/売却の「将来性」を判定
              <span className="ml-2 inline-block rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">経済基盤: {scopeTag}（{ebScopeName}）</span>
            </p>
          </div>
          <div className="flex-none rounded-xl border-2 px-4 py-2 text-center" style={{ borderColor: st.color }}>
            <div className="text-[9px] font-bold text-muted-foreground">エリア総合スコア</div>
            <div className="text-[26px] font-black leading-none" style={{ color: st.color }}>
              {overall}<span className="text-xs text-muted-foreground">/100</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Chip label="需要" score={demand} />
          <Chip label="供給" score={supply} />
          <Chip label="将来性" score={future} />
        </div>

        <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: `${st.color}12`, borderLeft: `5px solid ${st.color}` }}>
          <p className="text-[10px] font-bold tracking-wider text-muted-foreground">エリア投資スタンス（購入・売却）</p>
          <p className="text-[21px] font-black leading-tight" style={{ color: st.color }}>{st.label}</p>
          <p className="text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-200 mt-0.5">{st.text}</p>
        </div>

        {/* 🔁 データ更新の変化 (以前2020 → 最新2025 実測) */}
        <div className="rounded-xl border px-4 py-3 mb-4 bg-card">
          <p className="text-[13px] font-extrabold">
            🔁 データ更新の変化
            <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— 以前 2020 → 最新 2025（国勢調査 実測 / {momoFine ? city!.area_name : pref.pref_name}）</span>
          </p>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-bold text-muted-foreground">人口</div>
              <div className="text-[13px] font-extrabold">{pop2020.toLocaleString()} <span className="text-muted-foreground">→</span> {c.population.toLocaleString()}</div>
              <div className="text-[11px] font-bold" style={{ color: c.pop_change_pct >= 0 ? "#16A34A" : "#DC2626" }}>{fmtNum(popDelta)} 人（{fmtPct(c.pop_change_pct)}）／ 全国 {fmtPct(c.national_pop_change_pct)}・差 {gap >= 0 ? "+" : ""}{gap.toFixed(1)}pt</div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-bold text-muted-foreground">世帯</div>
              <div className="text-[13px] font-extrabold">{hh2020.toLocaleString()} <span className="text-muted-foreground">→</span> {c.households.toLocaleString()}</div>
              <div className="text-[11px] font-bold" style={{ color: c.hh_change_pct >= 0 ? "#16A34A" : "#DC2626" }}>{fmtNum(hhDelta)} 世帯（{fmtPct(c.hh_change_pct)}）{c.pop_change_pct < 0 && c.hh_change_pct > 0 ? "／人口減でも世帯増=単身化" : ""}</div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            ※ 以前の分析は長期推計（2020→2040 {fmtPct(pref.pop_change_pct ?? 0)}）が主指標。今回のデータ更新で直近5年の<strong>実測</strong>モメンタムを追加し、需要判断を最新化。
          </p>
        </div>

        {/* 📊 雇用の変化とRS (2016→2021 シフトシェア分解・都道府県) */}
        {ssTable.length > 0 && (
          <details className="rounded-xl border px-4 py-3 mb-4 bg-card">
            <summary className="text-[13px] font-extrabold cursor-pointer select-none">
              📊 雇用の変化とRS（競争力）
              <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— 2016 → 2021 シフトシェア分解（経済センサス・都道府県。クリックで展開）</span>
            </summary>
            <p className="text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200 mt-1.5">
              総雇用の実測変化 <strong>{fmtNum(ssActual)} 人</strong> ＝ 全国トレンド {fmtNum(ssNat)} ＋ 産業構成 {fmtNum(ssMix)} ＋ <strong>地域シフト（RS＝競争力） {fmtNum(rs)}</strong>
            </p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-muted-foreground">RS 大分類17業種</div>
                <div className="text-lg font-black" style={{ color: rs >= 0 ? "#16A34A" : "#DC2626" }}>{fmtNum(rs)} 人</div>
                <div className="text-[10px] text-muted-foreground">牽引: {pref.top_rs_industry ?? "—"}（{fmtNum(pref.top_rs_value ?? 0)}）</div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-muted-foreground">RS 中分類95業種</div>
                <div className="text-lg font-black" style={{ color: (rsMid ?? 0) >= 0 ? "#16A34A" : "#DC2626" }}>{rsMid != null ? fmtNum(rsMid) : "—"} 人</div>
                <div className="text-[10px] text-muted-foreground">牽引: {pref.top_rs_industry_mid ?? "—"}（{fmtNum(pref.top_rs_value_mid ?? 0)}）</div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-muted-foreground">競争力の評価</div>
                <div className="text-lg font-black" style={{ color: rs >= 0 ? "#16A34A" : "#DC2626" }}>{rs >= 0 ? "全国平均超" : "全国平均未満"}</div>
                <div className="text-[10px] text-muted-foreground">雇用比 {rsShare >= 0 ? "+" : ""}{rsShare.toFixed(2)}%</div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              ※ RSがプラス＝「全国平均を上回る地域固有の競争力で雇用が純増」。将来の基盤雇用の増減を示す先行シグナル。<strong>期間は2016→2021の1期間</strong>（経済センサス。より新しい版は未公表）。多期間のRS推移には2011センサスの取込が必要（未取得）。
            </p>
          </details>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <Section icon="📈" title="需要 — 買い手・借り手の量と将来" score={demand} body={demandTxt} />
          <Section icon="🏭" title="供給 — 雇用基盤の厚み" score={supply} body={supplyTxt} />
          <Section icon="💪" title="このエリアの強み — 何で稼ぐ地域か" score={Math.max(demand, future)} body={strengthTxt} />
          <Section icon="🔭" title="将来性 — 伸びるか縮むか" score={future} body={futureTxt} />
        </div>

        {/* 🧮 指標の計算フロー (CI102の導出過程) */}
        <details className="mt-4 rounded-xl border-2 px-4 py-3.5" style={{ borderColor: "rgba(37,99,235,0.2)", backgroundColor: "rgba(37,99,235,0.03)" }}>
          <summary className="text-[13px] font-extrabold text-blue-800 dark:text-blue-300 cursor-pointer select-none">
            🧮 指標の計算フロー（CI102）
            <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— LQ → 基盤雇用 → EBM → PER → 人口・世帯・住宅需要（{ebScopeName}・中分類。クリックで展開）</span>
          </summary>
          <div className="mt-3 space-y-2.5">
            {calcSteps.map((s, i) => (
              <div key={i} className="rounded-lg border bg-card px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex-none w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-black grid place-items-center">{i + 1}</span>
                  <span className="text-[12px] font-extrabold">{s.title}</span>
                </div>
                <p className="mt-1 text-[11px] font-mono text-slate-700 dark:text-slate-200">{s.formula}</p>
                <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">{s.calc}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{s.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">※ 乗数(EBM/PER)は現在の産業構造が続くと仮定した理論値。基盤雇用はLQ&gt;1産業の超過雇用の合計（中分類95業種で算出）。</p>
        </details>

        {/* 🏭 経済基盤分析 (基盤/非基盤の可視化 + 特化産業) */}
        <div className="mt-4 rounded-xl border-2 px-4 py-3.5" style={{ borderColor: "rgba(27,42,74,0.15)", backgroundColor: "rgba(27,42,74,0.03)" }}>
          <p className="text-[13px] font-extrabold text-[#1B2A4A] dark:text-white">
            🏭 経済基盤分析
            <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— {ebScopeName}：域外から所得を呼ぶ「基盤雇用」</span>
          </p>
          <div className="mt-2.5">
            <div className="flex justify-between text-[10px] font-semibold mb-1">
              <span className="text-emerald-700 dark:text-emerald-400">基盤雇用 {basicMid.toLocaleString()}人（{basicPct.toFixed(1)}%）</span>
              <span className="text-slate-500">非基盤雇用 {nonBasic.toLocaleString()}人</span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700">
              <div className="h-full" style={{ width: `${Math.min(100, basicPct)}%`, backgroundColor: "#16A34A" }} />
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200 mt-2.5">
            基盤を担う特化産業（LQが1を超える＝域外を稼ぐ）:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {baseInd.length ? (
              baseInd.map((i) => (
                <span key={i.industry} className="rounded-full border bg-white dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold">
                  {i.industry} <span className="text-emerald-600 dark:text-emerald-400">LQ {i.lq.toFixed(2)}</span>
                </span>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">LQが1を超える特化産業は乏しく、域外を稼ぐ基盤は限定的。</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            ※ 中分類95業種で算出（大分類17業種はLQ&gt;1業種が少なく基盤を過小評価するため / Mulligan凸性質）。参考: 大分類EBM {(pref.ebm ?? 0).toFixed(1)}。
          </p>
        </div>

        {/* 🔮 将来需要予測 (社人研 → 世帯 → 住宅戸数) */}
        {fd && (
          <div className="mt-4 rounded-xl border-2 px-4 py-3.5" style={{ borderColor: "rgba(13,148,136,0.25)", backgroundColor: "rgba(13,148,136,0.04)" }}>
            <p className="text-[13px] font-extrabold text-teal-800 dark:text-teal-300">
              🔮 将来需要予測
              <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— 社人研 2025→2035 推計（都道府県）を投資判断用の「戸数」に換算</span>
            </p>
            <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-card px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-muted-foreground">人口 (2025→2035)</div>
                <div className="text-lg font-black" style={{ color: fd.dPop >= 0 ? "#16A34A" : "#DC2626" }}>{fmtPct(fd.dPct)}</div>
                <div className="text-[10px] text-muted-foreground">{fmtNum(fd.dPop)} 人</div>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-muted-foreground">世帯増減 → 住宅純需要</div>
                <div className="text-lg font-black" style={{ color: fd.dHH >= 0 ? "#16A34A" : "#DC2626" }}>{fmtNum(fd.dHH)} 戸</div>
                <div className="text-[10px] text-muted-foreground">世帯人員 {pph.toFixed(2)} 人で換算</div>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2 text-center">
                <div className="text-[10px] font-bold text-muted-foreground">供給の耐性（基盤）</div>
                <div className="text-lg font-black" style={{ color: rating(supply).color }}>{rating(supply).label}</div>
                <div className="text-[10px] text-muted-foreground">基盤比率 {basicRatioMid.toFixed(1)}% / RS {rs > 0 ? "上向き" : "下向き"}</div>
              </div>
            </div>
            <p className="text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200 mt-2.5">
              {fd.dHH >= 0
                ? `今後10年で世帯が約${fd.dHH.toLocaleString()}増える見込み。新規住宅の純需要が期待でき、${rs > 0 ? "競争力ある基盤雇用が下支え。" : "ただし雇用競争力は弱く、立地選別が重要。"}`
                : `今後10年で世帯が約${Math.abs(fd.dHH).toLocaleString()}減る見込み。新規供給より更新・建替・用途転換の需要が中心。${basicRatioMid >= 12 ? "厚い輸出基盤が縮小を緩和。" : "輸出基盤が薄く、縮小が加速しやすい。"}`}
              <span className="text-muted-foreground"> ※ 戸数は世帯純増減の目安（空室・建替除く）。</span>
            </p>
          </div>
        )}

        {/* 🎯 このエリアのニーズ */}
        {needsTop.length > 0 && (
          <div className="mt-4 rounded-xl border px-4 py-3.5 bg-card">
            <p className="text-[13px] font-extrabold">
              🎯 このエリアで狙うべきニーズ（用途別）
              <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— {area} の需要構造から</span>
            </p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {needsTop.map((n) => (
                <div key={n.label} className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="text-base leading-none">{n.icon}</span>
                  <div>
                    <div className="text-[12px] font-extrabold">{n.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-snug">{n.why}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 投資の根拠 × リスク */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
            <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 mb-1.5">✓ 投資の根拠（このエリアの強み）</p>
            {strengthsTop.length ? (
              strengthsTop.map((t, i) => (
                <p key={i} className="text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200">・{t}</p>
              ))
            ) : (
              <p className="text-[11.5px] text-muted-foreground">際立った強みは限定的。</p>
            )}
          </div>
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 px-4 py-3">
            <p className="text-xs font-extrabold text-rose-700 dark:text-rose-400 mb-1.5">⚠ 留意すべきリスク</p>
            {risksTop.length ? (
              risksTop.map((t, i) => (
                <p key={i} className="text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-200">・{t}</p>
              ))
            ) : (
              <p className="text-[11.5px] text-muted-foreground">重大なリスクは検出されず。</p>
            )}
          </div>
        </div>

        <p className="mt-4 border-t pt-2 text-[10px] text-muted-foreground">
          CI102: LQ特化・シフトシェア競争力・小売ギャップ需給・EBM/PER（2021経済センサス）＋人口モメンタム（2025国勢調査速報）＋将来推計（社人研）を統合。経済基盤は{scopeTag}で算出。将来性 = 直近需要 × 競争力(RS/雇用比) × 長期推計。
        </p>
      </CardContent>
    </Card>
  );
}
