"use client";

/**
 * データ鮮度バッジ — 経済センサス・国勢調査のバージョンを表示。
 *
 * `data-versions.ts` の `dataFreshnessStatus()` で色分け:
 *   fresh  (緑) — 3年以内のデータ
 *   aging  (黄) — 3-5年経過
 *   stale  (赤) — 5年以上経過 (次回経済センサス公表を強く促す)
 *
 * 営業現場で「このデータいつのもの？」と聞かれた際に即答できるよう
 * フッターと AI レポートヘッダに表示する。
 */
import {
  ECONOMIC_CENSUS_CURRENT,
  ECONOMIC_CENSUS_NEXT_PLAN,
  POPULATION_CENSUS_CURRENT,
  dataAgeYears,
  dataFreshnessStatus,
  nextCensusEstimatedYear,
} from "@/lib/data-versions";

interface Props {
  /** "compact" は短い1行表示、"full" は詳細ツールチップ付き */
  variant?: "compact" | "full";
  className?: string;
}

export function DataVintageBadge({ variant = "compact", className = "" }: Props) {
  const status = dataFreshnessStatus();
  const age = dataAgeYears();
  const nextYear = nextCensusEstimatedYear();

  const colorClass =
    status === "fresh" ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
    status === "aging" ? "bg-amber-100 text-amber-800 border-amber-300" :
    "bg-rose-100 text-rose-800 border-rose-300";

  const icon = status === "fresh" ? "🟢" : status === "aging" ? "🟡" : "🔴";
  const statusLabel =
    status === "fresh" ? "最新" :
    status === "aging" ? "やや経過" :
    "古い (次回更新待ち)";

  if (variant === "compact") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${colorClass} ${className}`}
        title={`経済センサス ${ECONOMIC_CENSUS_CURRENT.labelShort} (${age}年前のデータ) / 国勢調査 ${POPULATION_CENSUS_CURRENT.labelShort}\n次回経済センサス結果公表予定: ${nextYear}年頃`}
      >
        {icon} データ時点: 経済センサス {ECONOMIC_CENSUS_CURRENT.labelShort}
      </span>
    );
  }

  return (
    <details className={`rounded-lg border ${colorClass} p-2 text-xs ${className}`}>
      <summary className="cursor-pointer flex items-center gap-2">
        <span>{icon}</span>
        <strong>データ鮮度: {statusLabel}</strong>
        <span className="text-xs">(経済センサス{ECONOMIC_CENSUS_CURRENT.labelShort}・{age}年経過)</span>
      </summary>
      <div className="mt-2 space-y-1">
        <p>
          <strong>経済基盤分析 (LQ/EBM/シフトシェア)</strong>: {ECONOMIC_CENSUS_CURRENT.labelFull}
        </p>
        <p>
          <strong>人口・住宅需要 (PER)</strong>: {POPULATION_CENSUS_CURRENT.labelFull}
        </p>
        <p className="mt-1">
          <strong>次回更新予定</strong>: 経済センサス 2026年6月実施 → <strong>{nextYear}年頃</strong>結果公表見込み。
          公表後、本ツールは <a href={ECONOMIC_CENSUS_NEXT_PLAN.monitoringUrl} target="_blank" rel="noreferrer" className="underline">e-Stat 公式</a> から新データを取得して全指標を再計算します。
        </p>
        {status === "stale" && (
          <p className="mt-1 font-semibold">
            ⚠️ 現データは 5年以上経過しています。投資判断は最新の市況・現地確認を併用してください。
          </p>
        )}
      </div>
    </details>
  );
}
