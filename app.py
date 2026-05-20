"""CCIM CI102 準拠 不動産市場分析アプリ（Streamlit MVP）。

実行:
    streamlit run app.py
"""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

import sample_data
from calculator import (
    economic_base_multiplier,
    forecast_housing_units,
    forecast_population_change,
    forecast_total_employment_change,
    gap_analysis_table,
    lq_table,
    population_employment_ratio,
    shift_share_table,
    total_basic_employment,
)
from data_sources import MarketDataAccessor


st.set_page_config(
    page_title="CCIM CI102 市場分析 - 日本版",
    page_icon="📊",
    layout="wide",
)


# ---------------------------------------------------------------------------
# Sidebar: 都市選択と API ステータス
# ---------------------------------------------------------------------------

accessor = MarketDataAccessor()

st.sidebar.title("対象エリア")

from data.codes import PREFECTURES as ALL_PREFECTURES

pref_code = st.sidebar.selectbox(
    "都道府県",
    options=list(ALL_PREFECTURES.keys()),
    format_func=lambda c: f"{c:02d} {ALL_PREFECTURES[c]}",
    index=list(ALL_PREFECTURES.keys()).index(37),  # デフォルト: 香川県
)

# 市区町村: キャッシュから動的取得、なければ sample_data フォールバック
census_cities = accessor.get_census_municipalities(pref_code)
if census_cities:
    city_options = [(f"{pref_code:02d}000", f"{ALL_PREFECTURES[pref_code]}全体")] + census_cities
    city_code = st.sidebar.selectbox(
        "市区町村",
        options=[code for code, _ in city_options],
        format_func=lambda c: next(name for code, name in city_options if code == c),
        index=0,
    )
    # city_code を int に変換（data_sources の互換性）
    city_code = int(city_code) if city_code.isdigit() else 0
else:
    cities = sample_data.CITIES_BY_PREF.get(pref_code, {})
    if not cities:
        cities = {0: f"{ALL_PREFECTURES[pref_code]}全体"}
    city_code = st.sidebar.selectbox(
        "市区町村",
        options=list(cities.keys()),
        format_func=lambda c: f"{cities[c]}",
        index=0,
    )

st.sidebar.divider()
st.sidebar.subheader("API 接続状況")
for label, ok in accessor.api_status().items():
    if ok:
        st.sidebar.success(f"✓ {label}")
    else:
        st.sidebar.warning(f"✗ {label}（未設定）")
st.sidebar.caption("未設定の場合は sample_data からのフォールバックで動作します。")

st.sidebar.divider()
st.sidebar.subheader("シミュレーション")
new_basic_jobs = st.sidebar.number_input(
    "新規基盤雇用（シミュレーション用）",
    min_value=-10_000,
    max_value=10_000,
    value=100,
    step=50,
    help="新工場・物流拠点誘致等で増加（または喪失）する基盤雇用数を入力すると、"
         "総雇用・人口・住戸需要への波及効果が EBM/PER から自動算出されます。",
)
persons_per_household = st.sidebar.number_input(
    "平均世帯人員",
    min_value=1.0,
    max_value=5.0,
    value=float(sample_data.TAKAMATSU["persons_per_household"]),
    step=0.05,
)


# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

basics = accessor.city_basics(pref_code, city_code)

st.title("📊 CCIM CI102 市場分析ダッシュボード（日本版）")
st.markdown(
    f"### 対象: {sample_data.PREFECTURES[pref_code]} "
    f"{cities[city_code]}"
)

c1, c2, c3, c4 = st.columns(4)
c1.metric("総人口", f"{basics['population']:,}")
c2.metric("総世帯数", f"{basics['households']:,}")
c3.metric("総従業者数", f"{basics['total_employment']:,}")
c4.metric("平均世帯人員", f"{basics['persons_per_household']:.2f}")


tab_lq, tab_ebm, tab_ss, tab_gap, tab_re = st.tabs(
    ["① LQ・経済基盤", "② EBM・PER・予測", "③ シフトシェア分析", "④ 小売ギャップ分析", "⑤ 不動産取引価格"]
)


# ---------------------------------------------------------------------------
# Tab 1: LQ
# ---------------------------------------------------------------------------

