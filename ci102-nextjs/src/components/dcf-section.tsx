"use client";

/**
 * 🏢 DCF (Proformer) 統合UI セクション。
 *
 * Decision Hub 内で物件IDから DCF (Discounted Cash Flow) 分析を取得し、
 * マクロ (地域経済データ) × ミクロ (物件収益) を並置評価。
 *
 * Proformer API: https://api.proformer.ai/api/v1/exports/{external_id}
 * 環境変数: PROFORMER_API_KEY (.env or Vercel)
 *
 * 教育的価値:
 *   - 地域の経済基盤が強くても、物件の DSCR が1未満ならローン破綻リスク
 *   - 逆に、地域は弱くても Cap rate が突出していれば成長狙いの投資先
 *   - 「マクロ×ミクロ」統合判断こそ CCIM CI102 の真髄
 */
import { useState } from "react";

interface ProformerExport {
  memo?: string;
  property?: {
    name?: string;
    type?: string;
    location?: string;
    acquisition_price?: number;
  };
  income?: {
    gpi_annual?: number;
    egi_annual?: number;
    vacancy_rate?: number;
  };
  noi_annual?: number;
  financing?: {
    loan_amount?: number;
    ltv?: number;
    interest_rate?: number;
    term_years?: number;
    dscr?: number;
  };
  investment_performance?: {
    cap_rate?: number;
    irr?: number;
    npv?: number;
  };
  disclaimer?: string;
}

interface Props {
  /** 地域経済の総合スコア (0-100、Decision Hub の best.totalScore) */
  macroScore: number;
  /** 物件タイプ (Decision Hub の best.label) */
  macroPropertyType: string;
}

export function DcfSection({ macroScore, macroPropertyType }: Props) {
  const [externalId, setExternalId] = useState("");
  const [data, setData] = useState<ProformerExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!externalId.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(`/api/proformer?externalId=${encodeURIComponent(externalId.trim())}`);
      const json = await r.json();
      if (!r.ok || json.error) {
        setError(json.error || `HTTP ${r.status}`);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border-2 border-purple-300 bg-purple-50 p-4 space-y-3" data-print-block>
      <div>
        <p className="text-sm font-semibold">🏢 DCF 分析 — 物件収益 (Proformer API 連携)</p>
        <p className="text-xs text-slate-600 mt-1">
          物件IDを入力すると、Cap rate / NOI / DSCR / IRR / NPV を取得します。
          地域経済 (マクロ) と物件収益 (ミクロ) を並置することで <strong>CI102 教科書の「マクロ×ミクロ統合判断」</strong>が完成します。
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fetchData(); }}
          placeholder="Proformer 物件ID (external_id)"
          className="flex-1 rounded border px-3 py-1.5 text-sm font-mono"
        />
        <button
          onClick={fetchData}
          disabled={loading || !externalId.trim()}
          className="px-4 py-1.5 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 disabled:bg-slate-300"
        >
          {loading ? "取得中..." : "DCF取得"}
        </button>
      </div>

      {error && (
        <div className="rounded bg-rose-50 border border-rose-200 text-rose-900 text-xs p-2">
          {error}
          <p className="text-[11px] mt-1">
            ※ PROFORMER_API_KEY 環境変数が未設定の場合、本機能は利用できません。
          </p>
        </div>
      )}

      {data && (
        <DcfResult data={data} macroScore={macroScore} macroPropertyType={macroPropertyType} />
      )}

      {!data && !error && !loading && (
        <p className="text-[11px] text-slate-500">
          Proformer の物件分析が登録済みの場合のみ機能します。物件IDは Proformer 側で発行された
          external_id を入力してください。
        </p>
      )}
    </div>
  );
}

