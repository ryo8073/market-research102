"""API レスポンス → calculator.py 入力形式への変換層。

ここが RESAS/e-Stat の日本データと CI102 数理モデルの橋渡し。
全ての産業コード正規化がここを経由する（Pre-mortem リスク #3）。

設計方針:
  - 各関数は API クライアントを受け取り、calculator.py が要求する
    dict[str, float] 形式に変換して返す。
  - 欠損データは警告付きで部分結果を返す（リスク #4）。
  - supplementary_data 引数で購入データのプラグインに対応。
"""
from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from data.industry_map import (
    JSIC_MAJOR_TO_CANONICAL,
    aggregate_resas_to_major,
    normalize_resas_simc,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LQ 分析用データ準備
# ---------------------------------------------------------------------------

def prepare_lq_inputs_from_resas(
    resas_data: list[dict],
    aggregate_to_major: bool = True,
) -> dict[str, float]:
    """RESAS 産業別特化係数 API レスポンスから従業者数 LQ dict を構築。

    RESAS は LQ を直接返すが、calculator.lq_table() は
    local/national の従業者数 dict を要求する。
    RESAS の LQ 値をそのまま利用する場合は別関数を使う。

    Parameters
    ----------
    resas_data : RESAS /industry/power/forIndustry の data リスト
    aggregate_to_major : True の場合、JSIC 大分類に集約

    Returns
    -------
    dict[str, float]: {産業名: 従業者数ベース LQ}
    """
    result: dict[str, float] = {}
    for item in resas_data:
        simc = str(item.get("simcCode", ""))
        employee_lq = item.get("employee")
        if employee_lq is None:
            continue

        if aggregate_to_major:
            key = aggregate_resas_to_major(simc)
        else:
            key = normalize_resas_simc(simc)

        # 同一大分類に複数中分類がある場合は最初のものを保持
        # （大分類LQは別途計算が必要なため、ここでは代表値）
        if key not in result:
            result[key] = float(employee_lq)

    return result


def prepare_lq_employment_from_resas(
    resas_data: list[dict],
) -> tuple[dict[str, float], dict[str, float]]:
    """RESAS データから LQ 計算用の地域/全国従業者数推計を構築。

    RESAS の /industry/power/forIndustry は LQ を直接返すが、
    calculator.lq_table() が要求する local/national の raw 従業者数は
    直接提供しない。そのため、このデータソースでは
    RESAS の employee (LQ値) をそのまま lq_table の結果として
    表示用に使う別パスを推奨する。

    本関数は LQ 値から疑似的な従業者数比を逆算するもので、
    e-Stat の生データが利用可能な場合はそちらを優先すべき。
    """
    # RESAS は LQ のみ返すため、local/national 生データは取得不可。
    # 代わりに LQ 値を直接利用するパスを提供。
    logger.info(
        "RESAS は LQ 値のみを提供。生従業者数が必要な場合は e-Stat を使用してください。"
    )
    lq_dict = prepare_lq_inputs_from_resas(resas_data, aggregate_to_major=False)
    return lq_dict, {}


def prepare_lq_inputs_from_estat(
    local_employment: dict[str, float],
    national_employment: dict[str, float],
    industry_name_map: dict[str, str] | None = None,
) -> tuple[dict[str, float], dict[str, float]]:
    """e-Stat 経済センサスデータから LQ 計算用 dict を構築。

    Parameters
    ----------
    local_employment : e-Stat から取得した地域の産業別従業者数
    national_employment : e-Stat から取得した全国の産業別従業者数
    industry_name_map : 産業コード→表示名のマッピング（省略時はそのまま使用）

    Returns
    -------
    (local_dict, national_dict): calculator.lq_table() に渡せる形式
    """
    if industry_name_map:
        local_employment = {
            industry_name_map.get(k, k): v
            for k, v in local_employment.items()
        }
        national_employment = {
            industry_name_map.get(k, k): v
            for k, v in national_employment.items()
        }

    # 両方に存在する産業のみを使用（データの整合性確保）
    common_industries = set(local_employment.keys()) & set(national_employment.keys())
    if not common_industries:
        logger.warning("地域データと全国データに共通する産業がありません。")
        return {}, {}

    local = {k: local_employment[k] for k in common_industries}
    national = {k: national_employment[k] for k in common_industries}

    dropped = set(local_employment.keys()) - common_industries
    if dropped:
        logger.warning("全国データに存在しない産業を除外: %s", dropped)

    return local, national


# ---------------------------------------------------------------------------
# 人口・雇用データ準備（PER 計算用）
# ---------------------------------------------------------------------------

def extract_population_from_resas(
    population_data: dict,
    target_year: int | None = None,
) -> float | None:
    """RESAS 人口構成データから総人口を抽出。

    Parameters
    ----------
    population_data : RESAS /population/composition/perYear のレスポンス
    target_year : 指定年の人口を取得。None の場合は最新の実績年

    Returns
    -------
    float or None: 総人口
    """
    if not population_data:
        return None

    boundary_year = population_data.get("boundaryYear", 2020)
    data_series = population_data.get("data", [])

    # "総人口" のデータ系列を探す
    total_pop_series = None
    for series in data_series:
        label = series.get("label", "")
        if "総人口" in label:
            total_pop_series = series.get("data", [])
            break

    if not total_pop_series:
        logger.warning("総人口データが見つかりません。")
        return None

    if target_year is None:
        # 推計ではなく実績の最新年を使用
        actual_data = [
            d for d in total_pop_series
            if d.get("year", 0) <= boundary_year
        ]
        if not actual_data:
            return None
        latest = max(actual_data, key=lambda d: d["year"])
        return float(latest.get("value", 0))

    for d in total_pop_series:
        if d.get("year") == target_year:
            return float(d.get("value", 0))

    return None


# ---------------------------------------------------------------------------
# シフトシェア分析用データ準備
# ---------------------------------------------------------------------------

def prepare_shift_share_inputs(
    local_t0: dict[str, float],
    local_t1: dict[str, float],
    national_t0: dict[str, float],
    national_t1: dict[str, float],
) -> tuple[dict[str, float], dict[str, float], dict[str, float], dict[str, float]]:
    """4 つの従業者数 dict を共通産業キーで整合させる。

    全 4 dict に存在する産業のみを使用し、
    calculator.shift_share_table() に渡せる形式にする。
    """
    common = (
        set(local_t0.keys()) & set(local_t1.keys())
        & set(national_t0.keys()) & set(national_t1.keys())
    )
    if not common:
        logger.warning("4 時点のデータに共通する産業がありません。")
        return {}, {}, {}, {}

    return (
        {k: local_t0[k] for k in common},
        {k: local_t1[k] for k in common},
        {k: national_t0[k] for k in common},
        {k: national_t1[k] for k in common},
    )


# ---------------------------------------------------------------------------
# ギャップ分析用データ準備
# ---------------------------------------------------------------------------

def prepare_gap_analysis_sectors(
    demand_data: dict[str, float],
    supply_data: dict[str, float],
) -> list[dict[str, Any]]:
    """需要/供給データから gap_analysis_table() 用のセクターリストを構築。

    Parameters
    ----------
    demand_data : {小売業種名: 推計需要額}
    supply_data : {小売業種名: 実際の販売額}

    Returns
    -------
    list[dict]: calculator.gap_analysis_table() の入力形式
    """
    all_sectors = set(demand_data.keys()) | set(supply_data.keys())
    result = []
    for sector in sorted(all_sectors):
        demand = demand_data.get(sector, 0.0)
        supply = supply_data.get(sector, 0.0)
        result.append({
            "sector": sector,
            "demand": demand,
            "supply": supply,
        })
    return result


# ---------------------------------------------------------------------------
# MLIT 不動産取引データの集約
# ---------------------------------------------------------------------------

def summarize_transactions(
    df: pd.DataFrame,
    group_by: str = "Type",
) -> pd.DataFrame:
    """MLIT 取引データを用途別に集約。

    Parameters
    ----------
    df : MLIT API から取得した取引データ DataFrame
    group_by : 集約カラム名

    Returns
    -------
    pd.DataFrame: 集約結果（件数、中央値、平均値）
    """
    if df.empty or group_by not in df.columns:
        return pd.DataFrame()

    price_col = "price_per_m2" if "price_per_m2" in df.columns else "TradePrice"
    if price_col not in df.columns:
        return pd.DataFrame()

    valid = df.dropna(subset=[price_col])
    if valid.empty:
        return pd.DataFrame()

    summary = valid.groupby(group_by)[price_col].agg(
        ["count", "median", "mean", "std"]
    ).reset_index()
    summary.columns = [group_by, "取引件数", "中央値", "平均値", "標準偏差"]
    return summary.sort_values("取引件数", ascending=False).reset_index(drop=True)
