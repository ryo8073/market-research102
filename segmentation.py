"""Tapestry-style municipality segmentation using census data.

Classifies municipalities into 6 segments based on:
- Age structure (young/working/elderly ratios)
- Household size
- Industry composition (primary/secondary/tertiary)
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import pandas as pd
import streamlit as st


# Segment definitions
SEGMENTS = {
    "都市サービス集積型": {"color": "#1B2A4A", "icon": "🏢", "desc": "第3次産業比率が高く、若年〜生産年齢が多い都市部"},
    "工業基盤型": {"color": "#2A9D8F", "icon": "⚙️", "desc": "製造業・建設業が強く、生産年齢人口が安定"},
    "商業・観光型": {"color": "#D4A843", "icon": "🛒", "desc": "小売・宿泊飲食が突出、昼間人口が多い"},
    "公務・教育型": {"color": "#6B7280", "icon": "🏛️", "desc": "公務・教育・医療が主力、人口安定だが成長力弱"},
    "高齢縮小型": {"color": "#E76F51", "icon": "📉", "desc": "高齢化率が高く、第1次産業依存、人口減少"},
    "均衡型": {"color": "#9CA3AF", "icon": "⚖️", "desc": "特定の偏りがなくバランスの取れた経済構造"},
}


def _classify_municipality(
    emp_data: dict,
    total_emp: float,
    persons_per_hh: float,
) -> str:
    """Classify a single municipality into a segment."""
    if total_emp <= 0:
        return "均衡型"

    # Industry ratios
    primary = sum(emp_data.get(k, 0) for k in ["農業，林業", "漁業", "鉱業，採石業，砂利採取業"])
    secondary = sum(emp_data.get(k, 0) for k in ["製造業", "建設業"])
    tertiary_service = sum(emp_data.get(k, 0) for k in [
        "情報通信業", "金融業，保険業", "不動産業，物品賃貸業",
        "学術研究，専門・技術サービス業",
    ])
    retail_tourism = sum(emp_data.get(k, 0) for k in [
        "卸売業，小売業", "宿泊業，飲食サービス業", "生活関連サービス業，娯楽業",
    ])
    public_edu_med = sum(emp_data.get(k, 0) for k in [
        "公務（他に分類されるものを除く）", "教育，学習支援業", "医療，福祉",
    ])
    manufacturing = secondary / total_emp

    primary_ratio = primary / total_emp
    service_ratio = tertiary_service / total_emp
    retail_ratio = retail_tourism / total_emp
    public_ratio = public_edu_med / total_emp

    # Classification rules (order matters)
    if service_ratio > 0.20:
        return "都市サービス集積型"
    if manufacturing > 0.25:
        return "工業基盤型"
    if retail_ratio > 0.30:
        return "商業・観光型"
    if public_ratio > 0.35:
        return "公務・教育型"
    if primary_ratio > 0.10 or persons_per_hh < 2.0:
        return "高齢縮小型"
    return "均衡型"


@st.cache_data(ttl=3600, show_spinner="セグメンテーション計算中...")
def compute_prefecture_segmentation(
    pref_code: int,
    cache_dir_str: Optional[str] = None,
) -> pd.DataFrame:
    """Segment all municipalities within a prefecture.

    Returns DataFrame: area_code, area_name, segment, total_emp
    """
    from data.census_cache import (
        load_cached_dataset, DS_EMPLOYMENT_MAJOR, DS_POPULATION,
        get_area_employment, get_area_population,
    )

    cache_dir = Path(cache_dir_str) if cache_dir_str else Path(__file__).parent / "data" / "cache"
    df_emp = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
    df_pop = load_cached_dataset(cache_dir, DS_POPULATION.csv_name)

    if df_emp is None or df_pop is None:
        return pd.DataFrame()

    pref_prefix = f"{pref_code:02d}"
    # Get all area_codes for this prefecture
    area_codes = sorted(
        df_emp[
            (df_emp["area_code"].str.startswith(pref_prefix))
            & (~df_emp["area_code"].str.endswith("000"))
        ]["area_code"].unique()
    )

    rows = []
    for ac in area_codes:
        emp_data = get_area_employment(df_emp, ac)
        pop_data = get_area_population(df_pop, ac)
        if not emp_data:
            continue

        total_emp = sum(emp_data.values())
        population = pop_data.get("2015年（平成27年）の人口（組替）", 0) if pop_data else 0
        households = pop_data.get("世帯数", 0) if pop_data else 0
        pph = population / households if households > 0 else 2.0

        area_name_series = df_emp[df_emp["area_code"] == ac]["area_name"]
        area_name = area_name_series.iloc[0] if not area_name_series.empty else ac

        segment = _classify_municipality(emp_data, total_emp, pph)

        rows.append({
            "area_code": ac,
            "area_name": area_name,
            "segment": segment,
            "total_emp": int(total_emp),
            "population": int(population),
        })

    return pd.DataFrame(rows)
