/**
 * JSIC industry -> property type demand mapping for tenant strategy.
 */

export const PROPERTY_TYPES = {
  OFFICE: "オフィス",
  WAREHOUSE: "倉庫・物流施設",
  RETAIL: "商業施設",
  RESIDENTIAL: "住宅",
  FACTORY: "工場・製造施設",
  MEDICAL: "医療・福祉施設",
} as const;

export type PropertyType = (typeof PROPERTY_TYPES)[keyof typeof PROPERTY_TYPES];

export const INDUSTRY_TO_PROPERTY: Record<string, PropertyType[]> = {
  "農業，林業": [PROPERTY_TYPES.WAREHOUSE, PROPERTY_TYPES.FACTORY],
  "漁業": [PROPERTY_TYPES.WAREHOUSE, PROPERTY_TYPES.FACTORY],
  "鉱業，採石業，砂利採取業": [PROPERTY_TYPES.FACTORY, PROPERTY_TYPES.WAREHOUSE],
  "建設業": [PROPERTY_TYPES.OFFICE, PROPERTY_TYPES.WAREHOUSE],
  "製造業": [PROPERTY_TYPES.FACTORY, PROPERTY_TYPES.WAREHOUSE],
  "電気・ガス・熱供給・水道業": [PROPERTY_TYPES.OFFICE, PROPERTY_TYPES.FACTORY],
  "情報通信業": [PROPERTY_TYPES.OFFICE],
  "運輸業，郵便業": [PROPERTY_TYPES.WAREHOUSE, PROPERTY_TYPES.OFFICE],
  "卸売業，小売業": [PROPERTY_TYPES.RETAIL, PROPERTY_TYPES.WAREHOUSE],
  "金融業，保険業": [PROPERTY_TYPES.OFFICE],
  "不動産業，物品賃貸業": [PROPERTY_TYPES.OFFICE],
  "学術研究，専門・技術サービス業": [PROPERTY_TYPES.OFFICE],
  "宿泊業，飲食サービス業": [PROPERTY_TYPES.RETAIL],
  "生活関連サービス業，娯楽業": [PROPERTY_TYPES.RETAIL],
  "教育，学習支援業": [PROPERTY_TYPES.OFFICE],
  "医療，福祉": [PROPERTY_TYPES.MEDICAL, PROPERTY_TYPES.OFFICE],
  "複合サービス事業": [PROPERTY_TYPES.OFFICE, PROPERTY_TYPES.RETAIL],
  "サービス業（他に分類されないもの）": [PROPERTY_TYPES.OFFICE, PROPERTY_TYPES.WAREHOUSE],
  "公務（他に分類されるものを除く）": [PROPERTY_TYPES.OFFICE],
};

export const PROPERTY_ICONS: Record<string, string> = {
  [PROPERTY_TYPES.OFFICE]: "🏢",
  [PROPERTY_TYPES.WAREHOUSE]: "🏭",
  [PROPERTY_TYPES.RETAIL]: "🛒",
  [PROPERTY_TYPES.RESIDENTIAL]: "🏠",
  [PROPERTY_TYPES.FACTORY]: "⚙️",
  [PROPERTY_TYPES.MEDICAL]: "🏥",
};

export interface PropertyDemand {
  industry: string;
  rs: number;
  actualChange: number;
}

export function derivePropertyDemand(
  shiftShareResults: Array<{ industry: string; regional_shift: number; actual_change: number }>,
  minRs: number = 0,
): Record<string, PropertyDemand[]> {
  const positive = shiftShareResults.filter((r) => r.regional_shift > minRs);
  if (positive.length === 0) return {};

  const result: Record<string, PropertyDemand[]> = {};

  for (const row of positive) {
    let propertyTypes = INDUSTRY_TO_PROPERTY[row.industry];
    if (!propertyTypes) {
      // Partial match
      for (const [key, props] of Object.entries(INDUSTRY_TO_PROPERTY)) {
        if (key.includes(row.industry) || row.industry.includes(key)) {
          propertyTypes = props;
          break;
        }
      }
    }
    if (!propertyTypes) continue;

    for (const ptype of propertyTypes) {
      if (!result[ptype]) result[ptype] = [];
      result[ptype].push({
        industry: row.industry,
        rs: row.regional_shift,
        actualChange: row.actual_change,
      });
    }
  }

  // Sort each list by RS descending
  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => b.rs - a.rs);
  }

  // Sort result by total RS
  const sorted = Object.entries(result).sort(
    ([, a], [, b]) =>
      b.reduce((s, i) => s + i.rs, 0) - a.reduce((s, i) => s + i.rs, 0),
  );

  return Object.fromEntries(sorted);
}
