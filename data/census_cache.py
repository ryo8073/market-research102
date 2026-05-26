"""e-Stat 全国データの一括ダウンロード・キャッシュ。

CI102 市場分析に必要な全データセットを一括取得し CSV に保存。
任意の市区町村の分析を即座に実行可能にする。

データセット一覧:
  1. 産業大分類別従業者数  (LQ・EBM計算用)     ~31,000行 ~1.7MB
  2. 産業中分類別従業者数  (詳細LQ計算用)       ~200,000行 ~12MB
  3. 人口・世帯数          (PER・住宅需要計算用) ~20,000行 ~1MB
  4. 小売業年間商品販売額  (ギャップ分析Supply)  ~60,000行 ~4MB
  5. 事業所数              (産業集積密度分析)     ~31,000行 ~1.7MB
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from data.industry_map import JSIC_MAJOR_DIVISIONS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# データセット定義
# ---------------------------------------------------------------------------
@dataclass
class DatasetConfig:
    """e-Stat ダウンロード設定。"""
    table_id: str           # statsDataId
    csv_name: str           # キャッシュファイル名
    description: str        # 説明
    tab_filter: str | None  # 表章項目フィルタ
    cat_filters: dict[str, str]  # カテゴリフィルタ {cdCatNN: value}
    skip_categories: set[str]  # スキップする集約コード
    name_map_id: str        # メタ情報のカテゴリID ("cat01" 等)
    name_resolver: str      # "jsic_major", "jsic_mid", "raw", "none"
    value_column: str       # 出力CSV のバリューカラム名


# --- 1. 産業大分類別従業者数（既存） ---
DS_EMPLOYMENT_MAJOR = DatasetConfig(
    table_id="0003449718",
    csv_name="census_employment_major_2021.csv",
    description="産業大分類別従業者数（LQ・EBM計算用）",
    tab_filter="113-2021",      # 従業者数_男女計
    cat_filters={"cdCat02": "0"},  # 経営組織: 総数
    skip_categories={"AS", "AR", "AB", "CR"},
    name_map_id="cat01",
    name_resolver="jsic_major",
    value_column="employees",
)

# --- 1b. 産業大分類別従業者数 2016年（シフトシェア t0 用） ---
# 注意: 2016年テーブルは cat01=経営組織, cat02=産業分類（2021年と軸が逆）
DS_EMPLOYMENT_MAJOR_2016 = DatasetConfig(
    table_id="0003218721",
    csv_name="census_employment_major_2016.csv",
    description="産業大分類別従業者数 2016年（シフトシェア t0）",
    tab_filter="812",               # 従業者数
    cat_filters={"cdCat01": "000"},  # 経営組織: 総数
    skip_categories={"00010", "00020", "00800"},  # 集約カテゴリ
    name_map_id="cat02",             # 2016年は cat02 が産業分類
    name_resolver="raw",             # メタ情報から名称解決
    value_column="employees",
)

# --- 2. 産業中分類別従業者数 ---
# 旧 table_id="0004005686" は『国及び地方公共団体』限定のテーブルだったため、
# 民営事業所が含まれず製造業・卸売・小売等の値がほぼゼロになる重大バグがあった。
# 正しいテーブル: 0004005684（民営事業所、市区町村粒度、2021年）。
DS_EMPLOYMENT_MID = DatasetConfig(
    table_id="0004005684",
    csv_name="census_employment_mid_2021.csv",
    description="産業中分類別民営事業所従業者数（詳細LQ計算用）",
    tab_filter="113-2021",      # 従業者数_男女計
    cat_filters={},              # 経営組織フィルタなし（民営テーブル）
    # 集約カテゴリ（中分類のみ残すため）:
    #   AR, AB, CR = 大分類の上位集約
    #   A-T = 大分類（17）
    #   G1/G2/I1/I2/K1/K2/M1/M2/O1/O2/Q1/Q2/R1/R2 = 大分類内の小集約
    skip_categories={
        "AR", "AB", "CR",
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K",
        "L", "M", "N", "O", "P", "Q", "R",
        "G1", "G2", "I1", "I2", "K1", "K2",
        "M1", "M2", "O1", "O2", "Q1", "Q2", "R1", "R2",
    },
    name_map_id="cat01",
    name_resolver="raw",          # 中分類名はメタ情報から取得
    value_column="employees",
)

# --- 3. 人口・世帯数（国勢調査 2020） ---
DS_POPULATION = DatasetConfig(
    table_id="0003433220",
    csv_name="census_population_2020.csv",
    description="人口・世帯数（PER・住宅需要計算用）",
    tab_filter=None,  # 全表章項目取得
    cat_filters={},
    skip_categories=set(),
    name_map_id="tab",
    name_resolver="none",
    value_column="value",
)

# --- 4. 小売業年間商品販売額 ---
DS_RETAIL_SALES = DatasetConfig(
    table_id="0004003263",
    csv_name="census_retail_sales_2021.csv",
    description="小売業種別 年間商品販売額（ギャップ分析Supply）",
    tab_filter="703-2021",  # 年間商品販売額
    cat_filters={},
    skip_categories={"I", "I1", "I2"},  # 集約（合計、卸売計、小売計）
    name_map_id="cat01",
    name_resolver="raw",
    value_column="sales",
)

# --- 5. 事業所数 ---
DS_ESTABLISHMENTS = DatasetConfig(
    table_id="0003449718",
    csv_name="census_establishments_2021.csv",
    description="産業大分類別事業所数（産業集積密度分析）",
    tab_filter="102-2021",  # 事業所数
    cat_filters={"cdCat02": "0"},
    skip_categories={"AS", "AR", "AB", "CR"},
    name_map_id="cat01",
    name_resolver="jsic_major",
    value_column="establishments",
)

# 全データセット（ダウンロード順序）
ALL_DATASETS = [
    DS_EMPLOYMENT_MAJOR,
    DS_EMPLOYMENT_MAJOR_2016,
    DS_EMPLOYMENT_MID,
    DS_POPULATION,
    DS_RETAIL_SALES,
    DS_ESTABLISHMENTS,
]

# 後方互換: 旧ファイル名
CENSUS_TABLE_ID = DS_EMPLOYMENT_MAJOR.table_id
TAB_EMPLOYEES = "113-2021"
CAT02_TOTAL = "0"
SKIP_CATEGORIES = DS_EMPLOYMENT_MAJOR.skip_categories
CACHE_FILENAME = DS_EMPLOYMENT_MAJOR.csv_name


# ---------------------------------------------------------------------------
# 汎用ダウンロードエンジン
# ---------------------------------------------------------------------------

def _fetch_all_values(
    estat_client,
    params: dict[str, Any],
) -> list[dict]:
    """ページネーション付きで全レコードを取得。"""
    all_values: list[dict] = []
    start = 1
    page_size = 100000

    while True:
        p = {**params, "limit": page_size, "startPosition": start}
        resp = estat_client.get("app/json/getStatsData", p)
        try:
            values = resp["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
            if isinstance(values, dict):
                values = [values]
        except (KeyError, TypeError):
            values = []

        all_values.extend(values)
        logger.info("  取得済み: %d レコード", len(all_values))

        if len(values) < page_size:
            break
        start += page_size

    return all_values


def _fetch_meta_names(estat_client, table_id: str, meta_id: str) -> dict[str, str]:
    """メタ情報からコード→名称のマッピングを取得。"""
    try:
        resp = estat_client.get("app/json/getMetaInfo", {
            "statsDataId": table_id, "lang": "J",
        })
        class_objs = resp["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
        for obj in class_objs:
            if obj.get("@id") == meta_id:
                classes = obj.get("CLASS", [])
                if isinstance(classes, dict):
                    classes = [classes]
                return {c["@code"]: c["@name"] for c in classes}
    except (KeyError, TypeError):
        pass
    return {}


def download_dataset(
    estat_client,
    config: DatasetConfig,
    cache_dir: Path,
) -> pd.DataFrame:
    """任意のデータセットをダウンロードしキャッシュする汎用関数。"""
    cache_path = cache_dir / config.csv_name
    if cache_path.exists():
        logger.info("キャッシュから読み込み: %s", cache_path)
        return pd.read_csv(cache_path, dtype={"area_code": str})

    logger.info("ダウンロード中: %s ...", config.description)

    # APIパラメータ構築
    params: dict[str, Any] = {
        "lang": "J",
        "statsDataId": config.table_id,
    }
    if config.tab_filter:
        params["cdTab"] = config.tab_filter
    for key, val in config.cat_filters.items():
        params[key] = val

    all_values = _fetch_all_values(estat_client, params)
    if not all_values:
        logger.warning("データなし: %s", config.description)
        return pd.DataFrame()

    # メタ情報
    area_names = _fetch_meta_names(estat_client, config.table_id, "area")
    cat_names = _fetch_meta_names(estat_client, config.table_id, config.name_map_id)
    tab_names = _fetch_meta_names(estat_client, config.table_id, "tab")

    # 名前解決関数
    if config.name_resolver == "jsic_major":
        resolve_name = lambda code: JSIC_MAJOR_DIVISIONS.get(code, cat_names.get(code, code))
    elif config.name_resolver == "raw":
        resolve_name = lambda code: cat_names.get(code, code)
    else:
        resolve_name = lambda code: code

    # DataFrame 変換
    rows = []
    for v in all_values:
        cat_code = v.get(f"@{config.name_map_id}", "")
        if cat_code in config.skip_categories:
            continue

        val_str = str(v.get("$", ""))
        if val_str in ("-", "", "…", "x", "***", "X"):
            continue
        try:
            value = float(val_str.replace(",", ""))
        except ValueError:
            continue

        area_code = v.get("@area", "")
        row = {
            "area_code": area_code,
            "area_name": area_names.get(area_code, area_code),
            "category_code": cat_code,
            "category_name": resolve_name(cat_code),
            config.value_column: value,
        }
        # 人口テーブルは tab が項目を示すので特殊処理
        if config.name_resolver == "none":
            tab_code = v.get("@tab", "")
            row["indicator"] = tab_names.get(tab_code, tab_code)
            row["category_code"] = tab_code
            row["category_name"] = tab_names.get(tab_code, tab_code)

        rows.append(row)

    df = pd.DataFrame(rows)
    logger.info("パース完了: %d 行（%d 地域）", len(df), df["area_code"].nunique())

    cache_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(cache_path, index=False, encoding="utf-8-sig")
    logger.info("保存: %s (%.1f KB)", cache_path, cache_path.stat().st_size / 1024)

    return df


def download_all_datasets(
    estat_client,
    cache_dir: Path,
    datasets: list[DatasetConfig] | None = None,
) -> dict[str, pd.DataFrame]:
    """複数データセットを一括ダウンロード。

    Returns
    -------
    dict[str, pd.DataFrame]: {csv_name: DataFrame}
    """
    if datasets is None:
        datasets = ALL_DATASETS
    results = {}
    for config in datasets:
        try:
            df = download_dataset(estat_client, config, cache_dir)
            results[config.csv_name] = df
            logger.info("完了: %s (%d行)", config.description, len(df))
        except Exception as e:
            logger.error("失敗: %s - %s", config.description, e)
    return results


# ---------------------------------------------------------------------------
# 後方互換: 既存の download_all_employment
# ---------------------------------------------------------------------------

def download_all_employment(
    estat_client,
    cache_dir: Path,
) -> pd.DataFrame:
    """産業大分類別従業者数をダウンロード（後方互換ラッパー）。

    新しい汎用関数 download_dataset() を内部で呼び出す。
    戻り値のカラム名は後方互換のため変換する。
    """
    df = download_dataset(estat_client, DS_EMPLOYMENT_MAJOR, cache_dir)
    if df.empty:
        return df
    # 後方互換カラム名
    rename = {
        "category_code": "industry_code",
        "category_name": "industry_name",
    }
    return df.rename(columns={k: v for k, v in rename.items() if k in df.columns})


# ---------------------------------------------------------------------------
# キャッシュからの高速データ取得
# ---------------------------------------------------------------------------

def load_cached_dataset(cache_dir: Path, csv_name: str) -> pd.DataFrame | None:
    """キャッシュ済み CSV があればロード。なければ None。

    area_code と category_code を str 指定する理由:
      - area_code: '01000' などの先頭ゼロが '1000' になるのを防ぐ
      - category_code: '01'(農業), '02'(林業) などの2桁ゼロパディング保護
        指定しないと数値化され '01'→'1' になりキー検索で失敗する
    """
    cache_path = cache_dir / csv_name
    if not cache_path.exists():
        return None
    return pd.read_csv(cache_path, dtype={"area_code": str, "category_code": str})


def load_cached_employment(cache_dir: Path) -> pd.DataFrame | None:
    """産業大分類別従業者数のキャッシュ（後方互換）。"""
    # 新ファイル名を優先、旧ファイル名にもフォールバック
    df = load_cached_dataset(cache_dir, DS_EMPLOYMENT_MAJOR.csv_name)
    if df is None:
        df = load_cached_dataset(cache_dir, "census_employment_2021.csv")
    return df


def get_area_employment(
    df: pd.DataFrame,
    area_code: str,
) -> dict[str, float]:
    """キャッシュ DataFrame から特定地域の産業別従業者数を抽出。

    Parameters
    ----------
    df : download_all_employment() の戻り値
    area_code : 5桁地域コード（例: "37201"=高松市, "00000"=全国）

    Returns
    -------
    dict[str, float]: {産業名: 従業者数}
    """
    area_df = df[df["area_code"] == area_code]
    if area_df.empty:
        return {}
    # カラム名の互換性（新: category_name, 旧: industry_name）
    name_col = "category_name" if "category_name" in area_df.columns else "industry_name"
    val_col = "employees" if "employees" in area_df.columns else df.columns[-1]
    return dict(zip(area_df[name_col], area_df[val_col]))


def get_national_employment(df: pd.DataFrame) -> dict[str, float]:
    """全国の産業別従業者数を抽出。"""
    return get_area_employment(df, "00000")


def list_available_areas(df: pd.DataFrame) -> list[tuple[str, str]]:
    """キャッシュに含まれる全地域の (code, name) リスト。"""
    areas = df[["area_code", "area_name"]].drop_duplicates()
    return list(zip(areas["area_code"], areas["area_name"]))


def list_areas_by_prefecture(
    df: pd.DataFrame,
    pref_code: int,
) -> list[tuple[str, str]]:
    """特定都道府県の市区町村リスト。"""
    prefix = f"{pref_code:02d}"
    areas = df[["area_code", "area_name"]].drop_duplicates()
    filtered = areas[
        (areas["area_code"].str.startswith(prefix))
        & (areas["area_code"] != f"{prefix}000")  # 県全体は除外
        & (areas["area_code"] != "00000")          # 全国は除外
    ]
    return list(zip(filtered["area_code"], filtered["area_name"]))


# ---------------------------------------------------------------------------
# 追加データセット固有のアクセス関数
# ---------------------------------------------------------------------------

def get_area_employment_mid(
    df: pd.DataFrame,
    area_code: str,
    extend_agriculture: bool = False,
    agri_df: pd.DataFrame | None = None,
) -> dict[str, float]:
    """産業中分類別従業者数を取得。詳細 LQ 計算用。

    Parameters
    ----------
    df : 中分類雇用 DataFrame
    area_code : 5桁地域コード
    extend_agriculture : True なら経済センサスの『農業』を農林業センサス2020
        の按分推計値で上書きする（個人経営の家族農家を含む拡張版）
    agri_df : 農林業センサス DataFrame (load_agri_census() の戻り値)
    """
    area_df = df[df["area_code"] == area_code]
    if area_df.empty:
        return {}
    result = dict(zip(area_df["category_name"], area_df["employees"]))

    if extend_agriculture and agri_df is not None:
        agri_row = agri_df[agri_df["area_code"] == area_code]
        if not agri_row.empty:
            extended = float(agri_row.iloc[0]["agri_census_allocated"])
            if extended > 0:
                # 『農業』を農林業センサス値に置き換え
                result["農業"] = extended
    return result


def get_area_population(
    df: pd.DataFrame,
    area_code: str,
) -> dict[str, float]:
    """国勢調査から地域の人口・世帯関連指標を取得。

    Returns
    -------
    dict: {"人口": ..., "世帯数": ..., ...} 表章項目名→値
    """
    area_df = df[df["area_code"] == area_code]
    if area_df.empty:
        return {}
    return dict(zip(area_df["category_name"], area_df["value"]))


# 小売業の中分類コード（56〜61）。CI102ギャップ分析の対象セクター。
# 50〜55 は卸売業（B2B）で、住民の購買行動分析には不適切。
RETAIL_MID_CATEGORY_PREFIXES = ("56", "57", "58", "59", "60", "61")


def get_area_retail_sales(
    df: pd.DataFrame,
    area_code: str,
    include_wholesale: bool = False,
    include_subcategories: bool = False,
) -> dict[str, float]:
    """小売業種別の年間商品販売額を取得。ギャップ分析の Supply 側。

    返却値の単位は **百万円**（e-Stat 経済センサス 0004003263 tab=703-2021 の公式単位）。
    過去にコメント上『万円』と記載していたが、e-Stat メタ情報で百万円が正。
    Leakage係数 = (demand-supply)/(demand+supply) は比率なので単位は相殺するが、
    UI表示時の単位ラベルに注意。1人あたり消費の桁感覚:
      全国小売販売額 約138兆円 / 人口 1.27億 ≈ 108万円/人/年。

    デフォルトでは『小売業（カテゴリ56-61）の中分類のみ』を返す。

    背景:
        e-Stat 経済センサスの小売販売額キャッシュには以下が混在している:
          - 卸売業（50-55）: B2B取引、住民購買力分析の対象外
          - 小売業（56-61）: CI102 Gap分析の本来の対象
          - 中分類2桁コード（例: 58 飲食料品小売業）
          - 小分類3桁コード（例: 581 各種食料品小売業）
        全カテゴリを足すと「中分類+小分類の二重計上」と「卸売混入」で
        合計が約6倍に膨らみ、ギャップ係数の絶対値が大きく歪む。

    Parameters
    ----------
    df : 小売販売額キャッシュ DataFrame
    area_code : 5桁地域コード
    include_wholesale : True なら卸売業（50-55）も含める。B2B需給分析向け。
    include_subcategories : True なら小分類（3桁コード）も含める。
                            False の場合は中分類（2桁コード）のみ返す。

    Returns
    -------
    dict: {業種名: 年間販売額（万円）}
    """
    area_df = df[df["area_code"] == area_code]
    if area_df.empty:
        return {}

    code_str = area_df["category_code"].astype(str)
    mask = pd.Series(True, index=area_df.index)

    if not include_subcategories:
        mask &= code_str.str.len() == 2

    if not include_wholesale:
        # 小売（56-61）のみ。中分類なら code[:2] in prefixes、小分類なら同様。
        mask &= code_str.str[:2].isin(RETAIL_MID_CATEGORY_PREFIXES)

    return dict(zip(area_df.loc[mask, "category_name"], area_df.loc[mask, "sales"]))


def get_area_establishments(
    df: pd.DataFrame,
    area_code: str,
) -> dict[str, float]:
    """産業大分類別事業所数を取得。

    Returns
    -------
    dict: {産業名: 事業所数}
    """
    area_df = df[df["area_code"] == area_code]
    if area_df.empty:
        return {}
    return dict(zip(area_df["category_name"], area_df["establishments"]))


# ---------------------------------------------------------------------------
# 農林業センサス2020 アクセス関数
# ---------------------------------------------------------------------------

AGRI_CENSUS_CSV = "agri_workers_2020.csv"


def load_agri_census(cache_dir: Path) -> pd.DataFrame | None:
    """農林業センサス2020 市区町村別 基幹的農業従事者(按分推計)を読み込む。

    経済センサス中分類の農業(01)では家族農家等の個人経営が含まれず
    全国36万人だが、農林業センサスでは個人経営含めて136万人(3.79倍)。
    地方都市の真の農業基盤雇用を把握するために使う。

    Returns
    -------
    DataFrame with columns: area_code, area_name, pref_code,
      eco_agri_workers (経済センサス民営のみ),
      agri_census_total_pref (県全体の農林業センサス値),
      agri_census_allocated (按分推計値).
    """
    path = cache_dir / AGRI_CENSUS_CSV
    if not path.exists():
        return None
    return pd.read_csv(path, dtype={"area_code": str})


def get_area_agri_workers(
    df: pd.DataFrame,
    area_code: str,
) -> dict[str, float]:
    """特定地域の農林業センサス按分推計値を取得。

    Returns
    -------
    dict: {"eco_only": X, "extended": Y} 経済センサスのみ / 農林業センサス補完版
    """
    row = df[df["area_code"] == area_code]
    if row.empty:
        return {}
    r = row.iloc[0]
    return {
        "eco_only": float(r["eco_agri_workers"]),
        "extended": float(r["agri_census_allocated"]),
        "diff": float(r["agri_census_allocated"]) - float(r["eco_agri_workers"]),
    }


def cache_status(cache_dir: Path) -> list[dict[str, str]]:
    """全データセットのキャッシュ状態を返す（UI表示用）。"""
    status = []
    for config in ALL_DATASETS:
        path = cache_dir / config.csv_name
        if path.exists():
            size_kb = path.stat().st_size / 1024
            df = pd.read_csv(path, nrows=1)
            status.append({
                "dataset": config.description,
                "file": config.csv_name,
                "status": f"取得済み ({size_kb:.0f} KB)",
                "available": True,
            })
        else:
            status.append({
                "dataset": config.description,
                "file": config.csv_name,
                "status": "未取得",
                "available": False,
            })
    return status
