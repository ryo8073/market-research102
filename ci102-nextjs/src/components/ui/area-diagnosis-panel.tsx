"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import type { MunicipalityData } from "@/lib/use-municipality-data";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

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

const fmtPct = (v: number) => `${v > 0 ? "▲+" : v < 0 ? "▼" : ""}${v.toFixed(1)}%`;
const fmtNum = (v: number) => `${v > 0 ? "▲+" : v < 0 ? "▼" : ""}${Math.round(v).toLocaleString()}`;
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

/* ── データ性質バッジ ── */
type DataTag = "実測" | "推計" | "理論";
const TAG_STYLE: Record<DataTag, { bg: string; text: string }> = {
  "実測": { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-400" },
  "推計": { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-400" },
  "理論": { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-400" },
};
function DataBadge({ tag }: { tag: DataTag }) {
  const s = TAG_STYLE[tag];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${s.bg} ${s.text}`}>{tag}</span>;
}

/* ── 指標カード（1指標＝数値＋投資家への意味） ── */
function MetricRow({ label, value, unit, meaning, tag }: {
  label: string; value: string; unit?: string; meaning: string; tag: DataTag;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
          <DataBadge tag={tag} />
        </div>
        <div className="text-[14px] font-black leading-tight mt-0.5">
          {value}{unit && <span className="text-[11px] font-semibold text-muted-foreground ml-0.5">{unit}</span>}
        </div>
        <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400 mt-0.5">{meaning}</p>
      </div>
    </div>
  );
}

/** 経済圏合算データ（decision-hub-tabから渡される） */
interface EconZoneOverride {
  ebm: number;
  basic_ratio: number;
  basic_employment: number;
  total_employment: number;
  n_basic_industries: number;
  top_lq_industries: Array<{ industry: string; lq: number; basic_emp: number }>;
  // 複数県集約の人口・世帯データ（Phase2 Pre-mortem#3対応）
  population?: number;
  population_2020?: number;
  households?: number;
  pop_change_pct?: number;
  hh_change_pct?: number;
  rented_pct?: number;
  rented_private_pct?: number;
}

export function AreaDiagnosisPanel({
  area,
  pref,
  city = null,
  econZone = null,
}: {
  area: string;
  pref: PrefectureData;
  city?: MunicipalityData | null;
  econZone?: EconZoneOverride | null;
}) {
  // モメンタム: 市区町村の速報があれば細分、なければ都道府県
  const c = city?.census2025 ?? pref.census2025;
  if (!c) return null;
  const momoFine = !!city?.census2025;

  // 経済圏モード時は集約データを優先
  const useEzPop = !!(econZone?.population);
  const resolvedPopulation = useEzPop ? econZone!.population! : c.population;
  const resolvedPop2020 = useEzPop ? (econZone!.population_2020 ?? c.population_2020) : c.population_2020;
  const resolvedHouseholds = useEzPop ? (econZone!.households ?? c.households) : c.households;
  const resolvedPopChangePct = useEzPop ? (econZone!.pop_change_pct ?? c.pop_change_pct) : c.pop_change_pct;
  const resolvedHhChangePct = useEzPop ? (econZone!.hh_change_pct ?? c.hh_change_pct) : c.hh_change_pct;

  const pop2020 = resolvedPop2020;
  const popDelta = resolvedPopulation - pop2020;
  const hh2020 = Math.round(resolvedHouseholds / (1 + (resolvedHhChangePct || 0) / 100));
  const hhDelta = resolvedHouseholds - hh2020;

  // 借家世帯比率（経済圏集約 or 市区町村 or 都道府県）
  const ht = useEzPop && econZone?.rented_pct != null
    ? { total: 0, owned_pct: 100 - econZone.rented_pct, rented_pct: econZone.rented_pct, rented_private_pct: econZone.rented_private_pct ?? 0, source: "経済圏集約（2020年国勢調査）" }
    : (city?.housing_tenure ?? pref.housing_tenure) ?? null;

  // 時系列データ（2000-2025）
  const ts = (city?.pop_timeseries ?? pref.pop_timeseries ?? []).filter(
    (d) => d.population != null
  );
  // 5年ごとの変化率を算出
  const tsWithRate = ts.map((d, i) => {
    const prev = i > 0 ? ts[i - 1] : null;
    const popRate = prev ? ((d.population - prev.population) / prev.population) * 100 : null;
    const hhRate = prev && d.households && prev.households
      ? ((d.households - prev.households) / prev.households) * 100 : null;
    const agingRate = d.pop_over65 && d.population ? (d.pop_over65 / d.population) * 100 : null;
    return {
      year: d.year,
      population: d.population,
      households: d.households ?? null,
      popRate,
      hhRate,
      agingRate,
    };
  });
  const hasTimeseries = tsWithRate.length >= 3;

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

  // 経済基盤: 経済圏 > 市区町村 > 都道府県の優先順で使用（中分類95業種）
  const useEconZone = !!econZone;
  const useCity = !useEconZone && !!city;
  const ebScopeName = useEconZone ? area : useCity ? city!.area_name : pref.pref_name;
  const scopeTag = useEconZone ? "経済圏（複数市区町村合算）" : useCity ? "市区町村レベル" : "都道府県レベル";
  const totalEmp = useEconZone ? econZone!.total_employment : (useCity ? city!.total_emp : pref.total_employment) ?? 0;
  const ebmMid = useEconZone ? econZone!.ebm : (useCity ? (city!.ebm_mid ?? city!.ebm) : (pref.ebm_mid ?? pref.ebm)) ?? pref.ebm ?? 0;
  const basicMid = useEconZone ? Math.round(econZone!.basic_employment) : Math.round(((useCity ? (city!.basic_emp_mid ?? city!.basic_emp) : (pref.basic_emp_mid ?? pref.basic_emp)) ?? 0));
  const basicRatioMid = useEconZone ? econZone!.basic_ratio : (useCity ? (city!.basic_ratio_mid ?? city!.basic_ratio) : (pref.basic_ratio_mid ?? pref.basic_ratio)) ?? 0;
  const baseInd = useEconZone
    ? econZone!.top_lq_industries.map(i => ({ industry: i.industry, lq: i.lq, basic_emp_estimate: i.basic_emp })).slice(0, 5)
    : ((useCity ? city!.top_lq_industries_mid : pref.top_lq_industries_mid) ?? pref.top_lq_industries ?? []).slice(0, 5);
  const basicPct = totalEmp > 0 ? (basicMid / totalEmp) * 100 : basicRatioMid;
  const nonBasic = Math.max(0, totalEmp - basicMid);
  const resolvedPop = resolvedPopulation;
  const perLocal = totalEmp > 0 ? resolvedPop / totalEmp : (pref.per ?? 0);

  // 将来需要予測（社人研 2025→2050・都道府県）→ 世帯・住宅戸数へ換算
  const pp = pref.pop_projection;
  const pop2025 = pp?.["2025"] ?? pref.population;
  const pop2035 = pp?.["2035"] ?? null;
  const pop2050 = pp?.["2050"] ?? null;
  const pph = pref.persons_per_household || 0;
  let fd: { dPop: number; dHH: number; dPct: number } | null = null;
  if (pop2035 && pph > 0) {
    const dPop = pop2035 - pop2025;
    const dHH = Math.round(pop2035 / pph - pop2025 / pph);
    fd = { dPop: Math.round(dPop), dHH, dPct: (dPop / pop2025) * 100 };
  }
  const dPct = fd?.dPct ?? null;

  // 将来推計データを時系列チャートに追加（2030〜2050、5年刻み）
  const projYears = [2030, 2035, 2040, 2045, 2050] as const;
  const tsWithProjection = (() => {
    if (!pp) return tsWithRate;
    const combined = [...tsWithRate];
    let prevPop = pp["2025"] ?? resolvedPop;
    for (const y of projYears) {
      const popY = pp[String(y)];
      if (!popY) continue;
      const rate = ((popY - prevPop) / prevPop) * 100;
      combined.push({
        year: y,
        population: null as unknown as number,
        households: null,
        popRate: null,
        hhRate: null,
        agingRate: null,
        populationProj: popY,
        popRateProj: rate,
      } as typeof tsWithRate[0] & { populationProj?: number; popRateProj?: number });
      prevPop = popY;
    }
    return combined;
  })();
  const hasProjection = pp && projYears.some((y) => pp[String(y)]);

  // 25年後（2050年）の推計
  let fd50: { dPop: number; dPct: number } | null = null;
  if (pop2050 && pop2025) {
    const dPop50 = pop2050 - pop2025;
    fd50 = { dPop: Math.round(dPop50), dPct: (dPop50 / pop2025) * 100 };
  }

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

  /* ── この街をひとことで ── */
  const headline = (() => {
    const parts: string[] = [];
    // 人口トレンド
    const _pcp = resolvedPopChangePct;
    const _hcp = resolvedHhChangePct;
    if (_pcp >= 1) parts.push("人口が増えている");
    else if (_pcp >= -1) parts.push("人口はほぼ横ばい");
    else if (_pcp >= -5) parts.push("人口は緩やかに減少している");
    else parts.push("人口が大きく減少している");
    // 世帯トレンド
    if (_hcp > 0 && _pcp < 0) parts.push("一方で世帯数は増えており、単身化・小世帯化が進んでいる");
    else if (_hcp > 0) parts.push("世帯数も増加している");
    else parts.push("世帯数も減少している");
    // 経済基盤の特徴
    const topInd = baseInd[0];
    if (topInd && topInd.lq >= 1.2) {
      parts.push(`「${topInd.industry}」が全国の${topInd.lq.toFixed(1)}倍と特化した街`);
    } else if (basicRatioMid >= 15) {
      parts.push("域外から所得を稼ぐ基盤産業が厚い街");
    } else {
      parts.push("地域内サービス中心の街");
    }
    // 借家比率
    if (ht && ht.rented_pct >= 40) parts.push("借家世帯の割合が高い街");
    return parts.join("、") + "です。";
  })();

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

  // 投資の根拠(✓)と留意点(⚠) — 事実・解釈・出典を構造化
  type Evidence = { fact: string; implication: string; source: string };
  const strengths: Evidence[] = [];
  const risks: Evidence[] = [];

  if (c.momentum_class === "growth" || c.momentum_class === "resilient" || gap >= 0)
    strengths.push({
      fact: `人口 ${fmtPct(c.pop_change_pct)}（全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt）`,
      implication: "入居需要が全国平均を上回る — 空室リスクが相対的に低い",
      source: "国勢調査2025速報",
    });
  if (c.pop_change_pct < 0 && c.hh_change_pct > 0)
    strengths.push({
      fact: `人口減でも世帯は増加（${fmtPct(c.hh_change_pct)}）`,
      implication: "単身化・世帯分裂 → 小型賃貸の実需が底堅い",
      source: "国勢調査2025速報",
    });
  lq.forEach((i) => strengths.push({
    fact: `${i.industry}に特化（LQ ${i.lq.toFixed(2)}）`,
    implication: "域外から所得を稼ぐ基盤産業 — テナント需要の安定源",
    source: "経済センサス2021 / LQ分析",
  }));
  rsWin.slice(0, 2).forEach((i) => strengths.push({
    fact: `${i.industry}が競争力で純増（RS ${fmtNum(i.regional_shift)}）`,
    implication: "全国トレンド以上に伸びる産業 — 将来の雇用増・賃料上昇の可能性",
    source: "シフトシェア分析 2016→2021",
  }));
  if (agg > 10) strengths.push({
    fact: `小売購買力が域外流出（漏損 +${agg.toFixed(1)}）`,
    implication: "地元で買えない需要がある — 商業施設の出店余地",
    source: "小売ギャップ分析",
  });
  if (fd && fd.dHH > 0) strengths.push({
    fact: `10年後に世帯 約${fd.dHH.toLocaleString()} 純増見込み`,
    implication: "新規住宅の実需が期待でき、中長期の稼働率を下支え",
    source: "社人研推計（都道府県）",
  });
  if (ebmMid >= 3 && ebmMid <= 6) strengths.push({
    fact: `EBM ${ebmMid.toFixed(1)}（CI102健全域 3〜6）`,
    implication: "基盤産業と地域サービスのバランスが良好 — 外部ショックへの耐性あり",
    source: "経済センサス2021 / EBM",
  });

  if (c.momentum_class === "decline" || c.momentum_class === "severe_decline")
    risks.push({
      fact: `人口減少 ${fmtPct(c.pop_change_pct)}（全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt）`,
      implication: "入居需要の縮小 → 空室率上昇・賃料下落圧力",
      source: "国勢調査2025速報",
    });
  if (dPct != null && dPct < -10) risks.push({
    fact: `長期人口が大幅縮小見込み（${fmtPct(dPct)} 2025→2035）`,
    implication: "出口（売却）時の買い手減少 → 流動性リスク",
    source: "社人研推計",
  });
  if (basicRatioMid < 5) risks.push({
    fact: `輸出基盤が薄い（基盤比率 ${basicRatioMid.toFixed(1)}%）`,
    implication: "域外需要に依存できず、外部ショック時に雇用が急減しやすい",
    source: "経済センサス2021 / EBM",
  });
  if (ebmMid > 8) risks.push({
    fact: `EBMが高い（${ebmMid.toFixed(1)}）`,
    implication: "基盤雇用が少ない or 通勤流入が多い → 経済圏での再評価を推奨",
    source: "経済センサス2021 / EBM",
  });
  if (agg < -10) risks.push({
    fact: `小売が供給過多（余剰 ${agg.toFixed(1)}）`,
    implication: "商業テナントの競争激化 → 賃料・稼働率に下方圧力",
    source: "小売ギャップ分析",
  });
  if (rs < 0) risks.push({
    fact: `競争力が全国平均未満（RS ${fmtNum(rs)}）`,
    implication: "産業が他地域に流出傾向 — 将来の雇用減少リスク",
    source: "シフトシェア分析 2016→2021",
  });
  const strengthsTop = strengths.slice(0, 5);
  const risksTop = risks.slice(0, 5);

  /* ── EBMの投資家向け解釈 ── */
  const ebmInterpretation = (): string => {
    if (ebmMid >= 3 && ebmMid <= 6) return "健全域 — 基盤産業と地域サービスのバランスが取れ、経済ショックへの耐性がある";
    if (ebmMid > 6) return "高め — 基盤雇用が少ないか通勤流入が多い。ベッドタウン型の可能性があり、雇用の質を精査";
    if (ebmMid >= 2) return "やや低め — 基盤産業への依存度が高い。特定企業の撤退リスクに注意";
    return "低い — 基盤産業に過度に依存。産業の多様性不足";
  };

  /* ── Chipコンポーネント（説明付き） ── */
  const CHIP_DESC: Record<string, string> = {
    "需要": "入居者・テナントの量と増減トレンド",
    "供給": "地域経済の自立度と雇用基盤の厚み",
    "将来性": "今後10年の需要変化と競争力の方向",
  };

  const Chip = ({ label, score }: { label: string; score: number }) => {
    const r = rating(score);
    return (
      <div className="rounded-xl border bg-muted/40 px-3 py-2.5">
        <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
        <div className="text-base font-black" style={{ color: r.color }}>{r.label}</div>
        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{score}<span className="text-muted-foreground">/100</span></div>
        <div className="mt-1 h-[5px] rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: r.color }} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{CHIP_DESC[label] ?? ""}</p>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden shadow-sm" data-print-block>
      <CardContent className="pt-4">
        {/* ── ヘッダー ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <p className="text-[17px] font-extrabold tracking-tight">
              CI102 エリア総合診断 <span className="font-semibold text-muted-foreground">— {area}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              不動産投資の根拠となる需要・供給・将来性を、政府統計から定量評価
              <span className="ml-2 inline-block rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">{scopeTag}（{ebScopeName}）</span>
            </p>
          </div>
          <div className="flex-none rounded-xl border-2 px-4 py-2 text-center" style={{ borderColor: st.color }}>
            <div className="text-[11px] font-bold text-muted-foreground">エリア総合スコア</div>
            <div className="text-[26px] font-black leading-none" style={{ color: st.color }}>
              {overall}<span className="text-xs text-muted-foreground">/100</span>
            </div>
          </div>
        </div>

        {/* ── この街をひとことで ── */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-4 py-3 mb-4">
          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-1">{area} の見方</p>
          <p className="text-[14px] font-extrabold leading-relaxed text-slate-800 dark:text-slate-100">{headline}</p>
        </div>

        {/* ── 投資家が最初に知るべき3つの問い ── */}
        <div className="rounded-xl border bg-slate-50 dark:bg-slate-900/40 px-4 py-3 mb-4">
          <p className="text-[11px] font-bold text-muted-foreground mb-2">この分析で答える3つの問い</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="text-[12px] leading-snug"><span className="font-bold">1. 借り手・買い手はいるか？</span><span className="text-muted-foreground"> → 需要スコア</span></div>
            <div className="text-[12px] leading-snug"><span className="font-bold">2. 地域経済は自立しているか？</span><span className="text-muted-foreground"> → 供給スコア</span></div>
            <div className="text-[12px] leading-snug"><span className="font-bold">3. 10年後も需要は続くか？</span><span className="text-muted-foreground"> → 将来性スコア</span></div>
          </div>
        </div>

        {/* ── 3スコアチップ ── */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Chip label="需要" score={demand} />
          <Chip label="供給" score={supply} />
          <Chip label="将来性" score={future} />
        </div>

        {/* ── 投資スタンス ── */}
        <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: `${st.color}12`, borderLeft: `5px solid ${st.color}` }}>
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground">エリア投資スタンス</p>
          <p className="text-[21px] font-black leading-tight" style={{ color: st.color }}>{st.label}</p>
          <p className="text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-200 mt-0.5">{st.text}</p>
        </div>

        {/* ── 📈 需要（構造化指標カード） ── */}
        <details className="rounded-xl border-2 px-4 py-3.5 mb-4" style={{ borderColor: "rgba(22,163,74,0.2)", backgroundColor: "rgba(22,163,74,0.03)" }}>
          <summary className="flex items-center gap-2 mb-1 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-black/5 dark:hover:bg-white/5 rounded-lg px-1 py-1 -mx-1 transition-colors">
            <span className="text-[11px] text-muted-foreground transition-transform [[open]>&]:rotate-90">▶</span>
            <span className="text-base">📈</span>
            <span className="text-[13px] font-extrabold flex-1">需要 — 借り手・買い手はいるか？</span>
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white" style={{ backgroundColor: rating(demand).color }}>{rating(demand).label} {demand}</span>
          </summary>
          <p className="text-[11px] text-muted-foreground mb-3 mt-2">人口と世帯の増減が、入居率・賃料・売却価格に直結します</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <MetricRow
              label="人口の増減（直近5年）"
              value={fmtPct(c.pop_change_pct)}
              unit={`全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt`}
              meaning={c.pop_change_pct >= 0
                ? "人口が増えている — 入居需要の拡大が見込める"
                : gap >= 0
                  ? "人口は減少しているが全国平均よりは良好 — 相対的に底堅い"
                  : "全国平均を下回る減少 — 空室リスクに注意"
              }
              tag="実測"
            />
            <MetricRow
              label="世帯数の増減（直近5年）"
              value={fmtPct(c.hh_change_pct)}
              unit={`${fmtNum(hhDelta)} 世帯`}
              meaning={c.hh_change_pct > 0
                ? c.pop_change_pct < 0
                  ? "人口減でも世帯は増加 — 単身化が進み小型賃貸に実需あり"
                  : "世帯も増加 — 住宅需要の裏付けが強い"
                : "世帯も減少 — 需要縮小。立地を厳選すべき"
              }
              tag="実測"
            />
            <MetricRow
              label="小売需給バランス"
              value={agg >= 0 ? `+${agg.toFixed(1)}` : agg.toFixed(1)}
              unit={agg > 5 ? "漏損（流出）" : agg < -5 ? "余剰（過剰）" : "均衡"}
              meaning={agg > 10
                ? `購買力が域外に流出 → 地元で買えない需要が${leak}業種。商業施設の出店余地`
                : agg < -10
                  ? "供給過多 — 商業テナントは競争激化。差別化が必須"
                  : "需給はほぼ均衡。商業は安定するが大きな成長余地は限定的"
              }
              tag="実測"
            />
            <MetricRow
              label="長期人口見通し（10年後）"
              value={dPct != null ? fmtPct(dPct) : "—"}
              unit="2025→2035"
              meaning={dPct != null
                ? dPct >= 0
                  ? "人口増加が続く見込み — 中長期の投資に適した市場"
                  : dPct > -5
                    ? "緩やかな縮小 — 好立地に絞れば投資は成立"
                    : "大幅な縮小見込み — 出口戦略を先に設計すべき"
                : "推計データなし"
              }
              tag="推計"
            />
            {ht && (
              <MetricRow
                label="借家世帯の割合"
                value={`${ht.rented_pct}%`}
                unit={`民間借家 ${ht.rented_private_pct}%`}
                meaning={ht.rented_pct >= 40
                  ? "借家比率が高い — 賃貸需要が厚く、投資対象として有力なエリア"
                  : ht.rented_pct >= 30
                    ? "借家比率は標準的 — 賃貸市場は安定しているが競争も存在"
                    : "持ち家中心の街 — 賃貸需要は限定的。ファミリー向け分譲の方が適する可能性"
                }
                tag="実測"
              />
            )}
          </div>
        </details>

        {/* ── 🏭 供給（経済基盤の厚み） ── */}
        <details className="rounded-xl border-2 px-4 py-3.5 mb-4" style={{ borderColor: "rgba(27,42,74,0.15)", backgroundColor: "rgba(27,42,74,0.03)" }}>
          <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-black/5 dark:hover:bg-white/5 rounded-lg px-1 py-1 -mx-1 transition-colors">
            <span className="text-[11px] text-muted-foreground transition-transform [[open]>&]:rotate-90">▶</span>
            <span className="text-base">🏭</span>
            <span className="text-[13px] font-extrabold flex-1">供給 — 地域経済は自立しているか？</span>
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white" style={{ backgroundColor: rating(supply).color }}>{rating(supply).label} {supply}</span>
          </summary>
          <p className="text-[11px] text-muted-foreground mb-3 mt-2">域外から所得を稼ぐ「基盤産業」の厚みが、雇用と賃料の安定性を左右します</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
            <MetricRow
              label="街の外からお金を呼び込む力（EBM）"
              value={ebmMid.toFixed(1)}
              unit="倍"
              meaning={`基盤雇用1人が${ebmMid.toFixed(1)}人分の雇用を支える波及力。${ebmInterpretation()}`}
              tag="理論"
            />
            <MetricRow
              label="外から稼ぐ仕事の割合（基盤比率）"
              value={`${basicRatioMid.toFixed(1)}%`}
              unit={`${basicMid.toLocaleString()}人 / ${totalEmp.toLocaleString()}人`}
              meaning={basicRatioMid >= 15
                ? "域外から所得を稼ぐ産業が厚い — 外部ショックに強く、雇用が安定"
                : basicRatioMid >= 8
                  ? "基盤は標準的 — 主要産業の動向が賃貸需要を左右する"
                  : "基盤が薄い — 地元消費に依存しており、景気に敏感"
              }
              tag="理論"
            />
          </div>

          {/* 基盤/非基盤バー */}
          <div>
            <div className="flex justify-between text-[11px] font-semibold mb-1">
              <span className="text-emerald-700 dark:text-emerald-400">基盤雇用 {basicMid.toLocaleString()}人（{basicPct.toFixed(1)}%）</span>
              <span className="text-slate-500">非基盤雇用 {nonBasic.toLocaleString()}人</span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700">
              <div className="h-full" style={{ width: `${Math.min(100, basicPct)}%`, backgroundColor: "#16A34A" }} />
            </div>
          </div>

          {/* 特化産業 */}
          <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-200 mt-2.5">
            街の外からお金を呼び込む特化産業（全国平均より働く人の割合が高い業種）:
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {baseInd.length ? (
              baseInd.map((i) => (
                <span key={i.industry} className="rounded-full border bg-white dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold">
                  {i.industry} <span className="text-emerald-600 dark:text-emerald-400">全国の{i.lq.toFixed(1)}倍</span>
                </span>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">LQが1を超える特化産業は乏しく、域外を稼ぐ基盤は限定的。</span>
            )}
          </div>
          <div className="mt-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              <strong>注意:</strong> EBMは分析対象の地域の取り方で大きく変わります。
              {ebmMid > 6 && " 単一行政区の分析ではEBMが過大になりやすく、この値もその傾向がある可能性があります。"}
              より正確な分析には、通勤圏を含む<strong>経済圏（複数市区町村）</strong>での再計算が推奨されます。
            </p>
            {!useEconZone && (
              <p className="text-[11px] mt-1">
                <a href="?tab=decision_hub" className="text-blue-700 dark:text-blue-400 underline font-bold">
                  → 投資判断ハブの「経済圏モード」で複数市区町村を合算して分析する
                </a>
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            ※ 中分類95業種で算出（大分類17業種はLQ&gt;1業種が少なく基盤を過小評価するため）。参考: 大分類EBM {(pref.ebm ?? 0).toFixed(1)}。
          </p>
        </details>

        {/* ── 🔭 将来性 ── */}
        <details className="rounded-xl border-2 px-4 py-3.5 mb-4" style={{ borderColor: "rgba(13,148,136,0.2)", backgroundColor: "rgba(13,148,136,0.03)" }}>
          <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-black/5 dark:hover:bg-white/5 rounded-lg px-1 py-1 -mx-1 transition-colors">
            <span className="text-[11px] text-muted-foreground transition-transform [[open]>&]:rotate-90">▶</span>
            <span className="text-base">🔭</span>
            <span className="text-[13px] font-extrabold flex-1">将来性 — 10年後も需要は続くか？</span>
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-white" style={{ backgroundColor: rating(future).color }}>{rating(future).label} {future}</span>
          </summary>
          <p className="text-[11px] text-muted-foreground mb-3 mt-2">出口（売却）時の価値を左右する「将来の需要と競争力」を3つの指標で評価</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            <MetricRow
              label="需要モメンタム"
              value={`全国比 ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}pt`}
              meaning={gap >= 2 ? "全国を大きく上回る — 成長市場" : gap >= 0 ? "全国並みかやや上 — 安定" : "全国より弱い — 縮小傾向"}
              tag="実測"
            />
            <MetricRow
              label="産業競争力（RS）"
              value={`${rsShare >= 0 ? "+" : ""}${rsShare.toFixed(2)}%`}
              unit="雇用比"
              meaning={rs > 0 ? "全国トレンド以上に雇用が伸びている — 基盤雇用の増加余地あり" : "雇用が全国に対し流出傾向 — 構造的劣後"}
              tag="実測"
            />
            <MetricRow
              label="10年後の人口推計"
              value={dPct != null ? fmtPct(dPct) : "—"}
              unit="2025→2035"
              meaning={dPct != null
                ? fd!.dHH >= 0
                  ? `世帯が約${fd!.dHH.toLocaleString()}増 → 新規住宅の純需要あり`
                  : `世帯が約${Math.abs(fd!.dHH).toLocaleString()}減 → 更新・建替中心`
                : "推計データなし"
              }
              tag="推計"
            />
            {fd50 && (
              <MetricRow
                label="25年後の人口推計"
                value={fmtPct(fd50.dPct)}
                unit="2025→2050"
                meaning={fd50.dPct >= -10
                  ? "長期的にも大きな縮小はない — 出口戦略の選択肢が広い"
                  : fd50.dPct >= -20
                    ? "25年で1-2割縮小 — 出口時期を意識した投資計画が必要"
                    : "25年で2割以上縮小 — 短期回収型の投資か、ディフェンシブ用途に限定"
                }
                tag="推計"
              />
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
            {rs > 0
              ? "産業の競争力が全国平均を上回っており、基盤雇用の純増余地がある。需要の下支えが期待できる市場。"
              : "産業の競争力は全国平均を下回る。構造的な改善がなければ、需要は徐々に縮小する見通し。"
            }
            {fd && fd.dHH < 0 && basicRatioMid >= 12 ? " ただし輸出基盤の厚みが縮小を緩和する可能性あり。" : ""}
          </p>
        </details>

        {/* ── 🔁 データ更新の変化 (以前2020 → 最新2025 実測) ── */}
        <div className="rounded-xl border px-4 py-3 mb-4 bg-card">
          <p className="text-[13px] font-extrabold">
            🔁 前回→今回の変化
            <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— 2020 → 2025（国勢調査 実測 / {momoFine ? city!.area_name : pref.pref_name}）</span>
          </p>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-[11px] font-bold text-muted-foreground">人口</div>
              <div className="text-[13px] font-extrabold">{pop2020.toLocaleString()} <span className="text-muted-foreground">→</span> {c.population.toLocaleString()}</div>
              <div className="text-[11px] font-bold" style={{ color: c.pop_change_pct >= 0 ? "#16A34A" : "#DC2626" }}>{fmtNum(popDelta)} 人（{fmtPct(c.pop_change_pct)}）／ 全国 {fmtPct(c.national_pop_change_pct)}・差 {gap >= 0 ? "+" : ""}{gap.toFixed(1)}pt</div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-[11px] font-bold text-muted-foreground">世帯</div>
              <div className="text-[13px] font-extrabold">{hh2020.toLocaleString()} <span className="text-muted-foreground">→</span> {c.households.toLocaleString()}</div>
              <div className="text-[11px] font-bold" style={{ color: c.hh_change_pct >= 0 ? "#16A34A" : "#DC2626" }}>{fmtNum(hhDelta)} 世帯（{fmtPct(c.hh_change_pct)}）{c.pop_change_pct < 0 && c.hh_change_pct > 0 ? "／人口減でも世帯増=単身化" : ""}</div>
            </div>
          </div>
        </div>

        {/* ── 📈 人口推移チャート（2000-2025 国勢調査6回分） ── */}
        {hasTimeseries && (
          <div className="rounded-xl border-2 px-4 py-3.5 mb-4" style={{ borderColor: "rgba(99,102,241,0.2)", backgroundColor: "rgba(99,102,241,0.03)" }}>
            <p className="text-[13px] font-extrabold text-indigo-800 dark:text-indigo-300">
              📈 人口推移と将来推計
              <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— {momoFine ? city!.area_name : pref.pref_name}・2000→2050</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
              実績（2000〜2025 国勢調査）と将来推計（社人研 2030〜2050）を1つのチャートで。変化率の加速度が投資判断の鍵。
            </p>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={tsWithProjection} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="pop"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: unknown) => `${(Number(v) / 10000).toFixed(0)}万`}
                    width={52}
                  />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: unknown) => `${Number(v).toFixed(1)}%`}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => {
                      const v = Number(value);
                      const n = String(name);
                      if (n === "人口（実績）" || n === "人口（推計）") return [`${v.toLocaleString()} 人`, n];
                      if (n === "変化率（実績）" || n === "変化率（推計）") return [`${v.toFixed(2)}%`, n];
                      if (n === "高齢化率") return [`${v.toFixed(1)}%`, n];
                      return [String(value), String(name)];
                    }}
                    labelFormatter={(label: unknown) => {
                      const y = Number(label);
                      return y <= 2025 ? `${y}年 国勢調査（実績）` : `${y}年 社人研推計`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="rate" y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                  {/* 2025年の境界線 */}
                  {hasProjection && <ReferenceLine yAxisId="pop" x={2025} stroke="#94A3B8" strokeDasharray="6 3" label={{ value: "← 実績 | 推計 →", fontSize: 9, fill: "#94A3B8", position: "top" }} />}
                  {/* 実績（2000-2025） */}
                  <Bar yAxisId="pop" dataKey="population" name="人口（実績）" fill="#6366F1" opacity={0.4} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="rate" type="monotone" dataKey="popRate" name="変化率（実績）" stroke="#DC2626" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  {/* 将来推計（2030-2050） */}
                  {hasProjection && (
                    <Bar yAxisId="pop" dataKey="populationProj" name="人口（推計）" fill="#A5B4FC" opacity={0.3} radius={[3, 3, 0, 0]} />
                  )}
                  {hasProjection && (
                    <Line yAxisId="rate" type="monotone" dataKey="popRateProj" name="変化率（推計）" stroke="#F87171" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="6 3" connectNulls />
                  )}
                  {tsWithRate.some((d) => d.agingRate != null) && (
                    <Line yAxisId="rate" type="monotone" dataKey="agingRate" name="高齢化率" stroke="#F59E0B" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 4" connectNulls />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* 加速度の解釈 */}
            {tsWithRate.length >= 3 && (() => {
              const rates = tsWithRate.filter((d) => d.popRate != null).map((d) => d.popRate!);
              if (rates.length < 2) return null;
              const latest = rates[rates.length - 1];
              const prev = rates[rates.length - 2];
              const accel = latest - prev;
              const trend = accel > 0.5 ? "改善" : accel < -0.5 ? "悪化" : "横ばい";
              const trendColor = accel > 0.5 ? "#16A34A" : accel < -0.5 ? "#DC2626" : "#CA8A04";
              return (
                <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-[12px] leading-relaxed">
                    <span className="font-bold" style={{ color: trendColor }}>トレンド: {trend}</span>
                    <span className="text-slate-600 dark:text-slate-300 ml-1">
                      — 直近5年の変化率 {latest > 0 ? "+" : ""}{latest.toFixed(2)}%（前期比 {accel > 0 ? "+" : ""}{accel.toFixed(2)}pt）。
                      {accel > 0.5
                        ? "減少が鈍化または増加に転じており、需要回復の兆し。"
                        : accel < -0.5
                          ? "減少が加速しており、中長期の需要縮小リスクが高まっている。"
                          : "変化のペースは安定しており、直近のトレンドが当面続く見通し。"}
                    </span>
                  </p>
                </div>
              );
            })()}
            <p className="text-[11px] text-muted-foreground mt-2">
              2000〜2025: <DataBadge tag="実測" /> 国勢調査確定値 ｜ 2030〜2050: <DataBadge tag="推計" /> 国立社会保障・人口問題研究所。
              {tsWithRate.some((d) => d.agingRate != null) && " 高齢化率 = 65歳以上人口 ÷ 総人口（2025年は速報のため年齢別未公表）。"}
            </p>
          </div>
        )}

        {/* ── 📊 雇用の変化とRS (2016→2021 シフトシェア分解・都道府県) ── */}
        {ssTable.length > 0 && (
          <details className="rounded-xl border px-4 py-3 mb-4 bg-card">
            <summary className="text-[13px] font-extrabold cursor-pointer select-none">
              📊 働く人が増減した理由を3つに分ける
              <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— 2016 → 2021（クリックで展開）</span>
            </summary>
            <p className="text-[11px] text-muted-foreground mt-1.5 mb-2">
              雇用の増減を「①日本全体の変化 ②この街に多い業種の変化 ③それ以外の差（＝この街の競争力）」に分解。③がプラスなら、全国平均を上回るこの街固有の強みがあります。
            </p>
            <p className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-200">
              実際の変化 <strong>{fmtNum(ssActual)} 人</strong> ＝ 日本全体 {fmtNum(ssNat)} ＋ 多い業種 {fmtNum(ssMix)} ＋ <strong>この街の競争力 {fmtNum(rs)}</strong>
            </p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                <div className="text-[11px] font-bold text-muted-foreground">RS 大分類17業種</div>
                <div className="text-lg font-black" style={{ color: rs >= 0 ? "#16A34A" : "#DC2626" }}>{fmtNum(rs)} 人</div>
                <div className="text-[11px] text-muted-foreground">牽引: {pref.top_rs_industry ?? "—"}（{fmtNum(pref.top_rs_value ?? 0)}）</div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                <div className="text-[11px] font-bold text-muted-foreground">RS 中分類95業種</div>
                <div className="text-lg font-black" style={{ color: (rsMid ?? 0) >= 0 ? "#16A34A" : "#DC2626" }}>{rsMid != null ? fmtNum(rsMid) : "—"} 人</div>
                <div className="text-[11px] text-muted-foreground">牽引: {pref.top_rs_industry_mid ?? "—"}（{fmtNum(pref.top_rs_value_mid ?? 0)}）</div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                <div className="text-[11px] font-bold text-muted-foreground">競争力の評価</div>
                <div className="text-lg font-black" style={{ color: rs >= 0 ? "#16A34A" : "#DC2626" }}>{rs >= 0 ? "全国平均超" : "全国平均未満"}</div>
                <div className="text-[11px] text-muted-foreground">雇用比 {rsShare >= 0 ? "+" : ""}{rsShare.toFixed(2)}%</div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              ※ RSがプラス＝「全国平均を上回る地域固有の競争力で雇用が純増」。将来の基盤雇用の増減を示す先行シグナル。<strong>期間は2016→2021の1期間</strong>（経済センサス）。
            </p>
          </details>
        )}

        {/* ── 🎯 このエリアのニーズ ── */}
        {needsTop.length > 0 && (
          <div className="rounded-xl border px-4 py-3.5 mb-4 bg-card">
            <p className="text-[13px] font-extrabold">
              🎯 このエリアで狙うべきニーズ（用途別）
              <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— データから導かれる投資対象</span>
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

        {/* ── 投資の根拠 × リスク（構造化: 事実→意味→出典） ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
            <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 mb-2">✓ 投資の根拠</p>
            {strengthsTop.length ? (
              strengthsTop.map((e, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{e.fact}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">{e.implication}</p>
                  <p className="text-[11px] text-muted-foreground">{e.source}</p>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-muted-foreground">際立った強みは限定的。</p>
            )}
          </div>
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 px-4 py-3">
            <p className="text-xs font-extrabold text-rose-700 dark:text-rose-400 mb-2">⚠ 留意すべきリスク</p>
            {risksTop.length ? (
              risksTop.map((e, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{e.fact}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">{e.implication}</p>
                  <p className="text-[11px] text-muted-foreground">{e.source}</p>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-muted-foreground">重大なリスクは検出されず。</p>
            )}
          </div>
        </div>

        {/* ── 🧮 指標の計算フロー (CI102の導出過程) ── */}
        <details className="rounded-xl border-2 px-4 py-3.5 mb-4" style={{ borderColor: "rgba(37,99,235,0.2)", backgroundColor: "rgba(37,99,235,0.03)" }}>
          <summary className="text-[13px] font-extrabold text-blue-800 dark:text-blue-300 cursor-pointer select-none">
            🧮 計算の根拠を確認する（CI102 計算フロー）
            <span className="ml-1 font-semibold text-muted-foreground text-[11px]">— クリックで展開</span>
          </summary>
          <p className="text-[11px] text-muted-foreground mt-1.5 mb-2.5">
            上記のスコアは以下の手順で算出しています。各ステップは米国CCIM CI102教科書に準拠した標準的な不動産市場分析手法です。
          </p>
          <div className="space-y-2.5">
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
          <p className="mt-2 text-[11px] text-muted-foreground">※ 乗数(EBM/PER)は現在の産業構造が続くと仮定した理論値。基盤雇用はLQ&gt;1産業の超過雇用の合計（中分類95業種で算出）。</p>
        </details>

        {/* ── さらに深掘りする ── */}
        <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/20 px-4 py-3 mb-3">
          <p className="text-[11px] font-bold text-blue-800 dark:text-blue-300 mb-1.5">さらに深掘りする</p>
          <div className="flex flex-wrap gap-2">
            <a href="?tab=lq" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">🏭 産業の強みを詳しく</a>
            <a href="?tab=ebm" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">📐 住宅需要をシミュレーション</a>
            <a href="?tab=shift" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">📊 競争力の分解</a>
            <a href="?tab=gap" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">🛒 小売の出店余地</a>
            <a href="?tab=realestate" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">🏠 成約価格トレンド</a>
            <a href="?tab=risk" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">⚠️ 災害リスク</a>
            <a href="?tab=trade_area" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">📍 物件の商圏分析</a>
            <a href="?tab=demographics" className="rounded border bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold hover:bg-blue-100 transition-colors">👥 人口の30年推計</a>
          </div>
        </div>

        {/* ── データの鮮度と凡例 ── */}
        <div className="rounded-xl border bg-slate-50 dark:bg-slate-900/30 px-4 py-3">
          <p className="text-[11px] font-bold text-muted-foreground mb-1.5">データの性質と鮮度</p>
          <div className="flex flex-wrap gap-3 mb-2">
            <span className="flex items-center gap-1 text-[11px]"><DataBadge tag="実測" /> 政府統計の確定値（国勢調査・経済センサス）</span>
            <span className="flex items-center gap-1 text-[11px]"><DataBadge tag="推計" /> 国立社会保障・人口問題研究所等の将来推計</span>
            <span className="flex items-center gap-1 text-[11px]"><DataBadge tag="理論" /> CI102手法に基づく算出値（LQ・EBM・PER等）</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            人口・世帯: 2025年国勢調査速報（実測）｜ 産業・雇用: 2021年経済センサス活動調査 ｜ 将来推計: 社人研2025→2035 ｜ 経済基盤: {scopeTag}（中分類95業種）で算出
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
