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
    index=list(ALL_PREFECTURES.keys()).index(13),  # デフォルト: 東京都
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

# city_basics を先に取得し、平均世帯人員のデフォルト値に反映
basics = accessor.city_basics(pref_code, city_code)

persons_per_household = st.sidebar.number_input(
    "平均世帯人員",
    min_value=1.0,
    max_value=5.0,
    value=float(basics["persons_per_household"]),
    step=0.05,
)


# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

# 表示用の地域名を構築
_pref_name = ALL_PREFECTURES.get(pref_code, "")
_city_name = ""
if census_cities:
    for _code, _name in city_options:
        _cc = int(_code) if _code.isdigit() else 0
        if _cc == city_code:
            _city_name = _name
            break
else:
    _city_name = cities.get(city_code, "")

st.title("📊 CCIM CI102 市場分析ダッシュボード（日本版）")
st.markdown(f"### 対象: {_pref_name} {_city_name}")

c1, c2, c3, c4 = st.columns(4)
c1.metric("総人口", f"{basics['population']:,}")
c2.metric("総世帯数", f"{basics['households']:,}")
c3.metric("総従業者数", f"{basics['total_employment']:,}")
c4.metric("平均世帯人員", f"{basics['persons_per_household']:.2f}")


tab_lq, tab_ebm, tab_ss, tab_gap, tab_re, tab_map = st.tabs(
    ["① LQ・経済基盤", "② EBM・PER・予測", "③ シフトシェア分析",
     "④ 小売ギャップ分析", "⑤ 不動産取引価格", "⑥ 地図分析"]
)


# ---------------------------------------------------------------------------
# Tab 1: LQ
# ---------------------------------------------------------------------------

with tab_lq:
    st.header("特化係数（Location Quotient, LQ）と基盤雇用")

    with st.expander("この指標の意味（CI102 Module 4: Demand Analysis）", expanded=False):
        st.markdown("""
**特化係数（LQ）** は、ある地域の特定産業の雇用割合を全国平均と比較する指標です。

$$LQ = \\frac{\\text{地域の産業}i\\text{の従業者数} / \\text{地域の総従業者数}}{\\text{全国の産業}i\\text{の従業者数} / \\text{全国の総従業者数}}$$

| LQ の値 | 意味 |
|---------|------|
| **LQ > 1.0** | 全国平均より高い集積度 → **基盤産業（Basic / Export Sector）** と推定 |
| **LQ = 1.0** | 全国平均と同じ割合 → 地域内需要を自給している水準 |
| **LQ < 1.0** | 全国平均より低い集積度 → **非基盤産業（Non-basic / Service Sector）** |

**基盤産業**とは、地域外に財やサービスを「輸出」し、地域外から資金を流入させる産業です。
この外部資金の流入こそが地域経済を駆動し、将来の不動産需要を創出する根源的な力となります。

**基盤雇用の推計**: LQ > 1.0 の産業について、全国平均を超える部分の雇用を
「域外向け輸出に必要な雇用（基盤雇用）」と推定します。

$$\\text{基盤雇用} = \\text{地域の従業者数} \\times \\frac{LQ - 1}{LQ}$$
        """)

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
    st.plotly_chart(fig, use_container_width=True)

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
        use_container_width=True,
    )


# ---------------------------------------------------------------------------
# Tab 2: EBM & PER
# ---------------------------------------------------------------------------

