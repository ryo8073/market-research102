/**
 * データバージョンの一元管理 (TS側)。
 *
 * Python側 `data/data_versions.py` のミラー。両者を同時に更新すること。
 *
 * 2026年経済センサス・2025年国勢調査の公表時に、本ファイルの定数のみ
 * 変更すれば、UI/AI プロンプト/Learn ページに反映される。
 *
 * 差替手順は docs/DATA_MIGRATION_2026.md 参照。
 */

export interface CensusVersion {
  surveyYear: number;
  surveyMonth: number;
  publicationYear: number;
  labelShort: string;       // 例: "2021年"
  labelFull: string;        // 例: "経済センサス活動調査 2021年6月"
}

/** 現行版 (2021年実施・2023年公表) */
export const ECONOMIC_CENSUS_CURRENT: CensusVersion = {
  surveyYear: 2021,
  surveyMonth: 6,
  publicationYear: 2023,
  labelShort: "2021年",
  labelFull: "経済センサス活動調査 2021年6月",
};

/** 前回版 (シフトシェア t0) */
export const ECONOMIC_CENSUS_PREVIOUS: CensusVersion = {
  surveyYear: 2016,
  surveyMonth: 6,
  publicationYear: 2018,
  labelShort: "2016年",
  labelFull: "経済センサス活動調査 2016年6月",
};

/** 次回版予定 (未確定) */
export const ECONOMIC_CENSUS_NEXT_PLAN = {
  surveyYear: 2026,
  surveyMonth: 6,
  publicationYearEstimate: 2028,
  labelShort: "2026年 (公表予定)",
  monitoringUrl: "https://www.e-stat.go.jp/stat-search?page=1&toukei=00200553",
} as const;

/** 国勢調査現行版 (2025年 人口速報集計, 2026-05-29公表) */
export const POPULATION_CENSUS_CURRENT = {
  surveyYear: 2025,
  labelShort: "2025年",
  labelFull: "国勢調査 2025年10月 (人口速報集計)",
  popReferenceYear: 2025,  // 実測人口 (組替値ではない)
} as const;

/** 前回版 (2020国勢調査 = 2015組替人口) */
export const POPULATION_CENSUS_PREVIOUS = {
  surveyYear: 2020,
  labelShort: "2020年",
  labelFull: "国勢調査 2020年10月 (人口は2015年組替値)",
  popReferenceYear: 2015,
} as const;

/** 次回: 2025確定値 (2027年頃) */
export const POPULATION_CENSUS_NEXT_PLAN = {
  surveyYear: 2025,
  publicationYearEstimate: 2027,
  labelShort: "2025年 確定値 (公表予定)",
  monitoringUrl: "https://www.e-stat.go.jp/stat-search?page=1&toukei=00200521",
} as const;

// ============================================================================
// ヘルパー
// ============================================================================

/** 営業UI用「データ時点」ラベル */
export function censusDataVintageLabel(): string {
  return `経済センサス ${ECONOMIC_CENSUS_CURRENT.labelShort} / 国勢調査 ${POPULATION_CENSUS_CURRENT.labelShort}`;
}

/** シフトシェア期間ラベル: 例『2016→2021年』 */
export function shiftSharePeriodLabel(): string {
  return `${ECONOMIC_CENSUS_PREVIOUS.surveyYear}→${ECONOMIC_CENSUS_CURRENT.surveyYear}年`;
}

/** 現行データが何年前か */
export function dataAgeYears(): number {
  return new Date().getFullYear() - ECONOMIC_CENSUS_CURRENT.surveyYear;
}

/** 次回公表予定年 */
export function nextCensusEstimatedYear(): number {
  return ECONOMIC_CENSUS_NEXT_PLAN.publicationYearEstimate;
}

/**
 * データが古いかどうか (5年以上経過したら警告)
 * 2026年経済センサス公表 (2028年頃見込み) までは false、それ以降 true。
 */
export function isDataStale(): boolean {
  return dataAgeYears() >= 5;
}

/**
 * 現行データの鮮度ステータス。UI バナーで色分け表示するため。
 *
 *   fresh:   〜3年以内 (緑)
 *   aging:   3-5年    (黄)
 *   stale:   5年以上  (赤、次版公表を強く促す)
 */
export function dataFreshnessStatus(): "fresh" | "aging" | "stale" {
  const age = dataAgeYears();
  if (age < 3) return "fresh";
  if (age < 5) return "aging";
  return "stale";
}
