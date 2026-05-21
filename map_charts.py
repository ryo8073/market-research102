"""Plotly choropleth 地図チャート生成（都道府県別）。"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

_GEOJSON_PATH = Path(__file__).parent / "data" / "japan_prefectures.geojson"

# 都道府県庁所在地の緯度・経度（市区町村マップの中心座標に使用）
_PREF_CENTER: dict[int, tuple[float, float]] = {
    1: (43.06, 141.35), 2: (40.82, 140.74), 3: (39.70, 141.15),
    4: (38.27, 140.87), 5: (39.72, 140.10), 6: (38.24, 140.33),
    7: (37.75, 140.47), 8: (36.34, 140.45), 9: (36.57, 139.88),
    10: (36.39, 139.06), 11: (35.86, 139.65), 12: (35.61, 140.12),
    13: (35.69, 139.69), 14: (35.45, 139.64), 15: (37.90, 139.02),
    16: (36.70, 137.21), 17: (36.59, 136.63), 18: (36.07, 136.22),
    19: (35.66, 138.57), 20: (36.24, 138.18), 21: (35.39, 136.72),
    22: (34.98, 138.38), 23: (35.18, 136.91), 24: (34.73, 136.51),
    25: (35.00, 135.87), 26: (35.02, 135.76), 27: (34.69, 135.52),
    28: (34.69, 135.18), 29: (34.69, 135.83), 30: (34.23, 135.17),
    31: (35.50, 134.24), 32: (35.47, 133.05), 33: (34.66, 133.93),
    34: (34.40, 132.46), 35: (34.19, 131.47), 36: (34.07, 134.56),
    37: (34.34, 134.04), 38: (33.84, 132.77), 39: (33.56, 133.53),
    40: (33.61, 130.42), 41: (33.25, 130.30), 42: (32.74, 129.87),
    43: (32.79, 130.74), 44: (33.24, 131.61), 45: (31.91, 131.42),
    46: (31.56, 130.56), 47: (26.34, 127.80),
}


def get_pref_center(pref_code: int) -> tuple[float, float]:
    """都道府県の中心座標 (lat, lon) を返す。"""
    return _PREF_CENTER.get(pref_code, (36.5, 138.0))
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


# ---------------------------------------------------------------------------
# 5. 県内市区町村マップ
# ---------------------------------------------------------------------------

def choropleth_municipality_lq(
    df: pd.DataFrame, geojson: dict, center_lat: float, center_lon: float,
) -> go.Figure:
    """市区町村別の基盤雇用比率コロプレス。"""
    fig = px.choropleth_map(
        df,
        geojson=geojson,
        locations="area_code",
        featureidkey="properties.N03_007",
        color="basic_ratio",
        hover_name="area_name",
        hover_data={
            "basic_ratio": ":.1f",
            "num_basic": True,
            "max_lq_industry": True,
            "area_code": False,
        },
        color_continuous_scale="YlOrRd",
        labels={
            "basic_ratio": "基盤雇用比率(%)",
            "num_basic": "基盤産業数",
            "max_lq_industry": "最大LQ産業",
        },
        map_style="open-street-map",
        center={"lat": center_lat, "lon": center_lon},
        zoom=8,
        opacity=0.7,
    )
    fig.update_layout(height=600, margin={"r": 0, "t": 30, "l": 0, "b": 0})
    return fig


def choropleth_municipality_industry_lq(
    df: pd.DataFrame, geojson: dict,
    center_lat: float, center_lon: float, industry_name: str,
) -> go.Figure:
    """市区町村別の特定産業LQコロプレス。"""
    fig = px.choropleth_map(
        df,
        geojson=geojson,
        locations="area_code",
        featureidkey="properties.N03_007",
        color="lq",
        hover_name="area_name",
        hover_data={"lq": ":.3f", "local_emp": ":,.0f", "basic_emp": ":,.0f", "area_code": False},
        color_continuous_scale=["#2166ac", "#f7f7f7", "#b2182b"],
        color_continuous_midpoint=1.0,
        range_color=[0.0, max(2.0, df["lq"].max())],
        labels={"lq": "LQ", "local_emp": "従業者数", "basic_emp": "基盤雇用"},
        map_style="open-street-map",
        center={"lat": center_lat, "lon": center_lon},
        zoom=8,
        opacity=0.7,
    )
    fig.update_layout(
        height=600,
        margin={"r": 0, "t": 30, "l": 0, "b": 0},
        title=f"{industry_name} LQ（市区町村別）",
    )
    return fig
