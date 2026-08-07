"""AI-powered investment analysis using Claude API.

CLAUDE.md rule: API clients are created inside functions, not at module level.
"""
from __future__ import annotations

import json
from typing import Optional

from scorecard import ScorecardData


def _scorecard_to_dict(sc: ScorecardData) -> dict:
    """Convert ScorecardData to a JSON-serializable dict for the prompt."""
    return {
        "area_name": sc.area_name,
        "population_2025": sc.population,
        "households_2025": sc.households,
        "population_momentum_2020_2025": {
            "pop_change_pct": sc.pop_change_pct,
            "household_change_pct": sc.hh_change_pct,
            "national_pop_change_pct": sc.pop_change_pct_national,
            "vs_national_gap_pt": sc.pop_momentum_gap,
            "class": sc.pop_momentum_class,
            "note": ("2020→2025の実測増減（総務省 令和7年国勢調査 人口速報集計, "
                     "2026年5月公表）。需要側の直近実測トレンドであり予測ではない。"),
        },
        "total_employment_2021": sc.total_employment,
        "ebm": round(sc.ebm, 2),
        "per": round(sc.per, 2),
        "basic_emp": round(sc.basic_emp, 0),
        "basic_ratio_pct": round(sc.basic_ratio, 1),
        "top_lq_industries": sc.top_lq_industries,
        "rs_total": round(sc.rs_total, 0),
        "top_rs_industry": sc.top_rs_industry,
        "top_rs_value": round(sc.top_rs_value, 0),
        "actual_employment_change_2016_2021": round(sc.actual_emp_change, 0),
        "aggregate_gap_factor": round(sc.aggregate_gap_factor, 1),
        "num_leakage_sectors": sc.num_leakage_sectors,
        "num_surplus_sectors": sc.num_surplus_sectors,
        "median_unit_price_yen_m2": sc.median_unit_price,
        "simulation": {
            "assumption": f"基盤雇用が{sc.new_basic_jobs_assumption:+,}人変動した場合",
            "is_prediction": False,
            "total_emp_change": round(sc.total_emp_forecast, 0),
            "population_change": round(sc.population_forecast, 0),
            "housing_demand": round(sc.housing_demand, 0),
        },
    }


SYSTEM_PROMPT = """\
あなたはCCIM CI102（不動産投資のための市場分析）に精通した不動産市場アナリストです。
以下の地域経済データを分析し、不動産投資の観点から示唆を提供してください。

## 最重要ルール: シミュレーションと実績の区別

データ内の `simulation` セクションは「基盤雇用がN人増えたら」という
**仮定に基づくWhat-Ifシミュレーション**であり、予測や見通しではない。
これを「需要成長が見込まれる」「人口増加が予測される」と書いてはならない。

正しい表現: 「仮に基盤雇用が+100人増加した場合、EBM乗数効果により
総雇用+X人、人口+X人、住宅需要+X戸への波及が想定される」

一方、`actual_employment_change_2016_2021` は2016→2021年の実測値。
実際に雇用が増えたのか減ったのかはこの数値で判断すること。
実績がマイナスなら「雇用は減少トレンドにある」と明記すること。

## 出力フォーマット（日本語、Markdown）
### 総合評価
1-2文で地域の投資適格性を要約。実績トレンドに基づくこと。

### 実績トレンド（2016→2021）
- 雇用の実際の増減とその意味

### 人口モメンタム（2020→2025 実測）
- population_momentum_2020_2025 を用い、需要側でこの市場が伸びているか縮んでいるかを断定的に述べる
- 全国平均（national_pop_change_pct）と比較し相対的な強弱を示す
- 人口と世帯の乖離（単身化・世帯細分化）があれば賃貸/住戸タイプへの含意を述べる

### 機会（Opportunities）
- 箇条書きで具体的な投資機会を3つ以内

### リスク（Risks）
- 箇条書きで主要リスクを3つ以内

### シミュレーション結果の読み方
- What-Ifの前提条件を明記し、「もし〜なら」の形で記述

### 推奨アクション
- 具体的な次のステップを2-3個

## データの制約（必ず言及すること）
- 人口・世帯数は2025年国勢調査 人口速報集計（2026年5月公表）の直近実測値
- population_momentum_2020_2025 は2020→2025の実測増減率（予測ではなく確定的な直近トレンド）
- 経済センサス（雇用・LQ・EBM・シフトシェア）: 2021年6月時点（次回2026年実施）
- 供給側指標(EBM/PER/LQ=2021)と需要側指標(人口モメンタム=2025)には時点差がある。
  両者を突き合わせ、「雇用構造は強いが人口は縮小」等の不整合があれば明示すること
- MLIT取引価格: 特定四半期の実績

## 用語
- LQ > 1.0: 基盤産業（域外から資金を呼ぶ）
- EBM: 経済基盤乗数（基盤雇用1人が支える総雇用数）
- PER: 人口雇用比率
- RS（地域シフト）: 正=全国平均を上回る競争力、負=劣位
- 漏損係数 正: 購買力流出=出店機会、負: 供給過多

簡潔に、投資家が行動に移せる具体性で回答してください。"""


def build_analysis_prompt(
    sc: ScorecardData,
    proformer_data: Optional[dict] = None,
) -> tuple[str, str]:
    """Build (system_prompt, user_message) for Claude API.

    If proformer_data is provided, include property-level DCF analysis
    for an integrated macro × micro investment judgment.
    """
    data = _scorecard_to_dict(sc)
    user_msg = (
        f"以下の地域経済データを分析してください。\n\n"
        f"**対象地域**: {sc.area_name}\n\n"
        f"```json\n{json.dumps(data, ensure_ascii=False, indent=2)}\n```"
    )

    if proformer_data:
        system_with_proformer = SYSTEM_PROMPT + """

## 物件レベルデータ（Proformer連携）
物件レベルのDCF分析データも提供されています。
地域経済（マクロ）と物件収益（ミクロ）を統合して判断してください。

追加の出力セクション:
### マクロ×ミクロ統合評価
- 地域経済の強みがこの物件の収益にどう寄与するか
- 地域リスクが物件にどう影響するか
- Cap Rate / IRR と地域の経済基盤の整合性

### 物件固有の着目点
- DSCR（借入金償還余裕率）の安全性
- LTV（融資比率）のリスク評価
- 空室率の妥当性（地域の経済基盤を踏まえて）"""

        user_msg += (
            f"\n\n---\n\n**物件レベル分析（Proformer）**:\n\n"
            f"```json\n{json.dumps(proformer_data, ensure_ascii=False, indent=2)}\n```"
        )
        return system_with_proformer, user_msg

    return SYSTEM_PROMPT, user_msg


def call_claude_api(
    scorecard: ScorecardData,
    api_key: str,
    model: str = "claude-sonnet-4-20250514",
    max_tokens: int = 2000,
    proformer_data: Optional[dict] = None,
) -> Optional[str]:
    """Call Claude API with scorecard data and return analysis text.

    Parameters
    ----------
    scorecard : ScorecardData from build_scorecard()
    api_key : Anthropic API key
    model : Claude model to use
    max_tokens : max response tokens (increased for integrated analysis)
    proformer_data : optional Proformer API response dict for integrated analysis

    Returns None on failure.
    CLAUDE.md rule: client is created inside this function, not at module level.
    """
    try:
        import anthropic
    except ImportError:
        return None

    system_prompt, user_message = build_analysis_prompt(scorecard, proformer_data)

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text
    except Exception:
        return None