with tab_lq:
    st.header("特化係数（Location Quotient, LQ）と基盤雇用")
    st.markdown(
        "LQ > 1.0 の産業は全国平均より高い集積度を持ち、地域経済を域外に向けて"
        "牽引する **基盤産業** とみなされます。"
    )

    local_emp, national_emp, src_label = accessor.industry_employment(pref_code, city_code)
    df_lq = lq_table(local_emp, national_emp)
    st.caption(f"データソース: {src_label}")

    basic_total = total_basic_employment(df_lq)
    total_emp = float(df_lq["local_emp"].sum())

    c1, c2, c3 = st.columns(3)
    c1.metric("総従業者数（集計）", f"{int(total_emp):,}")
    c2.metric("推計基盤雇用", f"{int(basic_total):,}")
    c3.metric("基盤雇用比率", f"{basic_total / total_emp * 100:.1f}%" if total_emp > 0 else "—")

    # LQ ランキングバー
    fig = px.bar(
        df_lq.sort_values("lq", ascending=True),
        x="lq",
        y="industry",
        orientation="h",
        title="産業別 LQ",
        labels={"lq": "LQ", "industry": "産業"},
    )
    fig.add_vline(x=1.0, line_dash="dash", line_color="red", annotation_text="LQ = 1.0")
    fig.update_layout(height=600)
    st.plotly_chart(fig, width='stretch')

    st.subheader("詳細テーブル")
    st.dataframe(
        df_lq.style.format(
            {
                "local_emp": "{:,.0f}",
                "national_emp": "{:,.0f}",
                "lq": "{:.3f}",
                "basic_emp_estimate": "{:,.1f}",
            }
        ),
        width='stretch',
    )


# ---------------------------------------------------------------------------
# Tab 2: EBM & PER
# ---------------------------------------------------------------------------

with tab_ebm:
    st.header("経済基盤乗数（EBM）と人口雇用比率（PER）")

    local_emp, national_emp, _ = accessor.industry_employment(pref_code, city_code)
    df_lq = lq_table(local_emp, national_emp)
    basic_total = total_basic_employment(df_lq)
    total_emp = float(df_lq["local_emp"].sum())

    ebm = economic_base_multiplier(total_emp, basic_total)
    per = population_employment_ratio(basics["population"], basics["total_employment"])

    c1, c2 = st.columns(2)
    c1.metric("経済基盤乗数 EBM", f"{ebm:.2f}", help="基盤雇用1単位が支える総雇用数")
    c2.metric("人口雇用比率 PER", f"{per:.2f}", help="就業者1人あたりの総人口")

    st.subheader("シミュレーション結果")
    delta_total_emp = forecast_total_employment_change(new_basic_jobs, ebm)
    delta_population = forecast_population_change(delta_total_emp, per)
    delta_households = forecast_housing_units(delta_population, persons_per_household)

    st.markdown(
        f"基盤雇用が **{new_basic_jobs:+,}** 変動すると、地域経済全体には以下の波及が予測されます:"
    )

    s1, s2, s3 = st.columns(3)
    s1.metric("総雇用への波及", f"{delta_total_emp:+,.0f}")
    s2.metric("人口への波及", f"{delta_population:+,.0f}")
    s3.metric("住戸需要への波及", f"{delta_households:+,.0f} 戸")

    st.info(
        f"計算ロジック: 新規基盤雇用 {new_basic_jobs:+,} × EBM {ebm:.2f} = 総雇用増 "
        f"{delta_total_emp:+,.0f} 人 → × PER {per:.2f} = 人口増 "
        f"{delta_population:+,.0f} 人 → ÷ 世帯人員 {persons_per_household:.2f} = "
        f"{delta_households:+,.0f} 戸"
    )


# ---------------------------------------------------------------------------
# Tab 3: Shift-Share
# ---------------------------------------------------------------------------

with tab_ss:
    st.header("シフトシェア分析")
    st.markdown(
        "雇用変動を **国家成長要因 / 産業ミックス要因 / 地域シフト要因** に分解し、"
        "地域固有の競争力（Regional Shift）を可視化します。"
    )

    l0, l1, n0, n1, src = accessor.shift_share_inputs(pref_code, city_code)
    st.caption(f"データソース: {src}")
    df_ss = shift_share_table(l0, l1, n0, n1)

    fig = go.Figure()
    fig.add_bar(name="国家成長 NS", x=df_ss["industry"], y=df_ss["national_growth"])
    fig.add_bar(name="産業ミックス IM", x=df_ss["industry"], y=df_ss["industry_mix"])
    fig.add_bar(name="地域シフト RS", x=df_ss["industry"], y=df_ss["regional_shift"])
    fig.add_scatter(
        name="実雇用変化",
        x=df_ss["industry"],
        y=df_ss["actual_change"],
        mode="markers+lines",
        marker=dict(size=12, color="black"),
    )
    fig.update_layout(
        barmode="relative",
        title="シフトシェア要因分解",
        yaxis_title="雇用変動（人）",
        height=500,
    )
    st.plotly_chart(fig, width='stretch')

    st.subheader("詳細テーブル")
    st.dataframe(
        df_ss.style.format(
            {
                "actual_change": "{:+,.0f}",
                "national_growth": "{:+,.0f}",
                "industry_mix": "{:+,.0f}",
                "regional_shift": "{:+,.0f}",
                "total_share": "{:+,.0f}",
            }
        ),
        width='stretch',
    )

    star_industries = df_ss[
        (df_ss["regional_shift"] > 0) & (df_ss["actual_change"] > 0)
    ]["industry"].tolist()
    if star_industries:
        st.success(
            f"⭐ 競争優位を持つスター産業: {', '.join(star_industries)}"
        )


# ---------------------------------------------------------------------------
# Tab 4: Gap Analysis
# ---------------------------------------------------------------------------

