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
from scorecard import build_scorecard, generate_insights


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


# Preload national rankings (cached, shared across tabs)
try:
    import map_data as _md
    _rankings = _md.get_prefecture_rankings()
except Exception:
    _rankings = {}

def _rank_label(metric: str) -> str:
    """Return '47都道府県中 第X位' string for current prefecture."""
    key = f"{metric}_rank"
    if key in _rankings and pref_code in _rankings[key]:
        r = _rankings[key][pref_code]
        return f"47都道府県中 第{r}位"
    return ""

def _trend_arrow() -> str:
    """Return ↑↓→ based on 2016->2021 employment change."""
    if "emp_change" in _rankings and pref_code in _rankings["emp_change"]:
        ch = _rankings["emp_change"][pref_code]
        if ch > 0:
            return "↑"
        elif ch < 0:
            return "↓"
    return "→"


tab_score, tab_lq, tab_ebm, tab_ss, tab_gap, tab_re, tab_map, tab_cross, tab_metro = st.tabs(
    ["⓪ 投資スコアカード", "① LQ・経済基盤", "② EBM・PER・予測",
     "③ シフトシェア分析", "④ 小売ギャップ分析", "⑤ 不動産取引価格",
     "⑥ 地図分析", "⑦ クロス分析", "⑧ 都市圏分析（MSA相当）"]
)


# ---------------------------------------------------------------------------
# Tab 0: Investment Scorecard
# ---------------------------------------------------------------------------