with tab_ebm:
    st.header("経済基盤乗数（EBM）と人口雇用比率（PER）")

    with st.expander("この指標の意味（CI102 Module 4: Activity 4-3〜4-5）", expanded=False):
        st.markdown("""
**経済基盤乗数（EBM: Economic Base Multiplier）** は、基盤雇用1人が地域経済全体で
何人の雇用を支えているかを示す波及効果の指標です。

$$EBM = \\frac{\\text{総雇用}}{\\text{基盤雇用}}$$

例えば EBM = 5.0 の場合、基盤産業の雇用が1人増えると、非基盤部門（地元の小売店、
飲食店、医療機関など）で追加的に4人の雇用が生まれ、地域全体で5人の雇用増加を意味します。
逆に基盤産業の工場が閉鎖され100人の雇用が失われれば、地域全体で500人の雇用が消失するリスクがあります。

---

**人口雇用比率（PER: Population to Employment Ratio）** は、就業者1人に対して
地域に何人の総人口が存在しているかを示します。

$$PER = \\frac{\\text{総人口}}{\\text{総雇用}}$$

PER = 1.8 の場合、就業者1人の背後に子供、高齢者、非就業の配偶者などを含めて
1.8人の人口基盤が存在していることを意味します。

---

**需要予測カスケード（CI102の核心）**: この2つの指標を組み合わせることで、
基盤雇用の変動から住宅需要までを論理的に予測できます。

$$\\text{基盤雇用増} \\xrightarrow{\\times EBM} \\text{総雇用増} \\xrightarrow{\\times PER} \\text{人口増} \\xrightarrow{\\div \\text{世帯人員}} \\text{住戸需要}$$
        """)

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
    st.header("シフトシェア分析（Shift-Share Analysis）")

    with st.expander("この指標の意味（CI102 Module 4: Shift-Share Analysis）", expanded=False):
        st.markdown("""
**シフトシェア分析**は、地域の産業別雇用変動を3つの要因に分解し、
その地域が持つ本質的な競争力を明らかにする統計手法です。

$$\\text{雇用変動} = \\text{NS（国家成長）} + \\text{IM（産業ミックス）} + \\text{RS（地域シフト）}$$

| 要因 | 英語名 | 意味 |
|------|--------|------|
| **NS** | National Growth Share | 国全体の経済成長率と同じペースで成長したと仮定した場合の雇用変動分。マクロ経済の波に乗った自然成長分。 |
| **IM** | Industry Mix Effect | その産業セクター自体の全国的な成長トレンドに起因する要因。例: IT産業が全国的に成長していれば、IT企業が多い地域は恩恵を受ける。 |
| **RS** | Regional Shift / Competitive Share | **最も重要な要因。** 地域の特定産業が全国の同産業をどれだけ上回ったか（下回ったか）を示す。正の値は**競争的優位性（Competitive Advantage）**を意味する。 |

**投資判断への活用**: RS（地域シフト）が大きく正の産業 = その地域に固有の競争力がある
「スター産業」です。この産業のテナントが入居するオフィスや物流施設は、安定した需要が
見込めるため、投資対象として有望です。

逆に RS が大きく負の産業は、その地域で衰退しつつあり、関連不動産の空室リスクが高まります。
        """)

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
    st.plotly_chart(fig, use_container_width=True)

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
        use_container_width=True,
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
    st.header("小売ギャップ分析（漏損/余剰分析）")

    with st.expander("この指標の意味（CI102 Module 5: Retail Properties）", expanded=False):
        st.markdown("""
**ギャップ分析（Gap Analysis）** は、商圏内の消費者の潜在的な購買力（需要）と、
実際の小売店舗の販売額（供給）の差分を測定する手法です。

$$\\text{Leakage/Surplus Factor} = \\frac{\\text{Demand} - \\text{Supply}}{\\text{Demand} + \\text{Supply}} \\times 100$$

| 係数の範囲 | 状態 | 意味 |
|-----------|------|------|
| **+100 〜 +10** | **漏損（Leakage）** | 商圏内の購買力が域外に流出している。新規出店の**機会**がある。 |
| **+10 〜 -10** | **均衡** | 需要と供給がほぼ釣り合っている。 |
| **-10 〜 -100** | **余剰（Surplus）** | 商圏内の店舗売上が住民の需要を上回っている。広域集客力がある一方、同業種の追加出店は**カニバリゼーション**のリスクが高い。 |

> **用語について**: CI102の日本語テキストでは Leakage を「**漏損**」と訳しています。
> 本アプリでは「漏損」「漏出」を同義で使用しています。いずれも商圏外への購買力流出を意味します。

**需要（Demand）の推計方法**: 地域人口 × 全国平均の1人あたり業種別小売支出額で按分推計。
家計調査の個票データが利用可能になれば、より精緻な地域別推計が可能です。

**供給（Supply）**: 経済センサス活動調査の業種別年間商品販売額を使用。
        """)

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
        title="漏損/余剰係数（+100 = 完全漏損 〜 -100 = 完全余剰）",
        labels={"factor": "Leakage/Surplus Factor", "sector": "小売セクター"},
    )
    fig.add_vline(x=0, line_dash="dash", line_color="gray")
    fig.update_layout(height=500)
    st.plotly_chart(fig, use_container_width=True)

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
        use_container_width=True,
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

    with st.expander("この指標の意味（CI102: Market Analysis drives Financial Analysis）", expanded=False):
        st.markdown("""
CI102 の基本理念は **「市場分析が財務分析を牽引する（Market analysis drives financial analysis）」** です。

Tab ①〜④ で分析した経済基盤の強さ（LQ、EBM、シフトシェアの競争優位）が、
実際の不動産価格やキャップレートの変動にどう反映されているかを確認するのがこのタブの役割です。

**確認すべきポイント**:
- 基盤産業（LQ > 1.0）が強い地域は、取引価格が安定または上昇傾向にあるか？
- シフトシェアで RS（地域シフト）が正の産業が集積するエリアで、㎡単価は上がっているか？
- ギャップ分析で漏損が大きい業種がある地域は、商業不動産の投資機会があるか？

**データソース**: 国土交通省「不動産情報ライブラリ」の実取引価格データ（四半期更新）。
        """)


    mlit_client = accessor.mlit
    if mlit_client.available:
        re_col1, re_col2 = st.columns(2)
        with re_col1:
            re_year = st.selectbox("年度", options=list(range(2024, 2018, -1)), index=0, key="re_year")
        with re_col2:
            re_quarter = st.selectbox("四半期", options=[1, 2, 3, 4], index=0, key="re_quarter")

        try:
            # MLIT API は都道府県全体(XX000/0)の場合 city_code=None が必要
            _mlit_city = city_code if city_code and city_code % 1000 != 0 else None
            df_re = mlit_client.transaction_prices(
                year=re_year, quarter=re_quarter,
                pref_code=pref_code, city_code=_mlit_city,
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
# Tab 6: Map Analysis
# ---------------------------------------------------------------------------

with tab_map:
    st.header("全国地図分析（都道府県別）")

    map_view = st.selectbox("分析ビュー", [
        "産業集積マップ（LQ）",
        "シフトシェア RS マップ",
        "小売ギャップマップ",
        "都道府県比較ダッシュボード",
    ])

    try:
        import map_data
        import map_charts
    except ImportError:
        st.error("地図分析モジュールが見つかりません（map_data.py / map_charts.py）。")
        st.stop()

    try:
        if map_view == "産業集積マップ（LQ）":
            st.subheader("産業別 特化係数（LQ）全国マップ")
            with st.expander("この地図の見方", expanded=False):
                st.markdown("""
赤い地域ほどLQが高く（集積度が高い）、青い地域ほどLQが低い。
LQ = 1.0（白）が全国平均水準。特定の産業を選択すると、
その産業がどの都道府県に集積しているかを一目で把握できます。
                """)

            view_mode = st.radio(
                "表示モード", ["特定産業のLQ", "基盤雇用比率（概要）"],
                horizontal=True,
            )

            if view_mode == "特定産業のLQ":
                industries = map_data.get_industry_list()
                if industries:
                    selected_industry = st.selectbox("産業を選択", industries)
                    df_ilq = map_data.compute_prefecture_industry_lq(selected_industry)
                    if not df_ilq.empty:
                        st.plotly_chart(
                            map_charts.choropleth_industry_lq(df_ilq),
                            use_container_width=True,
                        )
                        st.subheader("LQ ランキング")
                        st.dataframe(
                            df_ilq.sort_values("lq", ascending=False)
                            .style.format({"lq": "{:.3f}", "local_emp": "{:,.0f}", "basic_emp": "{:,.0f}"}),
                            use_container_width=True,
                        )
                    else:
                        st.info("データがありません。")
                else:
                    st.warning("キャッシュが未構築です。")
            else:
                df_summary = map_data.compute_prefecture_lq_summary()
                if not df_summary.empty:
                    st.plotly_chart(
                        map_charts.choropleth_lq_summary(df_summary),
                        use_container_width=True,
                    )
                    st.subheader("基盤雇用比率ランキング")
                    st.dataframe(
                        df_summary.sort_values("basic_ratio", ascending=False)
                        [["pref_name", "basic_ratio", "num_basic", "total_emp", "basic_emp", "max_lq_industry"]]
                        .style.format({
                            "basic_ratio": "{:.1f}%",
                            "total_emp": "{:,.0f}",
                            "basic_emp": "{:,.0f}",
                        }),
                        use_container_width=True,
                    )

        elif map_view == "シフトシェア RS マップ":
            st.subheader("地域シフト（RS）合計 全国マップ")
            with st.expander("この地図の見方", expanded=False):
                st.markdown("""
**緑**の地域は地域シフト(RS)合計が正 = 全国トレンドを上回る競争優位を持つ。
**赤**の地域はRS合計が負 = 全国の同産業と比べ雇用が減少傾向。
期間: 2016年 → 2021年（経済センサス活動調査）。
                """)
            df_ss = map_data.compute_prefecture_shift_share()
            if not df_ss.empty:
                st.plotly_chart(
                    map_charts.choropleth_shift_share(df_ss),
                    use_container_width=True,
                )
                st.subheader("地域シフト(RS) ランキング")
                st.dataframe(
                    df_ss.sort_values("total_rs", ascending=False)
                    [["pref_name", "total_rs", "total_actual_change", "top_rs_industry"]]
                    .style.format({
                        "total_rs": "{:+,.0f}",
                        "total_actual_change": "{:+,.0f}",
                    }),
                    use_container_width=True,
                )

        elif map_view == "小売ギャップマップ":
            st.subheader("小売 漏損/余剰係数 全国マップ")
            with st.expander("この地図の見方", expanded=False):
                st.markdown("""
**緑**（正の係数）= 漏損（Leakage）: 購買力が域外に流出 → 出店機会あり。
**赤**（負の係数）= 余剰（Surplus）: 域内供給が需要を上回る → 競争過多。
需要は人口 × 全国平均1人あたり小売支出額で按分推計。
                """)
            df_gap = map_data.compute_prefecture_retail_gap()
            if not df_gap.empty:
                st.plotly_chart(
                    map_charts.choropleth_retail_gap(df_gap),
                    use_container_width=True,
                )
                st.subheader("漏損/余剰 ランキング")
                st.dataframe(
                    df_gap.sort_values("aggregate_factor", ascending=False)
                    [["pref_name", "aggregate_factor", "num_leakage", "num_surplus",
                      "total_demand", "total_supply"]]
                    .style.format({
                        "aggregate_factor": "{:+.1f}",
                        "total_demand": "{:,.0f}",
                        "total_supply": "{:,.0f}",
                    }),
                    use_container_width=True,
                )

        elif map_view == "都道府県比較ダッシュボード":
            st.subheader("都道府県 横断比較")
            df_comp = map_data.compute_prefecture_comparison()
            if not df_comp.empty:
                selected = st.multiselect(
                    "比較する都道府県を選択（2〜8）",
                    options=df_comp["pref_code"].tolist(),
                    format_func=lambda c: f"{ALL_PREFECTURES.get(c, '')}",
                    default=[13, 27, 23, 37],
                )
                if len(selected) >= 2:
                    col_radar, col_bar = st.columns(2)
                    with col_radar:
                        st.plotly_chart(
                            map_charts.comparison_radar(df_comp, selected),
                            use_container_width=True,
                        )
                    with col_bar:
                        st.plotly_chart(
                            map_charts.comparison_bar(df_comp, selected),
                            use_container_width=True,
                        )

                    st.subheader("詳細テーブル")
                    subset = df_comp[df_comp["pref_code"].isin(selected)]
                    st.dataframe(
                        subset[["pref_name", "population", "total_emp", "basic_emp",
                                "ebm", "per", "basic_ratio"]]
                        .style.format({
                            "population": "{:,.0f}",
                            "total_emp": "{:,.0f}",
                            "basic_emp": "{:,.0f}",
                            "ebm": "{:.2f}",
                            "per": "{:.2f}",
                            "basic_ratio": "{:.1f}%",
                        }),
                        use_container_width=True,
                    )
                else:
                    st.info("2つ以上の都道府県を選択してください。")

    except FileNotFoundError:
        st.error("GeoJSON ファイルが見つかりません（data/japan_prefectures.geojson）。")
    except Exception as e:
        st.error(f"地図データの処理中にエラーが発生しました: {e}")
        st.exception(e)

# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------

st.divider()
st.caption(
    "本アプリは CCIM CI102（Market Analysis for Commercial Investment Real Estate）の "
    "数理モデル（LQ・EBM・PER・シフトシェア・ギャップ分析）を "
    "日本の公的統計（e-Stat 経済センサス・国勢調査・国土交通省不動産情報ライブラリ）で再現しています。"
)