with tab_gap:
    st.header("小売ギャップ分析（漏出・余剰）")
    st.markdown(
        "商圏内の **潜在需要（家計支出ベース）** と **実供給（小売販売額）** の差から、"
        "出店機会（漏出）と競争過多（余剰）を判定します。"
    )

    sectors, src = accessor.retail_sectors(pref_code, city_code)
    st.caption(f"データソース: {src}")
    df_gap = gap_analysis_table(sectors)

    fig = px.bar(
        df_gap.sort_values("factor"),
        x="factor",
        y="sector",
        orientation="h",
        color="factor",
        color_continuous_scale=["#d62728", "#dddddd", "#2ca02c"],
        color_continuous_midpoint=0,
        title="漏出・余剰係数（+100 完全漏出 〜 -100 完全余剰）",
        labels={"factor": "Leakage/Surplus Factor", "sector": "小売セクター"},
    )
    fig.add_vline(x=0, line_dash="dash", line_color="gray")
    fig.update_layout(height=500)
    st.plotly_chart(fig, width='stretch')

    st.subheader("詳細テーブル")
    st.dataframe(
        df_gap.style.format(
            {
                "demand": "{:,.0f}",
                "supply": "{:,.0f}",
                "gap": "{:+,.0f}",
                "factor": "{:+.1f}",
            }
        ),
        width='stretch',
    )

    opportunities = df_gap[df_gap["factor"] >= 10]
    if not opportunities.empty:
        st.success(
            "🎯 出店機会のあるセクター: "
            + ", ".join(opportunities["sector"].tolist())
        )

    saturated = df_gap[df_gap["factor"] <= -10]
    if not saturated.empty:
        st.warning(
            "⚠ 競争過多セクター: " + ", ".join(saturated["sector"].tolist())
        )


# ---------------------------------------------------------------------------
# Tab 5: Real Estate Transaction Prices
# ---------------------------------------------------------------------------

with tab_re:
    st.header("不動産取引価格分析")
    st.markdown(
        "国土交通省「不動産情報ライブラリ」の取引価格データを可視化します。"
        "経済基盤分析の結果と不動産価格の相関を確認できます。"
    )

    mlit_client = accessor.mlit
    if mlit_client.available:
        re_col1, re_col2 = st.columns(2)
        with re_col1:
            re_year = st.selectbox("年度", options=list(range(2024, 2018, -1)), index=0, key="re_year")
        with re_col2:
            re_quarter = st.selectbox("四半期", options=[1, 2, 3, 4], index=0, key="re_quarter")

        try:
            df_re = mlit_client.transaction_prices(
                year=re_year, quarter=re_quarter,
                pref_code=pref_code, city_code=city_code,
            )
            if df_re is not None and not df_re.empty:
                st.metric("取引件数", f"{len(df_re):,}")

                if "TradePrice" in df_re.columns:
                    df_re["TradePrice"] = pd.to_numeric(df_re["TradePrice"], errors="coerce")
                    valid = df_re.dropna(subset=["TradePrice"])
                    if not valid.empty:
                        fig_hist = px.histogram(
                            valid, x="TradePrice",
                            title="取引価格分布",
                            labels={"TradePrice": "取引価格（円）"},
                            nbins=30,
                        )
                        st.plotly_chart(fig_hist, use_container_width=True)

                if "Type" in df_re.columns:
                    type_counts = df_re["Type"].value_counts().reset_index()
                    type_counts.columns = ["物件種別", "件数"]
                    fig_type = px.pie(
                        type_counts, names="物件種別", values="件数",
                        title="物件種別構成",
                    )
                    st.plotly_chart(fig_type, use_container_width=True)

                st.subheader("取引データ（先頭50件）")
                st.dataframe(df_re.head(50), use_container_width=True)
            else:
                st.info("指定期間の取引データがありません。")
        except Exception as e:
            st.error(f"データ取得エラー: {e}")
    else:
        st.info(
            "MLIT API キーを `.env` に設定すると不動産取引価格データを表示できます。\n\n"
            "取得先: https://www.reinfolib.mlit.go.jp/ex-api/"
        )

        st.markdown("""
### このタブで表示される情報（API接続後）

- **取引価格分布**: ヒストグラム
- **物件種別構成**: 宅地、宅地+建物、中古マンション等
- **地区別・用途別の㎡単価**: 中央値と分布
- **時系列推移**: 複数四半期の価格トレンド

経済基盤分析（Tab ①②）で特定した基盤産業の成長が、
実際の不動産価格にどう反映されているかを確認できます。
        """)


# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------

st.divider()
st.caption(
    "本アプリは CCIM CI102（市場分析）の数理モデル "
    "（LQ・EBM・PER・シフトシェア・ギャップ分析）を日本のオープンデータで再現する "
    "PoC 実装です。サンプルデータは検証用近似値。商用利用には RESAS/e-Stat/"
    "不動産情報ライブラリ API への接続を推奨。"
)
