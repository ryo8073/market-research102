"""データバージョンの一元管理レジストリ。

2026年経済センサス・2025年国勢調査の差替時に、本ファイルの定数のみ
変更すれば、UI/API/Docs/AI プロンプトに反映される。

差替手順:
  1. e-Stat で新しいテーブル ID を確認 (search_stats() か Web)
  2. 本ファイルの定数を更新 (旧定数は HISTORICAL_VERSIONS にアーカイブ)
  3. scripts/download_census.py or rebuild_mid_class_cache.py で新CSV取得
  4. tests/test_calculator.py で教科書テスト全合格を確認
  5. scripts/precompute_json.py で全47県+市区町村JSONを再生成
  6. Next.js ビルド・Vercel デプロイ

参考: docs/DATA_MIGRATION_2026.md に詳細手順
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True)
class CensusVersion:
    """経済センサス・国勢調査の1版分のメタデータ。"""
    survey_year: int          # 調査実施年 (例: 2021)
    survey_month: int         # 調査実施月 (例: 6 = 6月時点)
    publication_year: int     # 結果公表年 (例: 2023)
    label_short: str          # UI 表示用短ラベル (例: "2021年")
    label_full: str           # フル表示用ラベル (例: "経済センサス活動調査 2021年6月")
    csv_suffix: str           # キャッシュCSVファイル名のサフィックス (例: "2021")
    # e-Stat テーブル ID
    table_major_emp: str      # 産業大分類 従業者数
    table_mid_emp: str        # 産業中分類 従業者数 (民営事業所)
    table_retail_sales: str   # 小売業 年間商品販売額
    table_establishments: str # 事業所数 (大分類と同テーブル)


# ============================================================================
# 経済センサス活動調査 — 5年ごと更新 (2016 → 2021 → 2026 ...)
# ============================================================================

# 現行版 (2021年実施・2023年公表)
ECONOMIC_CENSUS_CURRENT: Final = CensusVersion(
    survey_year=2021,
    survey_month=6,
    publication_year=2023,
    label_short="2021年",
    label_full="経済センサス活動調査 2021年6月",
    csv_suffix="2021",
    table_major_emp="0003449718",   # 産業大分類別・全事業所・従業者数
    table_mid_emp="0004005684",     # 産業中分類別・民営事業所・従業者数
    table_retail_sales="0004003263", # 小売業種別 年間商品販売額
    table_establishments="0003449718",  # 同テーブルの cdTab=102-2021
)

# 前回版 (2016年実施・2018年公表) — シフトシェアの t0 用
ECONOMIC_CENSUS_PREVIOUS: Final = CensusVersion(
    survey_year=2016,
    survey_month=6,
    publication_year=2018,
    label_short="2016年",
    label_full="経済センサス活動調査 2016年6月",
    csv_suffix="2016",
    table_major_emp="0003218721",  # H28大分類 (cat01=経営組織, cat02=産業分類で軸逆)
    table_mid_emp="0003218646",    # H28中分類民営事業所 (download_mid_2016.py 経由)
    table_retail_sales="",         # 未使用 (2016時点の小売は本ツール対象外)
    table_establishments="0003218721",
)

# 次回版 (2026年実施予定・2028年頃公表見込み) — 未確定情報
# 注: 公表後にテーブル ID は公式情報を確認して更新する
ECONOMIC_CENSUS_NEXT_PLAN: Final = {
    "survey_year": 2026,
    "survey_month": 6,
    "publication_year_estimate": 2028,
    "label_short": "2026年 (公表予定)",
    "monitoring_url": "https://www.e-stat.go.jp/stat-search?page=1&toukei=00200553",
    "note": "結果公表後、本ファイルの ECONOMIC_CENSUS_CURRENT を更新し、現行版を ECONOMIC_CENSUS_PREVIOUS にアーカイブする",
}


# ============================================================================
# 国勢調査 — 5年ごと更新 (2015 → 2020 → 2025 ...)
# ============================================================================

@dataclass(frozen=True)
class PopulationCensusVersion:
    survey_year: int
    label_short: str
    label_full: str
    csv_suffix: str           # キャッシュCSV名のサフィックス (例: "2020")
    table_id: str
    # 人口キー名 (e-Stat メタ情報の表章項目名と完全一致)
    # 2020年テーブルでは『2015年（平成27年）の人口（組替）』のように
    # 「組替値」が含まれる点に注意 (実体は2020年境界に組替えた2015年人口)
    pop_key: str


POPULATION_CENSUS_2020: Final = PopulationCensusVersion(
    survey_year=2020,
    label_short="2020年",
    label_full="国勢調査 2020年10月 (人口は2015年組替値)",
    csv_suffix="2020",
    table_id="0003433220",
    pop_key="2015年（平成27年）の人口（組替）",
)

# 現行版: 2025年国勢調査 人口速報集計 (2026-05-29 総務省統計局 公表)
# 旧来の「2015年組替値」を廃し、2025年時点の実測人口・世帯数に更新。
# 併せて 2020→2025 の人口・世帯増減率を投資判断向け先行指標として取得
# (data/cache/census_population_2025.csv, scripts/download_population_2025.py)。
POPULATION_CENSUS_CURRENT: Final = PopulationCensusVersion(
    survey_year=2025,
    label_short="2025年",
    label_full="国勢調査 2025年10月 (人口速報集計)",
    csv_suffix="2025",
    table_id="0004050397",
    pop_key="人口",
)

# 前回版エイリアス (シフトシェア・組替人口の参照用)
POPULATION_CENSUS_PREVIOUS: Final = POPULATION_CENSUS_2020

POPULATION_CENSUS_NEXT_PLAN: Final = {
    "survey_year": 2025,
    "survey_month": 10,
    "publication_year_estimate": 2027,
    "label_short": "2025年 確定値 (公表予定)",
    "monitoring_url": "https://www.e-stat.go.jp/stat-search?page=1&toukei=00200521",
    "note": "2025年 人口速報集計は統合済み (2026-05-29公表)。確定値(2027年頃)公表後、"
            "年齢別・就業状態別が加わり PER・住宅需要推計をさらに精緻化できる。",
}


# ============================================================================
# 過去バージョンのアーカイブ — 差替時の参照用
# ============================================================================

HISTORICAL_VERSIONS: Final = [
    ECONOMIC_CENSUS_PREVIOUS,
]


# ============================================================================
# ヘルパー: UI/API/プロンプトで使う共通文字列
# ============================================================================

def census_data_vintage_label() -> str:
    """『データ時点: 経済センサス2021年 / 国勢調査2020年』形式の表示文字列。"""
    return (
        f"経済センサス {ECONOMIC_CENSUS_CURRENT.label_short} / "
        f"国勢調査 {POPULATION_CENSUS_CURRENT.label_short}"
    )


def shift_share_period_label() -> str:
    """シフトシェア分析の期間ラベル: 例『2016→2021年』。"""
    return f"{ECONOMIC_CENSUS_PREVIOUS.survey_year}→{ECONOMIC_CENSUS_CURRENT.survey_year}年"


def is_data_stale_years() -> int:
    """現行データが何年前のものか。営業UIで「N年前のデータ」表示用。"""
    import datetime
    return datetime.date.today().year - ECONOMIC_CENSUS_CURRENT.survey_year


def next_census_estimated_year() -> int:
    """次回経済センサス結果の公表予定年。"""
    return ECONOMIC_CENSUS_NEXT_PLAN["publication_year_estimate"]
