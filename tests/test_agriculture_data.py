"""農林漁業データのアクセス回帰テスト。

過去のバグ: load_cached_dataset() が category_code を str 指定せず読み込み、
'01'(農業), '02'(林業) などが '1', '2' に数値化されて isin() 検索で
ヒットしないため、農林漁業データが「データなし」と誤判定されていた。
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.census_cache import (
    DS_EMPLOYMENT_MID,
    load_cached_dataset,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def _cache_available() -> bool:
    return (CACHE_DIR / DS_EMPLOYMENT_MID.csv_name).exists()


pytestmark = pytest.mark.skipif(
    not _cache_available(),
    reason="中分類キャッシュ未構築",
)


class TestAgricultureDataAccess:
    def test_category_code_stays_as_zero_padded_string(self):
        """category_code が文字列で '01' 形式で保持される（数値化されない）。"""
        df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
        codes = set(df["category_code"].unique())
        # 農林漁業の中分類コード
        assert "01" in codes, "農業コード '01' が見つからない（数値化バグ再発）"
        assert "02" in codes, "林業コード '02' が見つからない"
        assert "03" in codes, "漁業コード '03' が見つからない"
        assert "04" in codes, "水産養殖業コード '04' が見つからない"
        # 数値化されていたら '1','2','3','4' になっているはず
        assert "1" not in codes
        assert "2" not in codes

    def test_national_agriculture_employment_realistic(self):
        """全国農業従事者数が30万人以上であること。

        経済センサス(民営事業所)では約36万人。
        農林業センサス基幹的農業従事者は約136万人（個人経営含む）。
        """
        df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
        nat = df[df["area_code"] == "00000"]
        agri = nat[nat["category_code"] == "01"]
        assert len(agri) == 1
        assert agri.iloc[0]["employees"] > 300_000

    def test_pref_agriculture_lq_above_one(self):
        """農業県の農業LQが1.0より大きいこと。"""
        from calculator import location_quotient
        df = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
        nat = df[df["area_code"] == "00000"]
        nat_dict = dict(zip(nat["category_name"], nat["employees"]))
        nat_total = sum(nat_dict.values())
        nat_agri = nat_dict.get("農業", 0)

        # 鹿児島県・宮崎県・青森県は農業特化県
        for pref_code, name in [("46000", "鹿児島県"), ("45000", "宮崎県"),
                                  ("02000", "青森県"), ("06000", "山形県")]:
            pref_df = df[df["area_code"] == pref_code]
            pref_dict = dict(zip(pref_df["category_name"], pref_df["employees"]))
            pref_total = sum(pref_dict.values())
            pref_agri = pref_dict.get("農業", 0)
            lq = location_quotient(pref_agri, pref_total, nat_agri, nat_total)
            assert lq > 1.0, f"{name}の農業LQが {lq:.2f} で 1.0 以下（バグの可能性）"
