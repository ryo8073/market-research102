"""Mueller Real Estate Market Cycle analysis.

Derives market cycle position from MLIT quarterly transaction data.
4 quadrants: Recovery, Expansion, Hypersupply, Recession.
"""
from __future__ import annotations

from typing import Optional

import pandas as pd
import plotly.graph_objects as go
import streamlit as st


@st.cache_data(ttl=3600, show_spinner="Mueller市場サイクルを計算中...")
def compute_mueller_cycle(
    pref_code: int,
    city_code: Optional[int] = None,
    base_year: int = 2024,
    base_quarter: int = 1,
    num_quarters: int = 8,
) -> pd.DataFrame:
    """Compute price and volume changes for Mueller cycle positioning.

    Returns DataFrame: period, median_price, count, price_change_pct, volume_change_pct
    """
    from data_sources import MlitReinfolibClient

    mlit = MlitReinfolibClient()
    if not mlit.available:
        return pd.DataFrame()

    mlit_city = city_code if city_code and city_code % 1000 != 0 else None

    rows = []
    y, q = base_year, base_quarter
    for _ in range(num_quarters):
        df = mlit.transaction_prices(year=y, quarter=q, pref_code=pref_code, city_code=mlit_city)
        if df is not None and not df.empty:
            prices = pd.to_numeric(df.get("UnitPrice", pd.Series()), errors="coerce")
            valid = prices[prices > 0]
            rows.append({
                "period": f"{y}Q{q}",
                "median_price": float(valid.median()) if not valid.empty else None,
                "count": len(df),
            })
        else:
            rows.append({"period": f"{y}Q{q}", "median_price": None, "count": 0})
        q -= 1
        if q < 1:
            q = 4
            y -= 1

    df_result = pd.DataFrame(rows[::-1])
    df_result = df_result.dropna(subset=["median_price"])

    if len(df_result) >= 2:
        df_result["price_change_pct"] = df_result["median_price"].pct_change() * 100
        df_result["volume_change_pct"] = df_result["count"].pct_change() * 100
    else:
        df_result["price_change_pct"] = 0.0
        df_result["volume_change_pct"] = 0.0

    return df_result


def classify_cycle_phase(price_change: float, volume_change: float) -> str:
    """Classify Mueller cycle phase from latest quarter changes."""
    if price_change > 0 and volume_change <= 0:
        return "Recovery（回復期）"
    elif price_change > 0 and volume_change > 0:
        return "Expansion（拡大期）"
    elif price_change <= 0 and volume_change > 0:
        return "Hypersupply（供給過剰期）"
    else:
        return "Recession（後退期）"


def mueller_cycle_chart(df: pd.DataFrame, area_name: str = "") -> go.Figure:
    """Create Mueller 4-quadrant chart from quarterly data."""
    if df.empty or "price_change_pct" not in df.columns:
        fig = go.Figure()
        fig.add_annotation(text="データ不足", showarrow=False, font_size=20)
        return fig

    valid = df.dropna(subset=["price_change_pct", "volume_change_pct"])
    if len(valid) < 2:
        fig = go.Figure()
        fig.add_annotation(text="2四半期以上必要", showarrow=False, font_size=20)
        return fig

    fig = go.Figure()

    # Quadrant backgrounds
    x_range = max(abs(valid["price_change_pct"].max()), abs(valid["price_change_pct"].min()), 10)
    y_range = max(abs(valid["volume_change_pct"].max()), abs(valid["volume_change_pct"].min()), 10)

    # Recovery (price up, volume down)
    fig.add_shape(type="rect", x0=0, x1=x_range*1.2, y0=-y_range*1.2, y1=0,
                  fillcolor="rgba(42,157,143,0.1)", line_width=0, layer="below")
    # Expansion (price up, volume up)
    fig.add_shape(type="rect", x0=0, x1=x_range*1.2, y0=0, y1=y_range*1.2,
                  fillcolor="rgba(212,168,67,0.1)", line_width=0, layer="below")
    # Hypersupply (price down, volume up)
    fig.add_shape(type="rect", x0=-x_range*1.2, x1=0, y0=0, y1=y_range*1.2,
                  fillcolor="rgba(231,111,81,0.1)", line_width=0, layer="below")
    # Recession (price down, volume down)
    fig.add_shape(type="rect", x0=-x_range*1.2, x1=0, y0=-y_range*1.2, y1=0,
                  fillcolor="rgba(107,114,128,0.1)", line_width=0, layer="below")

    # Trail line
    fig.add_trace(go.Scatter(
        x=valid["price_change_pct"], y=valid["volume_change_pct"],
        mode="lines+markers+text",
        text=valid["period"],
        textposition="top center",
        textfont=dict(size=9),
        marker=dict(size=10, color=list(range(len(valid))), colorscale="Viridis"),
        line=dict(color="#1B2A4A", width=2),
        hovertemplate="<b>%{text}</b><br>価格変化: %{x:.1f}%<br>取引量変化: %{y:.1f}%<extra></extra>",
    ))

    # Latest point highlighted
    latest = valid.iloc[-1]
    fig.add_trace(go.Scatter(
        x=[latest["price_change_pct"]], y=[latest["volume_change_pct"]],
        mode="markers", marker=dict(size=16, color="red", symbol="star"),
        name="最新", showlegend=False,
    ))

    # Reference lines
    fig.add_vline(x=0, line_dash="dash", line_color="#6B7280")
    fig.add_hline(y=0, line_dash="dash", line_color="#6B7280")

    # Quadrant labels
    fig.add_annotation(x=x_range*0.6, y=-y_range*0.7, text="Recovery<br>（回復期）",
                       showarrow=False, font=dict(color="#2A9D8F", size=13))
    fig.add_annotation(x=x_range*0.6, y=y_range*0.7, text="Expansion<br>（拡大期）",
                       showarrow=False, font=dict(color="#D4A843", size=13))
    fig.add_annotation(x=-x_range*0.6, y=y_range*0.7, text="Hypersupply<br>（供給過剰）",
                       showarrow=False, font=dict(color="#E76F51", size=13))
    fig.add_annotation(x=-x_range*0.6, y=-y_range*0.7, text="Recession<br>（後退期）",
                       showarrow=False, font=dict(color="#6B7280", size=13))

    fig.update_layout(
        title=f"Mueller不動産市場サイクル — {area_name}",
        xaxis_title="㎡単価変化率（%、前四半期比）",
        yaxis_title="取引量変化率（%、前四半期比）",
        height=550,
        showlegend=False,
    )

    return fig