function DcfResult({
  data,
  macroScore,
  macroPropertyType,
}: {
  data: ProformerExport;
  macroScore: number;
  macroPropertyType: string;
}) {
  const perf = data.investment_performance || {};
  const fin = data.financing || {};
  const inc = data.income || {};
  const prop = data.property || {};

  // ミクロ評価: DSCR / IRR / Cap rate から物件単独スコアを算出
  const capRate = perf.cap_rate || 0;
  const irr = perf.irr || 0;
  const dscr = fin.dscr || 0;

  const microScore = computeMicroScore(capRate, irr, dscr);
  const integratedVerdict = integrateVerdict(macroScore, microScore);

  return (
    <div className="space-y-3">
      {/* 物件サマリ */}
      <div className="rounded bg-white border p-2.5">
        <p className="text-xs font-medium">{prop.name || "(物件名なし)"}</p>
        <p className="text-[11px] text-slate-500">
          {prop.type} / {prop.location}
          {prop.acquisition_price ? ` / 取得価格 ¥${(prop.acquisition_price / 1e8).toFixed(2)}億` : ""}
        </p>
      </div>

      {/* 主要KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard
          label="Cap Rate"
          value={`${(capRate * 100).toFixed(2)}%`}
          benchmark={capRate >= 0.06 ? "good" : capRate >= 0.04 ? "ok" : "low"}
          hint="NOI ÷ 取得価格。高いほど即時収益力◎"
        />
        <KpiCard
          label="NOI (年)"
          value={`¥${((data.noi_annual ?? 0) / 1e6).toFixed(1)}M`}
          hint="Net Operating Income"
        />
        <KpiCard
          label="DSCR"
          value={dscr.toFixed(2)}
          benchmark={dscr >= 1.3 ? "good" : dscr >= 1.0 ? "ok" : "low"}
          hint="≥1.3で安全、<1.0でローン破綻リスク"
        />
        <KpiCard
          label="LTV"
          value={`${((fin.ltv ?? 0) * 100).toFixed(0)}%`}
          benchmark={(fin.ltv ?? 0) <= 0.7 ? "good" : (fin.ltv ?? 0) <= 0.85 ? "ok" : "low"}
          hint="Loan-to-Value。低いほど安全"
        />
        <KpiCard
          label="IRR"
          value={`${(irr * 100).toFixed(1)}%`}
          benchmark={irr >= 0.10 ? "good" : irr >= 0.06 ? "ok" : "low"}
          hint="保有期間中の年率リターン"
        />
        <KpiCard
          label="NPV"
          value={`¥${((perf.npv ?? 0) / 1e6).toFixed(1)}M`}
          benchmark={(perf.npv ?? 0) > 0 ? "good" : "low"}
          hint=">0で割引現在価値プラス"
        />
        <KpiCard
          label="空室率"
          value={`${((inc.vacancy_rate ?? 0) * 100).toFixed(1)}%`}
          hint="EGI ÷ GPI の差分"
        />
        <KpiCard
          label="融資条件"
          value={`${((fin.interest_rate ?? 0) * 100).toFixed(2)}% / ${fin.term_years ?? 0}年`}
          hint="金利 / 償還期間"
        />
      </div>

      {/* マクロ×ミクロ統合評価 */}
      <div className="rounded border-2 border-purple-400 bg-white p-3">
        <p className="text-xs font-semibold mb-2">🎯 マクロ×ミクロ統合評価 (CI102 教科書の本領)</p>
        <div className="grid md:grid-cols-3 gap-2 text-xs">
          <div className="rounded bg-blue-50 p-2">
            <p className="text-[11px] text-slate-500">マクロ (地域経済)</p>
            <p className="text-lg font-bold">{macroScore.toFixed(0)} / 100</p>
            <p className="text-[11px] text-slate-600">最適: {macroPropertyType}</p>
          </div>
          <div className="rounded bg-purple-50 p-2">
            <p className="text-[11px] text-slate-500">ミクロ (物件収益)</p>
            <p className="text-lg font-bold">{microScore.toFixed(0)} / 100</p>
            <p className="text-[11px] text-slate-600">Cap+DSCR+IRRから算出</p>
          </div>
          <div className="rounded p-2" style={{ backgroundColor: integratedVerdict.bg }}>
            <p className="text-[11px] text-slate-500">統合判定</p>
            <p className="text-lg font-bold" style={{ color: integratedVerdict.color }}>
              {integratedVerdict.label}
            </p>
            <p className="text-[11px] text-slate-600">{integratedVerdict.note}</p>
          </div>
        </div>
      </div>

      {data.memo && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-600">Proformer 物件メモ</summary>
          <pre className="mt-1 p-2 bg-white border rounded whitespace-pre-wrap text-[11px]">{data.memo}</pre>
        </details>
      )}

      {data.disclaimer && (
        <p className="text-[11px] text-slate-500 italic">{data.disclaimer}</p>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  benchmark,
  hint,
}: {
  label: string;
  value: string;
  benchmark?: "good" | "ok" | "low";
  hint?: string;
}) {
  const color =
    benchmark === "good" ? "border-emerald-300 bg-emerald-50" :
    benchmark === "low" ? "border-rose-300 bg-rose-50" :
    benchmark === "ok" ? "border-amber-300 bg-amber-50" :
    "border-slate-200 bg-white";
  return (
    <div className={`rounded border p-2 ${color}`} title={hint}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-base font-bold">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function computeMicroScore(capRate: number, irr: number, dscr: number): number {
  // Cap rate (0-40点): 4%→0, 8%→40
  const capScore = Math.max(0, Math.min(40, (capRate - 0.04) * 1000));
  // IRR (0-30点): 5%→0, 12%→30
  const irrScore = Math.max(0, Math.min(30, (irr - 0.05) * 428));
  // DSCR (0-30点): 1.0→0, 1.5→30
  const dscrScore = Math.max(0, Math.min(30, (dscr - 1.0) * 60));
  return capScore + irrScore + dscrScore;
}

function integrateVerdict(macro: number, micro: number): { label: string; color: string; bg: string; note: string } {
  const avg = (macro + micro) / 2;
  if (macro >= 70 && micro >= 70) {
    return { label: "🌟 強推奨", color: "#047857", bg: "#d1fae5", note: "マクロ・ミクロ共に強い" };
  }
  if (macro >= 50 && micro >= 50) {
    return { label: "👍 推奨", color: "#059669", bg: "#ecfdf5", note: "両軸でバランス良好" };
  }
  if (macro >= 60 && micro < 50) {
    return { label: "⚠ マクロ良・ミクロ要改善", color: "#d97706", bg: "#fef3c7", note: "地域は良いが物件収益が弱い → 価格交渉余地" };
  }
  if (macro < 50 && micro >= 60) {
    return { label: "⚠ ミクロ良・マクロ要注意", color: "#d97706", bg: "#fef3c7", note: "物件単独は良いが地域衰退リスク" };
  }
  if (avg < 40) {
    return { label: "🚫 回避", color: "#b91c1c", bg: "#fee2e2", note: "マクロ・ミクロ共に弱い" };
  }
  return { label: "🔍 詳細精査", color: "#0891b2", bg: "#cffafe", note: "中間域 — 個別要因の精査が必要" };
}
