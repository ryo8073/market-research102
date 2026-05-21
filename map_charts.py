"""Plotly choropleth 地図チャート生成（都道府県別）。"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

_GEOJSON_PATH = Path(__file__).parent / "data" / "japan_prefectures.geojson"
_geojson_cache: dict | None = None


def load_geojson() -> dict:
    """GeoJSON を読み込み（キャッシュ付き）。"""
    global _geojson_cache
    if _geojson_cache is None:
        with open(_GEOJSON_PATH, encoding="utf-8") as f:
            _geojson_cache = json.load(f)
    return _geojson_cache


_MAP_COMMON = dict(
    featureidkey="properties.pref_code",
    map_style="open-street-map",
    center={"lat": 36.5, "lon": 138.0},
    zoom=4,
    opacity=0.7,
)


# ---------------------------------------------------------------------------
# 1. 産業集積マップ（特定産業のLQ）
# ---------------------------------------------------------------------------

def choropleth_industry_lq(df: pd.DataFrame) -> go.Figure:
    """特定産業のLQ値を都道府県別にコロプレス表示。

    df columns: pref_code, pref_name, lq, local_emp, basic_emp
    """
    geojson = load_geojson()
    fig = px.choropleth_map(
        df,
        geojson=geojson,
        locations="pref_code",
        color="lq",
        hover_name="pref_name",
        hover_data={"lq": ":.3f", "local_emp": ":,.0f", "basic_emp": ":,.0f", "pref_code": False},
        color_continuous_scale=["#2166ac", "#f7f7f7", "#b2182b"],
        color_continuous_midpoint=1.0,
        range_color=[0.0, max(2.0, df["lq"].max())],
        labels={"lq": "LQ", "local_emp": "従業者数", "basic_emp": "基盤雇用"},
        **_MAP_COMMON,
    )
    fig.update_layout(height=600, margin={"r": 0, "t": 30, "l": 0, "b": 0})
    return fig


def choropleth_lq_summary(df: pd.DataFrame) -> go.Figure:
    """基盤雇用比率を都道府県別にコロプレス表示。

    df columns: pref_code, pref_name, basic_ratio, num_basic, max_lq_industry
    """
    geojson = load_geojson()
    fig = px.choropleth_map(
        df,
        geojson=geojson,
        locations="pref_code",
        color="basic_ratio",
        hover_name="pref_name",
        hover_data={
            "basic_ratio": ":.1f",
            "num_basic": True,
            "max_lq_industry": True,
            "pref_code": False,
        },
        color_continuous_scale="YlOrRd",
        labels={
            "basic_ratio": "基盤雇用比率(%)",
            "num_basic": "基盤産業数",
            "max_lq_industry": "最大LQ産業",
        },
        **_MAP_COMMON,
    )
    fig.update_layout(height=600, margin={"r": 0, "t": 30, "l": 0, "b": 0})
    return fig


# ---------------------------------------------------------------------------
# 2. シフトシェア RS マップ
# ---------------------------------------------------------------------------

def choropleth_shift_share(df: pd.DataFrame) -> go.Figure:
    """地域シフト(RS)合計を都道府県別にコロプレス表示。

    df columns: pref_code, pref_name, total_rs, top_rs_industry
    """
    geojson = load_geojson()
    fig = px.choropleth_map(
        df,
        geojson=geojson,
        locations="pref_code",
        color="total_rs",
        hover_name="pref_name",
        hover_data={
            "total_rs": ":+,.0f",
            "total_actual_change": ":+,.0f",
            "top_rs_industry": True,
            "pref_code": False,
        },
        color_continuous_scale=["#d73027", "#f7f7f7", "#1a9850"],
        color_continuous_midpoint=0,
        labels={
            "total_rs": "地域シフト合計(RS)",
            "total_actual_change": "雇用変動合計",
            "top_rs_industry": "最大RS産業",
        },
        **_MAP_COMMON,
    )
    fig.update_layout(height=600, margin={"r": 0, "t": 30, "l": 0, "b": 0})
    return fig


# ---------------------------------------------------------------------------
# 3. 小売ギャップマップ
# ---------------------------------------------------------------------------

def choropleth_retail_gap(df: pd.DataFrame) -> go.Figure:
    """漏損/余剰係数を都道府県別にコロプレス表示。

    df columns: pref_code, pref_name, aggregate_factor, num_leakage, num_surplus
    """
    geojson = load_geojson()
    fig = px.choropleth_map(
        df,
        geojson=geojson,
        locations="pref_code",
        color="aggregate_factor",
        hover_name="pref_name",
        hover_data={
            "aggregate_factor": ":+.1f",
            "num_leakage": True,
            "num_surplus": True,
            "pref_code": False,
        },
        color_continuous_scale=["#d62728", "#f7f7f7", "#2ca02c"],
        color_continuous_midpoint=0,
        labels={
            "aggregate_factor": "漏損/余剰係数",
            "num_leakage": "漏損セクター数",
            "num_surplus": "余剰セクター数",
        },
        **_MAP_COMMON,
    )
    fig.update_layout(height=600, margin={"r": 0, "t": 30, "l": 0, "b": 0})
    return fig


# ---------------------------------------------------------------------------
# 4. 都道府県比較（レーダーチャート）
# ---------------------------------------------------------------------------

def comparison_radar(df: pd.DataFrame, selected_prefs: list[int]) -> go.Figure:
    """選択された都道府県をレーダーチャートで比較。

    df columns: pref_code, pref_name, ebm, per, basic_ratio + others
    """
    subset = df[df["pref_code"].isin(selected_prefs)]
    if subset.empty:
        return go.Figure()

    # 正規化（各指標を0-1にスケール）
    metrics = ["ebm", "per", "basic_ratio"]
    labels = ["経済基盤乗数(EBM)", "人口雇用比率(PER)", "基盤雇用比率(%)"]

    fig = go.Figure()
    for _, row in subset.iterrows():
        values = []
        for m in metrics:
            col_min = df[m].min()
            col_max = df[m].max()
            if col_max > col_min:
                values.append((row[m] - col_min) / (col_max - col_min))
            else:
                values.append(0.5)
        # Close the radar
        values.append(values[0])
        fig.add_trace(go.Scatterpolar(
            r=values,
            theta=labels + [labels[0]],
            name=row["pref_name"],
            fill="toself",
            opacity=0.6,
        ))

    fig.update_layout(
        polar=dict(radialaxis=dict(visible=True, range=[0, 1])),
        height=500,
        showlegend=True,
    )
    return fig


def comparison_bar(df: pd.DataFrame, selected_prefs: list[int]) -> go.Figure:
    """選択された都道府県を棒グラフで比較。"""
    subset = df[df["pref_code"].isin(selected_prefs)].copy()
    if subset.empty:
        return go.Figure()

    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="人口(万人)",
        x=subset["pref_name"],
        y=subset["population"] / 10000,
    ))
    fig.add_trace(go.Bar(
        name="総従業者(万人)",
        x=subset["pref_name"],
        y=subset["total_emp"] / 10000,
    ))
    fig.add_trace(go.Bar(
        name="基盤雇用(万人)",
        x=subset["pref_name"],
        y=subset["basic_emp"] / 10000,
    ))
    fig.update_layout(
        barmode="group",
        height=450,
        yaxis_title="万人",
    )
    return fig
