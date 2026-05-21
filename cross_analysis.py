"""Cross-analysis: retail gap factor vs. transaction price by prefecture."""
from __future__ import annotations

from typing import Optional

import pandas as pd
import plotly.graph_objects as go
import streamlit as st


@st.cache_data(ttl=3600, show_spinner="クロス分析データを計算中...")
def compute_cross_gap_price(cache_dir_str: str | None = None) -> pd.DataFrame:
    """Compute gap factor + median unit price + EBM for all 47 prefectures.

    Returns DataFrame with columns:
        pref_code, pref_name, aggregate_factor, median_unit_price, ebm
    """
    import map_data

    # Reuse existing map_data aggregation functions
    df_gap = map_data.compute_prefecture_retail_gap(cache_dir_str)
    df_comp = map_data.compute_prefecture_comparison(cache_dir_str)

    if df_gap.empty or df_comp.empty:
        return pd.DataFrame()

    # Merge gap factor and EBM
    df = df_gap[["pref_code", "pref_name", "aggregate_factor"]].merge(
        df_comp[["pref_code", "ebm"]],
        on="pref_code",
        how="inner",
    )

    # Get MLIT median unit prices per prefecture
    from data_sources import MlitReinfolibClient

    mlit = MlitReinfolibClient()
    prices = []
    if mlit.available:
        for pc in df["pref_code"]:
            median_price = _get_prefecture_median_price(mlit, int(pc))
            prices.append(median_price)
    else:
        prices = [None] * len(df)

    df["median_unit_price"] = prices
    # Drop rows where MLIT data is unavailable
    df = df.dropna(subset=["median_unit_price"])

    return df


def _get_prefecture_median_price(
    mlit, pref_code: int, year: int = 2024, quarter: int = 1,
) -> Optional[float]:
    """Get median unit price for a prefecture (cached by MLIT client)."""
    try:
        df_re = mlit.transaction_prices(
            year=year, quarter=quarter, pref_code=pref_code,
        )
        if df_re is not None and not df_re.empty:
            prices = pd.to_numeric(df_re.get("UnitPrice", pd.Series()), errors="coerce")
            valid = prices[prices > 0]
            if not valid.empty:
                return float(valid.median())
    except Exception:
        pass
    return None


def scatter_gap_vs_price(
    df: pd.DataFrame,
    highlight_pref_code: Optional[int] = None,
) -> go.Figure:
    """Create quadrant scatter plot: gap factor (x) vs. median unit price (y).

    Quadrants (using x=0 and y=median as thresholds):
    - Bottom-right: demand + affordable = top priority (green)
    - Top-right: demand + expensive = caution (amber)
    - Bottom-left: surplus + affordable = wait-and-see (gray)
    - Top-left: surplus + expensive = avoid (coral)
    """
    if df.empty:
        fig = go.Figure()
        fig.add_annotation(text="データなし", showarrow=False, font_size=20)
        return fig

    price_median = df["median_unit_price"].median()

    # Color by EBM
    fig = go.Figure()

    # Background quadrant annotations
    fig.add_shape(
        type="rect", x0=0, x1=df["aggregate_factor"].max() * 1.1,
        y0=0, y1=price_median,
        fillcolor="rgba(42, 157, 143, 0.08)", line_width=0, layer="below",
    )
    fig.add_shape(
        type="rect", x0=0, x1=df["aggregate_factor"].max() * 1.1,
        y0=price_median, y1=df["median_unit_price"].max() * 1.1,
        fillcolor="rgba(212, 168, 67, 0.08)", line_width=0, layer="below",
    )
    fig.add_shape(
        type="rect", x0=df["aggregate_factor"].min() * 1.1, x1=0,
        y0=0, y1=price_median,
        fillcolor="rgba(107, 114, 128, 0.08)", line_width=0, layer="below",
    )
    fig.add_shape(
        type="rect", x0=df["aggregate_factor"].min() * 1.1, x1=0,
        y0=price_median, y1=df["median_unit_price"].max() * 1.1,
        fillcolor="rgba(231, 111, 81, 0.08)", line_width=0, layer="below",
    )

    # Main scatter
    fig.add_trace(go.Scatter(
        x=df["aggregate_factor"],
        y=df["median_unit_price"],
        mode="markers+text",
        text=df["pref_name"],
        textposition="top center",
        textfont=dict(size=9),
        marker=dict(
            size=10,
            color=df["ebm"],
            colorscale="Viridis",
            colorbar=dict(title="EBM"),
            showscale=True,
        ),
        hovertemplate=(
            "<b>%{text}</b><br>"
            "漏損/余剰: %{x:.1f}<br>"
            "㎡単価: ¥%{y:,.0f}<br>"
            "EBM: %{marker.color:.2f}<extra></extra>"
        ),
    ))

    # Highlight selected area
    if highlight_pref_code is not None:
        hl = df[df["pref_code"] == highlight_pref_code]
        if not hl.empty:
            fig.add_trace(go.Scatter(
                x=hl["aggregate_factor"],
                y=hl["median_unit_price"],
                mode="markers",
                marker=dict(size=18, color="red", symbol="star", line=dict(width=2, color="white")),
                name=hl.iloc[0]["pref_name"],
                showlegend=False,
            ))

    # Reference lines
    fig.add_vline(x=0, line_dash="dash", line_color="#6B7280", line_width=1)
    fig.add_hline(y=price_median, line_dash="dash", line_color="#6B7280", line_width=1)

    # Quadrant labels
    x_max = df["aggregate_factor"].max()
    x_min = df["aggregate_factor"].min()
    y_max = df["median_unit_price"].max()
    fig.add_annotation(x=x_max * 0.6, y=price_median * 0.3,
                       text="需要あり x 安い<br>= 最優先", showarrow=False,
                       font=dict(size=12, color="#2A9D8F"), opacity=0.7)
    fig.add_annotation(x=x_max * 0.6, y=y_max * 0.85,
                       text="需要あり x 高い<br>= エントリーコスト注意", showarrow=False,
                       font=dict(size=12, color="#D4A843"), opacity=0.7)
    fig.add_annotation(x=x_min * 0.6, y=price_median * 0.3,
                       text="余剰 x 安い<br>= 様子見", showarrow=False,
                       font=dict(size=12, color="#6B7280"), opacity=0.7)
    fig.add_annotation(x=x_min * 0.6, y=y_max * 0.85,
                       text="余剰 x 高い<br>= 回避", showarrow=False,
                       font=dict(size=12, color="#E76F51"), opacity=0.7)

    fig.update_layout(
        title="小売ギャップ × 取引単価 クロス分析（都道府県別）",
        xaxis_title="小売漏損/余剰係数（+: 漏損=出店機会、-: 余剰=競争過多）",
        yaxis_title="㎡単価中央値（円）",
        height=600,
        showlegend=False,
    )

    return fig
