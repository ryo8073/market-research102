"""不動産市場分析ダッシュボード（Streamlit MVP）。

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
    page_title="不動産市場分析ダッシュボード",
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

st.title("📊 不動産市場分析ダッシュボード")
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

    with st.expander("投資判断への活用", expanded=False):
        st.markdown("""
特化係数（LQ）が1.0を超える産業は、この地域から域外へ財やサービスを「輸出」し、外部資金を流入させる基盤産業です。この外部資金の流入がテナント需要を生み、不動産価値を支える根源的な力です。

**着目ポイント**:
- LQ > 1.5 の産業が複数ある → 経済基盤が多様で投資リスクが低い
- LQ > 2.0 の産業が1つだけ → 一極集中リスクに注意
- 基盤雇用の推計: LQ > 1.0 の産業について、全国平均を超える部分の雇用を「域外向け輸出に必要な雇用（基盤雇用）」と推定します
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

    with st.expander("投資判断への活用", expanded=False):
        st.markdown("""
**経済基盤乗数（EBM）** は基盤雇用1人が地域全体で何人の雇用を支えているかを示します。EBM = 5.0 なら、基盤産業の雇用が1人増えると地域全体で5人の雇用増加を意味します。

**人口雇用比率（PER）** は就業者1人あたりの総人口です。

**需要予測の流れ**: 基盤雇用の変動 → ×EBM → 総雇用変動 → ×PER → 人口変動 → ÷世帯人員 → 住戸需要

基盤産業の工場誘致・撤退が地域の不動産需要にどう波及するかを定量予測できます。
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

    with st.expander("投資判断への活用", expanded=False):
        st.markdown("""
シフトシェア分析は、地域の雇用変動を3つの要因に分解します。

| 要因 | 意味 |
|------|------|
| **NS（国家成長）** | 全国経済の成長に乗った自然成長分 |
| **IM（産業ミックス）** | 成長産業が多い/少ないことによる有利・不利 |
| **RS（地域シフト）** | **最重要。** 同じ産業の全国平均をどれだけ上回ったか |

**投資判断**: RS > 0 の産業 = その地域に固有の競争力がある「スター産業」。関連不動産は安定需要が見込めます。RS < 0 の産業は衰退リスクがあり、関連不動産の空室率上昇に注意が必要です。
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

    with st.expander("投資判断への活用", expanded=False):
        st.markdown("""
漏損（Leakage）は、地域住民の購買力が域外に流出している状態です。漏損が大きいセクターは新規出店により購買力を取り戻せる可能性があり、商業不動産の投資機会を示唆します。

| 係数 | 状態 | 投資判断 |
|------|------|---------|
| **+10以上** | 漏損（出店機会） | 需要 > 供給。新規出店の余地あり |
| **±10以内** | 均衡 | 需給がほぼ釣り合い |
| **-10以下** | 余剰（供給過多） | 同業種の追加出店はカニバリゼーションのリスク |

> 「漏損」「漏出」はいずれも購買力の域外流出を意味します。

需要は地域人口 × 全国平均の1人あたり小売支出額で按分推計しています。供給は経済センサスの業種別年間商品販売額です。
        """)

    sectors, src = accessor.retail_sectors(pref_code, city_code)
    st.caption(f"データソース: {src}")
    df_gap = gap_analysis_table(sectors)

    fig = go.Figure()
    sorted_gap = df_gap.sort_values("factor")
    fig.add_trace(go.Bar(
        x=sorted_gap["factor"],
        y=sorted_gap["sector"],
        orientation="h",
        marker_color="#D4A843",  # STDBスタイル: 全バー同一色（アンバー）
        hovertemplate="%{y}: %{x:+.1f}<extra></extra>",
    ))
    fig.add_vline(x=0, line_dash="solid", line_color="#6B7280", line_width=2)
    fig.add_annotation(x=-50, y=1.05, text="← 余剰（供給過多）",
                       showarrow=False, xref="x", yref="paper",
                       font=dict(color="#6B7280", size=12))
    fig.add_annotation(x=50, y=1.05, text="漏損（出店機会）→",
                       showarrow=False, xref="x", yref="paper",
                       font=dict(color="#6B7280", size=12))
    fig.update_layout(
        height=500,
        title="漏損/余剰係数",
        xaxis_title="Leakage/Surplus Factor",
        yaxis_title="",
        showlegend=False,
    )
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

    with st.expander("投資判断への活用", expanded=False):
        st.markdown("""
経済基盤分析（Tab①）で特定した基盤産業の強さが、実際の不動産価格にどう反映されているかを確認します。

**着目ポイント**:
- 基盤産業が強い地域は、取引価格が安定・上昇傾向にあるか？
- シフトシェアでRS（競争要因）が正の産業が集積するエリアで、㎡単価は上がっているか？
- 物件タイプ別の㎡単価分布から、割安なセグメントはどこか？
        """)


    # MLIT APIカラム名の日本語化マッピング
    _MLIT_COLS = {
        "Type": "物件種別", "TradePrice": "取引価格", "UnitPrice": "㎡単価",
        "Area": "面積", "DistrictName": "地区名", "BuildingYear": "建築年",
        "Structure": "構造", "Use": "用途", "CityPlanning": "都市計画",
        "FloorPlan": "間取り", "TotalFloorArea": "延床面積",
        "Period": "取引時期", "PricePerUnit": "坪単価",
    }

    mlit_client = accessor.mlit
    if mlit_client.available:
        re_col1, re_col2 = st.columns(2)
        with re_col1:
            re_year = st.selectbox("年度", options=list(range(2024, 2018, -1)), index=0, key="re_year")
        with re_col2:
            re_quarter = st.selectbox("四半期", options=[1, 2, 3, 4], index=0, key="re_quarter")

        try:
            _mlit_city = city_code if city_code and city_code % 1000 != 0 else None
            df_re = mlit_client.transaction_prices(
                year=re_year, quarter=re_quarter,
                pref_code=pref_code, city_code=_mlit_city,
            )
            if df_re is not None and not df_re.empty:
                # --- 数値カラムの前処理 ---
                for col in ["TradePrice", "UnitPrice", "Area", "TotalFloorArea", "PricePerUnit"]:
                    if col in df_re.columns:
                        df_re[col] = pd.to_numeric(df_re[col], errors="coerce")

                # --- 物件種別フィルタ ---
                if "Type" in df_re.columns:
                    all_types = sorted(df_re["Type"].dropna().unique().tolist())
                    selected_types = st.multiselect(
                        "物件種別フィルタ", options=all_types, default=all_types, key="re_type_filter",
                    )
                    if selected_types:
                        df_re = df_re[df_re["Type"].isin(selected_types)]

                # --- KPIカード ---
                kpi1, kpi2, kpi3 = st.columns(3)
                kpi1.metric("取引件数", f"{len(df_re):,}")
                if "TradePrice" in df_re.columns:
                    med_price = df_re["TradePrice"].median()
                    if pd.notna(med_price):
                        kpi2.metric("価格中央値", f"{med_price / 10000:,.0f} 万円")
                if "UnitPrice" in df_re.columns:
                    valid_up = df_re.loc[df_re["UnitPrice"] > 0, "UnitPrice"]
                    if not valid_up.empty:
                        kpi3.metric("㎡単価中央値", f"{valid_up.median():,.0f} 円/㎡")

                # --- 2カラムチャート ---
                chart_left, chart_right = st.columns(2)

                with chart_left:
                    if "TradePrice" in df_re.columns:
                        valid = df_re.dropna(subset=["TradePrice"])
                        if not valid.empty:
                            fig_hist = px.histogram(
                                valid, x="TradePrice",
                                title="取引価格分布",
                                labels={"TradePrice": "取引価格（円）"},
                                nbins=30,
                            )
                            fig_hist.update_layout(height=400)
                            st.plotly_chart(fig_hist, use_container_width=True)

                with chart_right:
                    if "UnitPrice" in df_re.columns and "Type" in df_re.columns:
                        valid_unit = df_re.dropna(subset=["UnitPrice"])
                        valid_unit = valid_unit[valid_unit["UnitPrice"] > 0]
                        if not valid_unit.empty:
                            fig_box = px.box(
                                valid_unit, x="Type", y="UnitPrice",
                                title="物件種別ごとの㎡単価分布",
                                labels={"Type": "物件種別", "UnitPrice": "㎡単価（円/㎡）"},
                            )
                            fig_box.update_layout(height=400)
                            st.plotly_chart(fig_box, use_container_width=True)

                # --- 散布図: 面積 × ㎡単価 ---
                if "Area" in df_re.columns and "UnitPrice" in df_re.columns:
                    scatter_data = df_re.dropna(subset=["Area", "UnitPrice"])
                    scatter_data = scatter_data[(scatter_data["Area"] > 0) & (scatter_data["UnitPrice"] > 0)]
                    if not scatter_data.empty:
                        fig_scatter = px.scatter(
                            scatter_data, x="Area", y="UnitPrice", color="Type",
                            title="面積 × ㎡単価（物件タイプ別）",
                            labels={"Area": "面積（㎡）", "UnitPrice": "㎡単価（円/㎡）", "Type": "物件種別"},
                            hover_data=["DistrictName", "TradePrice"],
                            opacity=0.7,
                        )
                        fig_scatter.update_layout(height=500)
                        st.plotly_chart(fig_scatter, use_container_width=True)

                # --- 地区別クロス集計 ---
                if "DistrictName" in df_re.columns and "UnitPrice" in df_re.columns:
                    cross = df_re.dropna(subset=["UnitPrice"])
                    cross = cross[cross["UnitPrice"] > 0]
                    if not cross.empty:
                        pivot = cross.pivot_table(
                            values="UnitPrice", index="DistrictName", columns="Type",
                            aggfunc="median",
                        ).fillna(0).astype(int)
                        if not pivot.empty:
                            st.subheader("地区別 × 物件種別 ㎡単価中央値")
                            st.dataframe(pivot.style.format("{:,.0f}"), use_container_width=True)

                # --- 取引データテーブル（日本語カラム名） ---
                st.subheader("取引データ")
                display_df = df_re.rename(columns={k: v for k, v in _MLIT_COLS.items() if k in df_re.columns})
                st.dataframe(display_df, use_container_width=True)
            else:
                st.info("指定期間の取引データがありません。")
        except Exception as e:
            st.error(f"データ取得エラー: {e}")
    else:
        st.info(
            "MLIT API キーを `.env` に設定すると不動産取引価格データを表示できます。\n\n"
            "取得先: https://www.reinfolib.mlit.go.jp/ex-api/"
        )


# ---------------------------------------------------------------------------
# Tab 6: Map Analysis
# ---------------------------------------------------------------------------

with tab_map:
    st.header("地図分析")

    map_view = st.selectbox("分析ビュー", [
        "産業集積マップ（LQ）— 都道府県",
        "シフトシェア RS マップ — 都道府県",
        "小売ギャップマップ — 都道府県",
        "都道府県比較ダッシュボード",
        "県内市区町村マップ（LQ）",
        "産業中分類ドリルダウン",
    ])

    try:
        import map_data
        import map_charts
    except ImportError:
        st.error("地図分析モジュールが見つかりません（map_data.py / map_charts.py）。")
        st.stop()

    try:
        if map_view == "産業集積マップ（LQ）— 都道府県":
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

        elif map_view == "シフトシェア RS マップ — 都道府県":
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

        elif map_view == "小売ギャップマップ — 都道府県":
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

        elif map_view == "県内市区町村マップ（LQ）":
            st.subheader(f"{_pref_name} 市区町村別 LQ 分析")
            with st.expander("この地図の見方", expanded=False):
                st.markdown("""
サイドバーで選択中の都道府県内の市区町村を地図表示します。
特定産業を選ぶと、その産業のLQが市区町村ごとにどう違うかを可視化できます。
県庁所在地と郊外で産業構造がどう異なるかを確認できます。
                """)

            from data.geo_utils import load_municipality_geojson
            muni_geojson = load_municipality_geojson(pref_code)

            muni_view = st.radio(
                "表示モード", ["特定産業のLQ", "基盤雇用比率（概要）"],
                horizontal=True, key="muni_view",
            )

            center = map_charts.get_pref_center(pref_code)

            if muni_view == "特定産業のLQ":
                industries = map_data.get_industry_list()
                if industries:
                    sel_ind = st.selectbox("産業を選択", industries, key="muni_ind")
                    df_muni = map_data.compute_municipality_industry_lq(pref_code, sel_ind)
                    if not df_muni.empty and muni_geojson:
                        st.plotly_chart(
                            map_charts.choropleth_municipality_industry_lq(
                                df_muni, muni_geojson, center[0], center[1], sel_ind,
                            ),
                            use_container_width=True,
                        )
                    elif df_muni.empty:
                        st.info("データがありません。")
                    else:
                        st.warning("市区町村境界データがありません。ランキングのみ表示します。")
                    if not df_muni.empty:
                        st.subheader("LQ ランキング")
                        st.dataframe(
                            df_muni.sort_values("lq", ascending=False)
                            .style.format({"lq": "{:.3f}", "local_emp": "{:,.0f}", "basic_emp": "{:,.0f}"}),
                            use_container_width=True,
                        )
            else:
                df_muni = map_data.compute_municipality_lq(pref_code)
                if not df_muni.empty and muni_geojson:
                    st.plotly_chart(
                        map_charts.choropleth_municipality_lq(
                            df_muni, muni_geojson, center[0], center[1],
                        ),
                        use_container_width=True,
                    )
                elif df_muni.empty:
                    st.info("データがありません。")
                else:
                    st.warning("市区町村境界データがありません。ランキングのみ表示します。")
                if not df_muni.empty:
                    st.subheader("基盤雇用比率ランキング")
                    st.dataframe(
                        df_muni.sort_values("basic_ratio", ascending=False)
                        [["area_name", "basic_ratio", "num_basic", "total_emp", "basic_emp", "max_lq_industry"]]
                        .style.format({
                            "basic_ratio": "{:.1f}%",
                            "total_emp": "{:,.0f}",
                            "basic_emp": "{:,.0f}",
                        }),
                        use_container_width=True,
                    )

        elif map_view == "産業中分類ドリルダウン":
            st.subheader("産業中分類 LQ ドリルダウン")
            with st.expander("この分析の意味", expanded=False):
                st.markdown("""
産業大分類（例:「製造業」）の中をさらに細かい中分類（例:「食料品製造業」
「輸送用機械器具製造業」等）で分解し、具体的にどのサブセクターに
特化しているかを特定します。投資判断のためのテナントターゲティングに活用できます。
                """)
            st.caption(f"対象: {_pref_name} {_city_name}")
            df_detail = map_data.compute_industry_detail_lq(pref_code, city_code)
            if not df_detail.empty:
                import plotly.express as _px
                fig_detail = _px.bar(
                    df_detail.sort_values("lq", ascending=True),
                    x="lq", y="industry", orientation="h",
                    title=f"産業中分類 LQ（{_pref_name} {_city_name}）",
                    labels={"lq": "LQ", "industry": "産業中分類"},
                    color="lq",
                    color_continuous_scale=["#2166ac", "#f7f7f7", "#b2182b"],
                    color_continuous_midpoint=1.0,
                )
                fig_detail.add_vline(x=1.0, line_dash="dash", line_color="red")
                fig_detail.update_layout(height=max(400, len(df_detail) * 22))
                st.plotly_chart(fig_detail, use_container_width=True)

                st.subheader("詳細テーブル")
                st.dataframe(
                    df_detail.style.format({
                        "local_emp": "{:,.0f}",
                        "national_emp": "{:,.0f}",
                        "lq": "{:.3f}",
                        "basic_emp_estimate": "{:,.1f}",
                    }),
                    use_container_width=True,
                )
            else:
                st.info("産業中分類データがありません。")

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
    "分析手法: 経済基盤分析（LQ/EBM/PER）、シフトシェア分析、ギャップ分析 | "
    "データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ"
)
