"""JSIC industry -> property type demand mapping for tenant strategy.

Maps shift-share RS-positive industries to property type demands,
enabling investment decisions about what kind of property to target.
"""
from __future__ import annotations

import pandas as pd

# Property type constants
OFFICE = "オフィス"
WAREHOUSE = "倉庫・物流施設"
RETAIL = "商業施設"
RESIDENTIAL = "住宅"
FACTORY = "工場・製造施設"
MEDICAL = "医療・福祉施設"

# Primary and secondary property demands per JSIC major division.
# Order matters: first entry = primary demand.
INDUSTRY_TO_PROPERTY: dict[str, list[str]] = {
    "農業，林業": [WAREHOUSE, FACTORY],
    "漁業": [WAREHOUSE, FACTORY],
    "鉱業，採石業，砂利採取業": [FACTORY, WAREHOUSE],
    "建設業": [OFFICE, WAREHOUSE],
    "製造業": [FACTORY, WAREHOUSE],
    "電気・ガス・熱供給・水道業": [OFFICE, FACTORY],
    "情報通信業": [OFFICE],
    "運輸業，郵便業": [WAREHOUSE, OFFICE],
    "卸売業，小売業": [RETAIL, WAREHOUSE],
    "金融業，保険業": [OFFICE],
    "不動産業，物品賃貸業": [OFFICE],
    "学術研究，専門・技術サービス業": [OFFICE],
    "宿泊業，飲食サービス業": [RETAIL],
    "生活関連サービス業，娯楽業": [RETAIL],
    "教育，学習支援業": [OFFICE],
    "医療，福祉": [MEDICAL, OFFICE],
    "複合サービス事業": [OFFICE, RETAIL],
    "サービス業（他に分類されないもの）": [OFFICE, WAREHOUSE],
    "公務（他に分類されるものを除く）": [OFFICE],
}

# Icons for UI display
PROPERTY_ICONS: dict[str, str] = {
    OFFICE: "🏢",
    WAREHOUSE: "🏭",
    RETAIL: "🛒",
    RESIDENTIAL: "🏠",
    FACTORY: "⚙️",
    MEDICAL: "🏥",
}


def derive_property_demand(
    ss_df: pd.DataFrame,
    min_rs: float = 0.0,
) -> dict[str, list[dict]]:
    """Given a shift-share DataFrame, derive property type demand from RS-positive industries.

    Parameters
    ----------
    ss_df : DataFrame with columns: industry, regional_shift, actual_change
    min_rs : minimum RS value to consider (default: 0.0 = positive RS only)

    Returns
    -------
    dict mapping property type -> list of supporting industries, sorted by total RS.
    Each entry: {industry: str, rs: float, actual_change: float}
    """
    if ss_df is None or ss_df.empty:
        return {}

    # Filter to RS-positive industries
    positive = ss_df[ss_df["regional_shift"] > min_rs].copy()
    if positive.empty:
        return {}

    result: dict[str, list[dict]] = {}

    for _, row in positive.iterrows():
        industry = str(row["industry"])
        rs = float(row["regional_shift"])
        actual = float(row.get("actual_change", 0))

        # Look up property types for this industry
        property_types = INDUSTRY_TO_PROPERTY.get(industry, [])
        if not property_types:
            # Try partial matching for slight naming differences
            for key, props in INDUSTRY_TO_PROPERTY.items():
                if key in industry or industry in key:
                    property_types = props
                    break

        for ptype in property_types:
            if ptype not in result:
                result[ptype] = []
            result[ptype].append({
                "industry": industry,
                "rs": rs,
                "actual_change": actual,
            })

    # Sort each property type's list by RS descending
    for ptype in result:
        result[ptype].sort(key=lambda x: x["rs"], reverse=True)

    # Sort the result dict by total RS across supporting industries
    result = dict(sorted(
        result.items(),
        key=lambda kv: sum(i["rs"] for i in kv[1]),
        reverse=True,
    ))

    return result