with tab_score:
    st.header("投資判断スコアカード")
    st.caption(f"対象: {_pref_name} {_city_name}")

    sc = build_scorecard(
        accessor, pref_code, city_code, basics,
        new_basic_jobs, persons_per_household,
        area_name=f"{_pref_name} {_city_name}",
    )

    # Row 0: Investment Suitability Score (large)
    if sc.suitability_score:
        _score = sc.suitability_score["total_score"]
        _score_color = "#2A9D8F" if _score >= 60 else "#D4A843" if _score >= 40 else "#E76F51"
        st.markdown(
            f"<h2 style='text-align:center;color:{_score_color}'>"
            f"投資適格スコア: {_score:.0f} / 100</h2>",
            unsafe_allow_html=True,
        )

    # 地理不整合の警告（KPIカード直上に目立つ形で表示）
    if sc.commute_distortion == "inflow":
        st.warning(
            f"⚠️ **通勤流入による数値膨張**: 雇用/人口 = {sc.emp_to_pop_ratio*100:.0f}% "
            f"（PER {sc.per:.2f}）。e-Stat経済センサスは事業所所在地ベースのため、"
            "通勤者が雇用に算入されEBM・基盤雇用が住民あたり過大に見えます。"
            "CI102の本来の分析単位はMSA（経済圏）です。"
        )
    elif sc.commute_distortion == "outflow":
        st.warning(
            f"⚠️ **ベッドタウン特性**: 雇用/人口 = {sc.emp_to_pop_ratio*100:.0f}% "
            f"（PER {sc.per:.2f}）。市内事業所での雇用が薄く、EBM が {sc.ebm:.1f} と"
            "異常に高い値を示しています。都市圏全体での再評価を推奨します。"
        )

    # Row 1: 7 KPI cards
    k1, k2, k3, k4, k5, k6, k7 = st.columns(7)
    _ebm_help = (
        "基盤雇用1単位が支える総雇用数。EBM = 1 / 基盤雇用比率（恒等式）。"
        "教科書 Orlando MSA: 4.94 / 全国市区町村中央値: 4.99 (大分類)。"
        "EBM 3-6 = 健全な多角化大都市圏。"
        "EBM > 8 = 基盤雇用が薄く分母小さく見かけ上膨張（必ずしも経済が強い意味ではない）。"
    )
    if sc.commute_distortion == "outflow":
        _ebm_help += f"\n\n⚠️ 通勤流出で過大値（{sc.ebm:.1f}）になっています。"
    _ebm_delta = None
    if sc.ebm_mid is not None:
        _ebm_delta = f"中分類: {sc.ebm_mid:.2f}"
    k1.metric("EBM", f"{sc.ebm:.2f}", delta=_ebm_delta, delta_color="off", help=_ebm_help)
    _per_help = "就業者1人あたりの総人口。CI102 Orlando例は 1.91。"
    if sc.commute_distortion == "inflow":
        _per_help += f"\n\n⚠️ 通勤流入で過小値（{sc.per:.2f}）になっています。"
    k2.metric("PER", f"{sc.per:.2f}", help=_per_help)
    _basic_delta = None
    if sc.basic_ratio_mid is not None:
        _basic_delta = f"中分類: {sc.basic_ratio_mid:.1f}%"
    k3.metric("基盤雇用比率", f"{sc.basic_ratio:.1f}%",
              delta=_basic_delta, delta_color="off",
              help="LQ>1.0 の産業の超過雇用合計を総雇用で割った比率。教科書 Orlando: 20.2%。")
    k4.metric("RS合計", f"{sc.rs_total:+,.0f}")
    k5.metric("小売漏損/余剰", f"{sc.aggregate_gap_factor:+.1f}")
    if sc.median_unit_price is not None:
        k6.metric("㎡単価中央値", f"¥{sc.median_unit_price:,.0f}")
    else:
        k6.metric("㎡単価中央値", "—")
    # Daytime population estimate
    from calculator import estimate_daytime_population
    _daytime = estimate_daytime_population(sc.population, sc.basic_emp)
    k7.metric("昼間人口推計", f"{_daytime:,.0f}", delta=f"{_daytime - sc.population:+,.0f}")

    st.divider()

    # Row 2: LQ industries (left) + RS tenant strategy + forecast (right)
    col_lq, col_rs = st.columns(2)

    with col_lq:
        # 大分類と中分類のトグル
        if sc.top_lq_industries_mid:
            granularity = st.radio(
                "業種粒度",
                options=["大分類17業種", f"中分類95業種（推奨）"],
                horizontal=True, key="lq_granularity",
                help="細かい分類ほど特化産業が見え、基盤雇用が正確に把握できます。",
            )
            use_mid = granularity.startswith("中分類")
        else:
            use_mid = False

        if use_mid:
            st.subheader(f"基盤産業 TOP 10 — 中分類95業種版")
            st.caption(
                f"中分類で再計算：基盤産業 {sc.n_basic_industries_mid} 業種 / "
                f"基盤雇用 {sc.basic_emp_mid:,.0f}人 / "
                f"基盤雇用比率 {sc.basic_ratio_mid:.1f}% / EBM {sc.ebm_mid:.2f}"
            )
            df_top_mid = pd.DataFrame(sc.top_lq_industries_mid)
            df_top_mid.columns = ["産業", "LQ", "基盤雇用推計"]
            st.dataframe(
                df_top_mid.style.format({"LQ": "{:.2f}", "基盤雇用推計": "{:,.0f}"}),
                use_container_width=True, hide_index=True,
            )
        else:
            st.subheader("基盤産業 TOP 5 — 大分類17業種版")
            if sc.top_lq_industries:
                df_top = pd.DataFrame(sc.top_lq_industries)
                df_top.columns = ["産業", "LQ", "基盤雇用推計"]
                st.dataframe(
                    df_top.style.format({"LQ": "{:.2f}", "基盤雇用推計": "{:,.0f}"}),
                    use_container_width=True, hide_index=True,
                )
            else:
                st.info("LQ > 1.0 の産業がありません。")

    with col_rs:
        # Actual trend
        st.subheader("実績トレンド（2016→2021）")
        st.metric(
            "雇用変化（実績）", f"{sc.actual_emp_change:+,.0f} 人",
            help="経済センサス 2016年→2021年の産業別従業者数の実際の変化合計",
        )
        if sc.top_rs_industry:
            st.markdown(
                f"**競争力トップ産業**: {sc.top_rs_industry}"
                f"（RS = {sc.top_rs_value:+,.0f}）"
            )

        # Simulation (clearly labeled)
        st.caption(f"--- シミュレーション: 基盤雇用 {new_basic_jobs:+,}人の場合 ---")
        f1, f2, f3 = st.columns(3)
        f1.metric("総雇用波及", f"{sc.total_emp_forecast:+,.0f}")
        f2.metric("人口波及", f"{sc.population_forecast:+,.0f}")
        f3.metric("住宅需要", f"{sc.housing_demand:+,.0f} 戸")

    st.divider()

    # Row 2.5: Tenant strategy from RS
    if sc.ss_df is not None and not sc.ss_df.empty:
        st.subheader("RS分析に基づくテナント戦略")
        from data.industry_property_map import derive_property_demand, PROPERTY_ICONS
        prop_demand = derive_property_demand(sc.ss_df)
        if prop_demand:
            cols = st.columns(min(len(prop_demand), 4))
            for i, (ptype, industries) in enumerate(prop_demand.items()):
                with cols[i % len(cols)]:
                    icon = PROPERTY_ICONS.get(ptype, "📋")
                    total_rs = sum(ind["rs"] for ind in industries)
                    st.markdown(f"### {icon} {ptype}")
                    st.metric("RS合計", f"{total_rs:+,.0f}")
                    for ind in industries[:3]:
                        st.caption(f"  {ind['industry']}（RS={ind['rs']:+,.0f}）")
        else:
            st.info("RS > 0 の産業がないため、テナント戦略を導出できません。")

        st.divider()

    # Row 3: Auto-generated insights
    st.subheader("投資シグナル")
    insights = generate_insights(sc)
    for ins in insights:
        if ins["level"] == "success":
            st.success(ins["text"])
        elif ins["level"] == "warning":
            st.warning(ins["text"])
        else:
            st.info(ins["text"])

    if not insights:
        st.info("特筆すべきシグナルはありません。")

    # --- AI Analysis ---
    st.divider()
    st.subheader("AI分析（Claude） + Proformer物件連携")

    from config import get_settings
    _settings = get_settings()

    # --- Proformer integration (API key from .env, external_id from UI) ---
    _proformer_data = None
    if _settings.has_proformer_key:
        with st.expander("Proformer 物件データ連携", expanded=False):
            st.caption(
                "Proformer不動産投資診断プロの物件データIDを入力すると、"
                "DCF分析結果を取得し地域分析と統合します。"
            )
            pf_external_id = st.text_input(
                "物件データID（external_id）",
                placeholder="例: 7e3215f5-a7e0-436e-8092-9568cd383cd7",
                key="pf_external_id",
            )

            if pf_external_id:
                if st.button("Proformerデータ取得", key="pf_fetch_btn"):
                    from api.proformer import fetch_proformer_analysis
                    with st.spinner("Proformer APIからデータ取得中..."):
                        pf_result = fetch_proformer_analysis(
                            _settings.proformer_api_key, pf_external_id,
                        )
                    if pf_result:
                        st.session_state["proformer"] = pf_result
                    else:
                        st.error("データの取得に失敗しました。物件データIDを確認してください。")

            if "proformer" in st.session_state:
                pf = st.session_state["proformer"]
                st.success(f"物件: {pf.property.name}（{pf.property.location}）")
                pm1, pm2, pm3, pm4 = st.columns(4)
                pm1.metric("取得価格", f"¥{pf.property.acquisition_price:,.0f}")
                pm2.metric("NOI", f"¥{pf.noi_annual:,.0f}")
                pm3.metric("Cap Rate", f"{pf.performance.cap_rate:.1%}")
                pm4.metric("IRR", f"{pf.performance.irr:.1%}")

                pn1, pn2, pn3, pn4 = st.columns(4)
                pn1.metric("NPV", f"¥{pf.performance.npv:,.0f}")
                pn2.metric("DSCR", f"{pf.financing.dscr:.2f}")
                pn3.metric("LTV", f"{pf.financing.ltv:.0%}")
                pn4.metric("空室率", f"{pf.income.vacancy_rate:.1f}%")

                _proformer_data = pf.raw

    # --- AI Analysis ---
    if _settings.has_anthropic_key:
        ai_label = "AI統合分析を生成（地域 + 物件）" if _proformer_data else "AI分析を生成"
        if st.button(ai_label, key="ai_btn"):
            from ai_analysis import call_claude_api
            with st.spinner("Claude APIで分析中..."):
                result = call_claude_api(
                    sc, _settings.anthropic_api_key,
                    proformer_data=_proformer_data,
                )
            if result:
                st.session_state["ai_analysis"] = result
            else:
                st.error("AI分析の生成に失敗しました。APIキーを確認してください。")

        if "ai_analysis" in st.session_state:
            st.markdown(st.session_state["ai_analysis"])
            st.caption(
                "この分析はAIが生成したものです。過去のスナップショットデータに基づいており、"
                "リアルタイムの市場状況を反映していません。"
                "投資判断は専門家の助言を得た上で行ってください。"
            )
    else:
        st.info(
            "AI分析を利用するには `.env` に `ANTHROPIC_API_KEY` を設定してください。"
            " 取得: https://console.anthropic.com/"
        )

    # PDF Report Download
    st.divider()
    try:
        from report_generator import generate_pdf
        _ai_text = st.session_state.get("ai_analysis")
        pdf_bytes = generate_pdf(sc, insights, ai_analysis=_ai_text)
        st.download_button(
            label="PDFレポートをダウンロード",
            data=pdf_bytes,
            file_name=f"investment_report_{_pref_name}_{_city_name}.pdf",
            mime="application/pdf",
        )
    except Exception as e_pdf:
        st.caption(f"PDF生成エラー: {e_pdf}")

    # Data disclaimer
    with st.expander("ℹ️ データの時点と制限", expanded=True):
        st.caption(
            "経済センサス: 2021年6月時点（5年ごと更新、次回2026年）\n"
            "国勢調査: 2020年10月時点（人口は2015年組替値）\n"
            "MLIT取引価格: 選択した四半期の実績（リアルタイムではない）\n"
            "これらは過去のスナップショットであり、"
            "現在の市場状況と異なる可能性があります。"
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
    c1.metric(
        f"総従業者数 {_rank_label('total_emp')}",
        f"{int(total_emp):,}",
        delta=f"{_trend_arrow()} 2016→2021",
    )
    c2.metric("推計基盤雇用", f"{int(basic_total):,}")
    _br = basic_total / total_emp * 100 if total_emp > 0 else 0
    c3.metric(
        f"基盤雇用比率 {_rank_label('basic_ratio')}",
        f"{_br:.1f}%",
    )

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

    # --- Shift-Share integration (SPEC_v2 Phase 2.2) ---
    st.divider()
    st.subheader("シフトシェア統合 — 競争力分析")
    try:
        l0, l1, n0, n1, ss_src = accessor.shift_share_inputs(pref_code, city_code)
        df_ss_tab1 = shift_share_table(l0, l1, n0, n1)
        if not df_ss_tab1.empty:
            # Investment signal matrix: LQ vs RS
            merged = df_lq[["industry", "lq"]].merge(
                df_ss_tab1[["industry", "regional_shift", "actual_change"]],
                on="industry", how="inner",
            )
            if not merged.empty:
                st.markdown("**投資シグナル 4象限**")
                sig_cols = st.columns(4)
                best = merged[(merged["lq"] > 1.0) & (merged["regional_shift"] > 0)]
                caution = merged[(merged["lq"] > 1.0) & (merged["regional_shift"] <= 0)]
                growing = merged[(merged["lq"] <= 1.0) & (merged["regional_shift"] > 0)]
                declining = merged[(merged["lq"] <= 1.0) & (merged["regional_shift"] <= 0)]

                sig_cols[0].metric("最優良（LQ>1 & RS>0）", f"{len(best)}")
                sig_cols[1].metric("要警戒（LQ>1 & RS<0）", f"{len(caution)}")
                sig_cols[2].metric("成長中（LQ<1 & RS>0）", f"{len(growing)}")
                sig_cols[3].metric("衰退（LQ<1 & RS<0）", f"{len(declining)}")

                if not best.empty:
                    st.success(
                        "最優良産業: "
                        + ", ".join(f"{r['industry']}(LQ={r['lq']:.2f}, RS={r['regional_shift']:+,.0f})"
                                    for _, r in best.iterrows())
                    )
                if not caution.empty:
                    st.warning(
                        "要警戒: "
                        + ", ".join(f"{r['industry']}(LQ={r['lq']:.2f}, RS={r['regional_shift']:+,.0f})"
                                    for _, r in caution.iterrows())
                    )
    except Exception:
        pass


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
    c1.metric(f"経済基盤乗数 EBM {_rank_label('ebm')}", f"{ebm:.2f}", help="基盤雇用1単位が支える総雇用数")
    c2.metric(f"人口雇用比率 PER {_rank_label('per')}", f"{per:.2f}", help="就業者1人あたりの総人口")

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

    # --- Property Scale Conversion ---
    st.divider()
    st.subheader("不動産開発スケール換算")

    from calculator import forecast_required_floor_area, forecast_building_count

    ps1, ps2, ps3 = st.columns(3)
    avg_unit_size = ps1.number_input(
        "平均住戸面積（m2）", min_value=20.0, max_value=200.0,
        value=65.0, step=5.0, key="avg_unit_size",
    )
    floors_per_bldg = ps2.number_input(
        "建物階数", min_value=1, max_value=50,
        value=5, step=1, key="floors_per_bldg",
    )
    units_per_floor = ps3.number_input(
        "1フロア戸数", min_value=1, max_value=20,
        value=4, step=1, key="units_per_floor",
    )

    floor_area = forecast_required_floor_area(delta_households, avg_unit_size)
    bldg_count = forecast_building_count(delta_households, floors_per_bldg, units_per_floor)

    # Waterfall chart
    fig_wf = go.Waterfall(
        orientation="v",
        measure=["absolute", "relative", "relative", "relative", "total", "total"],
        x=[
            "基盤雇用",
            f"×EBM {ebm:.1f}",
            f"×PER {per:.1f}",
            f"÷世帯人員 {persons_per_household:.1f}",
            "延床面積 (m2)",
            "必要棟数",
        ],
        y=[
            new_basic_jobs,
            delta_total_emp - new_basic_jobs,
            delta_population - delta_total_emp,
            delta_households - delta_population,
            floor_area,
            bldg_count,
        ],
        text=[
            f"{new_basic_jobs:+,}人",
            f"{delta_total_emp:+,.0f}人",
            f"{delta_population:+,.0f}人",
            f"{delta_households:+,.0f}戸",
            f"{floor_area:,.0f}m2",
            f"{bldg_count:.1f}棟",
        ],
        textposition="outside",
        connector={"line": {"color": "#6B7280"}},
        increasing={"marker": {"color": "#2A9D8F"}},
        decreasing={"marker": {"color": "#E76F51"}},
        totals={"marker": {"color": "#1B2A4A"}},
    )
    fig_waterfall = go.Figure(data=[fig_wf])
    fig_waterfall.update_layout(
        title="EBM/PER カスケード → 不動産開発規模",
        showlegend=False,
        height=450,
    )
    st.plotly_chart(fig_waterfall, use_container_width=True)

    r1, r2 = st.columns(2)
    r1.metric("必要延床面積", f"{floor_area:,.0f} m2")
    r2.metric(
        f"必要棟数（{floors_per_bldg}階建×{units_per_floor}戸/フロア）",
        f"{bldg_count:.1f} 棟",
    )

    # --- Development Feasibility (Front-door/Back-door) ---
    st.divider()
    st.subheader("開発フィジビリティ（Front-door / Back-door）")

    from calculator import development_feasibility

    fz1, fz2, fz3 = st.columns(3)
    _land_price = fz1.number_input(
        "想定土地単価（円/㎡）", min_value=1000, max_value=5_000_000,
        value=100_000, step=10_000, key="land_price",
    )
    _construction_cost = fz2.number_input(
        "建設単価（円/㎡）", min_value=50_000, max_value=1_000_000,
        value=250_000, step=10_000, key="construction_cost",
    )
    _target_yield = fz3.number_input(
        "目標利回り（%）", min_value=1.0, max_value=20.0,
        value=5.0, step=0.5, key="target_yield",
    ) / 100

    feas = development_feasibility(
        housing_demand=delta_households,
        avg_unit_size_m2=avg_unit_size,
        land_price_per_m2=_land_price,
        construction_cost_per_m2=_construction_cost,
        target_yield=_target_yield,
    )

    fd_col, bd_col = st.columns(2)
    with fd_col:
        st.markdown("**Front-door（需要側）**")
        st.metric("必要延床面積", f"{feas['front_door']['required_area_m2']:,.0f} m2")
        st.metric("総開発コスト", f"¥{feas['front_door']['total_dev_cost']:,.0f}")
        st.metric("必要年間賃料収入", f"¥{feas['front_door']['required_annual_rent']:,.0f}")
    with bd_col:
        st.markdown("**Back-door（供給側）**")
        st.metric("必要月額賃料単価", f"¥{feas['back_door']['monthly_rent_per_m2']:,.0f} /m2")
        st.metric("最大取得価格/戸", f"¥{feas['back_door']['max_price_per_unit']:,.0f}")
        st.metric("土地コスト比率", f"{feas['back_door']['land_cost_ratio']:.1f}%")


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

    # KPI cards for gap analysis
    _n_leak = int((df_gap["factor"] >= 10).sum())
    _n_surplus = int((df_gap["factor"] <= -10).sum())
    _max_leak_row = df_gap.loc[df_gap["factor"].idxmax()] if not df_gap.empty else None
    gk1, gk2, gk3 = st.columns(3)
    gk1.metric("漏損セクター数", f"{_n_leak} / {len(df_gap)}")
    gk2.metric("余剰セクター数", f"{_n_surplus} / {len(df_gap)}")
    if _max_leak_row is not None:
        gk3.metric("最大漏損セクター", f"{_max_leak_row['sector']}", delta=f"{_max_leak_row['factor']:+.1f}")

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

    # --- Office/Industrial Gap Analysis ---
    st.divider()
    st.subheader("オフィス・工業ギャップ分析（従業者数ベース）")
    try:
        from calculator import office_industrial_gap
        _local_emp_gap, _national_emp_gap, _ = accessor.industry_employment(pref_code, city_code)
        _oi_gap = office_industrial_gap(
            _local_emp_gap, _national_emp_gap,
            basics["population"],
            # National population approximation from total employment * avg PER
            sum(_national_emp_gap.values()) * 1.8,
        )
        if _oi_gap:
            df_oi = pd.DataFrame(_oi_gap)
            fig_oi = go.Figure()
            fig_oi.add_trace(go.Bar(
                x=df_oi["gap_pct"], y=df_oi["property_type"],
                orientation="h", marker_color="#1B2A4A",
                hovertemplate="%{y}: %{x:+.1f}%<extra></extra>",
            ))
            fig_oi.add_vline(x=0, line_dash="dash", line_color="#6B7280")
            fig_oi.update_layout(
                title="物件用途別 雇用ギャップ（正=集積超過、負=不足）",
                xaxis_title="ギャップ率（%）",
                height=350,
            )
            fig_oi.add_annotation(x=df_oi["gap_pct"].max() * 0.5, y=1.05,
                                 text="集積超過 → テナント需要↑", showarrow=False,
                                 xref="x", yref="paper", font=dict(color="#2A9D8F"))
            fig_oi.add_annotation(x=df_oi["gap_pct"].min() * 0.5, y=1.05,
                                 text="← 雇用不足 テナント需要↓", showarrow=False,
                                 xref="x", yref="paper", font=dict(color="#E76F51"))
            st.plotly_chart(fig_oi, use_container_width=True)

            st.dataframe(
                df_oi.rename(columns={
                    "property_type": "物件用途", "local_emp": "地域雇用",
                    "expected_emp": "期待雇用（人口按分）", "gap": "ギャップ",
                    "gap_pct": "ギャップ率(%)",
                }).style.format({
                    "地域雇用": "{:,.0f}", "期待雇用（人口按分）": "{:,.0f}",
                    "ギャップ": "{:+,.0f}", "ギャップ率(%)": "{:+.1f}%",
                }),
                use_container_width=True, hide_index=True,
            )
    except Exception:
        pass


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

                # --- 時系列トレンド（直近8四半期） ---
                st.subheader("㎡単価トレンド（直近8四半期）")
                try:
                    trend_data = []
                    # Build list of 8 quarters going back from selected quarter
                    _ty, _tq = re_year, re_quarter
                    for _ in range(8):
                        _df_q = mlit_client.transaction_prices(
                            year=_ty, quarter=_tq,
                            pref_code=pref_code, city_code=_mlit_city,
                        )
                        if _df_q is not None and not _df_q.empty:
                            _prices = pd.to_numeric(_df_q.get("UnitPrice", pd.Series()), errors="coerce")
                            _valid = _prices[_prices > 0]
                            trend_data.append({
                                "period": f"{_ty}Q{_tq}",
                                "median_price": float(_valid.median()) if not _valid.empty else None,
                                "count": len(_df_q),
                            })
                        else:
                            trend_data.append({"period": f"{_ty}Q{_tq}", "median_price": None, "count": 0})
                        # Go back 1 quarter
                        _tq -= 1
                        if _tq < 1:
                            _tq = 4
                            _ty -= 1

                    df_trend = pd.DataFrame(trend_data[::-1])  # chronological order
                    df_trend = df_trend.dropna(subset=["median_price"])

                    if len(df_trend) >= 2:
                        from plotly.subplots import make_subplots
                        fig_trend = make_subplots(specs=[[{"secondary_y": True}]])
                        fig_trend.add_trace(
                            go.Bar(x=df_trend["period"], y=df_trend["count"],
                                   name="取引件数", marker_color="#D4A843", opacity=0.5),
                            secondary_y=False,
                        )
                        fig_trend.add_trace(
                            go.Scatter(x=df_trend["period"], y=df_trend["median_price"],
                                       name="㎡単価中央値", mode="lines+markers",
                                       line=dict(color="#1B2A4A", width=3)),
                            secondary_y=True,
                        )
                        fig_trend.update_layout(
                            title="㎡単価中央値（折れ線）× 取引件数（棒）",
                            height=400,
                            legend=dict(orientation="h", y=-0.15),
                        )
                        fig_trend.update_yaxes(title_text="取引件数", secondary_y=False)
                        fig_trend.update_yaxes(title_text="㎡単価（円/㎡）", secondary_y=True)
                        st.plotly_chart(fig_trend, use_container_width=True)

                        # YoY comparison for KPI
                        latest = df_trend.iloc[-1]["median_price"]
                        yoy_row = df_trend[df_trend["period"] == f"{re_year - 1}Q{re_quarter}"]
                        if not yoy_row.empty:
                            prev = yoy_row.iloc[0]["median_price"]
                            if prev and prev > 0:
                                yoy_pct = (latest - prev) / prev * 100
                                st.metric(
                                    "前年同期比（㎡単価）",
                                    f"{latest:,.0f} 円/㎡",
                                    delta=f"{yoy_pct:+.1f}%",
                                )
                    else:
                        st.info("トレンド表示には2四半期以上のデータが必要です。")
                except Exception as e_trend:
                    st.warning(f"時系列データ取得中にエラー: {e_trend}")

                # --- 取引データテーブル（日本語カラム名） ---
                st.subheader("取引データ")
                display_df = df_re.rename(columns={k: v for k, v in _MLIT_COLS.items() if k in df_re.columns})
                st.dataframe(display_df, use_container_width=True)
            else:
                st.info("指定期間の取引データがありません。")
        except Exception as e:
            st.error(f"データ取得エラー: {e}")
        # --- Mueller Market Cycle ---
        st.divider()
        st.subheader("Mueller不動産市場サイクル")
        try:
            from mueller_cycle import compute_mueller_cycle, mueller_cycle_chart, classify_cycle_phase
            _mlit_city_mc = city_code if city_code and city_code % 1000 != 0 else None
            df_mc = compute_mueller_cycle(pref_code, _mlit_city_mc)
            if len(df_mc) >= 3:
                fig_mc = mueller_cycle_chart(df_mc, f"{_pref_name} {_city_name}")
                st.plotly_chart(fig_mc, use_container_width=True)

                latest_mc = df_mc.dropna(subset=["price_change_pct", "volume_change_pct"]).iloc[-1]
                phase = classify_cycle_phase(
                    latest_mc["price_change_pct"], latest_mc["volume_change_pct"],
                )
                st.metric("現在のサイクルフェーズ", phase)
            else:
                st.info("Mueller分析には3四半期以上のデータが必要です。")
        except Exception as e_mc:
            st.warning(f"Mueller分析エラー: {e_mc}")

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
        "市区町村セグメンテーション",
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

            with st.expander("ℹ️ この地図の見方", expanded=True):
                st.markdown("""
赤い地域ほどLQが高く（集積度が高い）、青い地域ほどLQが低い。
LQ = 1.0（白）が全国平均水準。特定の産業を選択すると、
その産業がどの都道府県に集積しているかを一目で把握できます。
                """)

        elif map_view == "シフトシェア RS マップ — 都道府県":
            st.subheader("地域シフト（RS）合計 全国マップ")
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
            with st.expander("ℹ️ この地図の見方", expanded=True):
                st.markdown("""
**緑**の地域は地域シフト(RS)合計が正 = 全国トレンドを上回る競争優位を持つ。
**赤**の地域はRS合計が負 = 全国の同産業と比べ雇用が減少傾向。
期間: 2016年 → 2021年（経済センサス活動調査）。
                """)

        elif map_view == "小売ギャップマップ — 都道府県":
            st.subheader("小売 漏損/余剰係数 全国マップ")
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
            with st.expander("ℹ️ この地図の見方", expanded=True):
                st.markdown("""
**緑**（正の係数）= 漏損（Leakage）: 購買力が域外に流出 → 出店機会あり。
**赤**（負の係数）= 余剰（Surplus）: 域内供給が需要を上回る → 競争過多。
需要は人口 × 全国平均1人あたり小売支出額で按分推計。
                """)

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

            with st.expander("ℹ️ この地図の見方", expanded=True):
                st.markdown("""
サイドバーで選択中の都道府県内の市区町村を地図表示します。
特定産業を選ぶと、その産業のLQが市区町村ごとにどう違うかを可視化できます。
県庁所在地と郊外で産業構造がどう異なるかを確認できます。
                """)

        elif map_view == "産業中分類ドリルダウン":
            st.subheader("産業中分類 LQ ドリルダウン")
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
            with st.expander("ℹ️ この分析の意味", expanded=True):
                st.markdown("""
産業大分類（例:「製造業」）の中をさらに細かい中分類（例:「食料品製造業」
「輸送用機械器具製造業」等）で分解し、具体的にどのサブセクターに
特化しているかを特定します。投資判断のためのテナントターゲティングに活用できます。
                """)

        elif map_view == "市区町村セグメンテーション":
            st.subheader(f"{_pref_name} 市区町村セグメンテーション")
            try:
                from segmentation import compute_prefecture_segmentation, SEGMENTS
                df_seg = compute_prefecture_segmentation(pref_code)
                if not df_seg.empty:
                    # Segment count summary
                    seg_counts = df_seg["segment"].value_counts()
                    seg_cols = st.columns(min(len(seg_counts), 6))
                    for i, (seg_name, count) in enumerate(seg_counts.items()):
                        seg_info = SEGMENTS.get(seg_name, {})
                        seg_cols[i % len(seg_cols)].metric(
                            f"{seg_info.get('icon', '')} {seg_name}",
                            f"{count} 市区町村",
                        )

                    # Table with segment details
                    st.dataframe(
                        df_seg[["area_name", "segment", "total_emp", "population"]]
                        .rename(columns={
                            "area_name": "市区町村", "segment": "セグメント",
                            "total_emp": "従業者数", "population": "人口",
                        })
                        .style.format({"従業者数": "{:,}", "人口": "{:,}"}),
                        use_container_width=True, hide_index=True,
                    )

                    with st.expander("ℹ️ セグメントの定義", expanded=True):
                        for name, info in SEGMENTS.items():
                            st.markdown(f"**{info['icon']} {name}**: {info['desc']}")
                else:
                    st.info("セグメンテーションデータがありません。")
            except Exception as e_seg:
                st.warning(f"セグメンテーションエラー: {e_seg}")

    except FileNotFoundError:
        st.error("GeoJSON ファイルが見つかりません（data/japan_prefectures.geojson）。")
    except Exception as e:
        st.error(f"地図データの処理中にエラーが発生しました: {e}")
        st.exception(e)

# ---------------------------------------------------------------------------
# Tab 7: Cross-Analysis
# ---------------------------------------------------------------------------

with tab_cross:
    st.header("小売ギャップ × 取引価格 クロス分析")

    with st.expander("ℹ️ この分析の読み方", expanded=True):
        st.markdown("""
47都道府県を「小売漏損/余剰係数」（横軸）と「㎡単価中央値」（縦軸）の
2軸にプロットし、投資機会を4象限で分類します。

**右下（緑）= 需要あり × 安い → 最優先投資候補**
- 漏損が大きい（購買力が流出）のに不動産が安い地域。出店の好機。

**右上（黄）= 需要あり × 高い → エントリーコスト注意**
- 需要はあるが不動産が高い。利回りの精査が必要。

**左下（灰）= 余剰 × 安い → 様子見**
- 供給過多で不動産も安い。構造的な問題の可能性。

**左上（赤）= 余剰 × 高い → 回避**
- 供給過多なのに不動産が高い。最もリスクが高い象限。

色はEBM（経済基盤乗数）を示します。色が明るいほど乗数効果が大きい地域です。
        """)

    try:
        from cross_analysis import compute_cross_gap_price, scatter_gap_vs_price

        df_cross = compute_cross_gap_price()
        if not df_cross.empty:
            fig_cross = scatter_gap_vs_price(df_cross, highlight_pref_code=pref_code)
            st.plotly_chart(fig_cross, use_container_width=True)

            st.subheader("データテーブル")
            st.dataframe(
                df_cross.sort_values("aggregate_factor", ascending=False)
                .style.format({
                    "aggregate_factor": "{:+.1f}",
                    "median_unit_price": "¥{:,.0f}",
                    "ebm": "{:.2f}",
                }),
                use_container_width=True,
            )
        else:
            st.warning(
                "クロス分析データを生成できませんでした。"
                "MLIT APIキーが設定されているか確認してください。"
            )
    except Exception as e:
        st.error(f"クロス分析の処理中にエラーが発生しました: {e}")
        st.exception(e)


# ---------------------------------------------------------------------------
# Tab 8: 都市圏（MSA相当）分析
# ---------------------------------------------------------------------------

with tab_metro:
    st.header("都市圏分析（MSA相当）")
    st.markdown("""
**目的**: CI102 の経済基盤理論は MSA（Metropolitan Statistical Area = 通勤経済圏）を前提とします。
日本の市町村単位だと、通勤流入（千代田区など）や流出（横浜・神戸など）で EBM・基盤雇用・PER が著しく歪みます。
本タブは複数の都道府県を合算して**経済圏として再評価**します。
    """)

    from data.codes import METROPOLITAN_AREAS, get_metro_area_options

    metro_options = get_metro_area_options()
    metro_key = st.selectbox(
        "都市圏を選択",
        options=[k for k, _ in metro_options],
        format_func=lambda k: next(n for kk, n in metro_options if kk == k),
        index=0,
    )

    metro_info = METROPOLITAN_AREAS[metro_key]
    pref_names = [ALL_PREFECTURES[pc] for pc in metro_info["prefectures"]]
    st.caption(f"構成: {' + '.join(pref_names)} ｜ {metro_info['note']}")

    try:
        metro_basics_data = accessor.metro_basics(metro_info["prefectures"])
        local_emp_m, national_emp_m, src_label = accessor.metro_industry_employment(
            metro_info["prefectures"]
        )

        df_lq_m = lq_table(local_emp_m, national_emp_m)
        basic_m = total_basic_employment(df_lq_m)
        total_emp_m = float(df_lq_m["local_emp"].sum())
        ebm_m = economic_base_multiplier(total_emp_m, basic_m)
        per_m = population_employment_ratio(
            metro_basics_data["population"], metro_basics_data["total_employment"]
        )
        basic_ratio_m = basic_m / total_emp_m * 100 if total_emp_m > 0 else 0

        st.caption(f"データソース: {src_label}")

        # KPI cards
        st.subheader("経済圏 KPI")
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("人口", f"{metro_basics_data['population']:,}")
        c2.metric("総雇用", f"{int(total_emp_m):,}")
        c3.metric("PER", f"{per_m:.2f}",
                  help="教科書Orlando MSA: 1.91")
        c4.metric("EBM", f"{ebm_m:.2f}",
                  help="教科書Orlando MSA: 4.94")
        c5.metric("基盤雇用比率", f"{basic_ratio_m:.1f}%",
                  help="教科書Orlando MSA: 20.2%")

        # 教科書値との比較
        st.markdown("**教科書（Orlando MSA）との比較**")
        comparison_df = pd.DataFrame({
            "指標": ["PER", "EBM", "基盤雇用比率"],
            "Orlando MSA": [1.91, 4.94, 20.2],
            f"この都市圏 ({metro_info['name']})": [per_m, ebm_m, basic_ratio_m],
            "判定": [
                "✅ 健全" if 1.5 <= per_m <= 2.5 else "⚠️ 範囲外",
                "✅ 健全" if 3.0 <= ebm_m <= 6.0 else "⚠️ 範囲外",
                "✅ 健全" if 15.0 <= basic_ratio_m <= 30.0 else "⚠️ 範囲外",
            ],
        })
        st.dataframe(comparison_df, use_container_width=True, hide_index=True)

        # 基盤産業
        st.subheader(f"{metro_info['name']} の基盤産業（LQ > 1.0）")
        basic_df = df_lq_m[df_lq_m["lq"] > 1.0].copy()
        if not basic_df.empty:
            basic_df = basic_df.rename(columns={
                "industry": "産業",
                "local_emp": "都市圏雇用",
                "lq": "LQ",
                "basic_emp_estimate": "基盤雇用推計",
            })[["産業", "都市圏雇用", "LQ", "基盤雇用推計"]]
            st.dataframe(
                basic_df.style.format({
                    "都市圏雇用": "{:,.0f}",
                    "LQ": "{:.2f}",
                    "基盤雇用推計": "{:,.0f}",
                }),
                use_container_width=True, hide_index=True,
            )
        else:
            st.info("LQ > 1.0 の産業がありません。")

        # 全都市圏比較表
        with st.expander("ℹ️ 全都市圏一覧で比較する"):
            rows = []
            for k, info in METROPOLITAN_AREAS.items():
                b = accessor.metro_basics(info["prefectures"])
                lo, na, _ = accessor.metro_industry_employment(info["prefectures"])
                dl = lq_table(lo, na)
                bs = total_basic_employment(dl)
                te = float(dl["local_emp"].sum())
                rows.append({
                    "都市圏": info["name"],
                    "人口": b["population"],
                    "総雇用": int(te),
                    "PER": round(population_employment_ratio(b["population"], b["total_employment"]), 2),
                    "EBM": round(economic_base_multiplier(te, bs), 2),
                    "基盤雇用比率(%)": round(bs / te * 100 if te > 0 else 0, 1),
                    "基盤雇用": int(bs),
                })
            comparison_all = pd.DataFrame(rows)
            st.dataframe(
                comparison_all.style.format({
                    "人口": "{:,}",
                    "総雇用": "{:,}",
                    "基盤雇用": "{:,}",
                }),
                use_container_width=True, hide_index=True,
            )

    except Exception as e:
        st.error(f"都市圏分析の処理中にエラーが発生しました: {e}")
        st.exception(e)


# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------

st.divider()
st.caption(
    "分析手法: 経済基盤分析（LQ/EBM/PER）、シフトシェア分析、ギャップ分析 | "
    "データ: e-Stat 経済センサス活動調査 2021 / 国勢調査 2020 / 国土交通省不動産情報ライブラリ"
)
