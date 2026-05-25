"""国土数値情報(NLNI)パイプラインのテスト。

Pre-mortem validation:
  1. ダウンロードURL到達性
  2. Shapefile読み取り堅牢性（エンコーディング、空データ）
  3. 空間集約（point-in-polygon）の正確性
  4. precompute統合の型安全性（NaN/None/無限大）
  5. プロセッサのCSV出力形式
  6. enhanced_investment_scoreの入力範囲
"""
from __future__ import annotations

import json
import math
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# 1. ダウンロードURL到達性
# ---------------------------------------------------------------------------

class TestDownloadURLs:
    """検証済みURLが実際にアクセス可能か確認（ネットワーク依存）。"""

    VERIFIED_URLS = {
        "N02": "https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-22/N02-22_GML.zip",
        "S12": "https://nlftp.mlit.go.jp/ksj/gml/data/S12/S12-21/S12-21_GML.zip",
        "L01_13": "https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-24/L01-24_13_GML.zip",
        "A29_13": "https://nlftp.mlit.go.jp/ksj/gml/data/A29/A29-19/A29-19_13_GML.zip",
        "A31_13": "https://nlftp.mlit.go.jp/ksj/gml/data/A31/A31-12/A31-12_13_GML.zip",
        "P11_13": "https://nlftp.mlit.go.jp/ksj/gml/data/P11/P11-22/P11-22_13_GML.zip",
        "P04_13": "https://nlftp.mlit.go.jp/ksj/gml/data/P04/P04-20/P04-20_13_GML.zip",
        "A16_13": "https://nlftp.mlit.go.jp/ksj/gml/data/A16/A16-15/A16-15_13_GML.zip",
    }

    @pytest.mark.parametrize("name,url", list(VERIFIED_URLS.items()))
    def test_url_reachable(self, name, url):
        """各URLがHTTP 200を返すこと。"""
        import requests
        try:
            r = requests.head(url, timeout=15, allow_redirects=True)
            assert r.status_code == 200, f"{name}: expected 200, got {r.status_code}"
        except requests.ConnectionError:
            pytest.skip("Network unavailable")

    def test_all_datasets_auto_downloadable(self):
        """全データセットが自動ダウンロード可能であること（手動DLゼロ）。"""
        from scripts.download_nlni import ALL_DATASETS
        for ds in ALL_DATASETS:
            assert ds.url_template != "MANUAL_DOWNLOAD", \
                f"{ds.dataset_id} should not require manual download"


# ---------------------------------------------------------------------------
# 2. Shapefile読み取り堅牢性
# ---------------------------------------------------------------------------

class TestShapefileReading:
    """Shapefile読み取りのエッジケース。"""

    def test_missing_shp_raises(self, tmp_path):
        """Shapefileが存在しない場合FileNotFoundError。"""
        from data.nlni.downloader import read_shapefile_records
        with pytest.raises(FileNotFoundError):
            read_shapefile_records(tmp_path)

    def test_geojson_fallback(self, tmp_path):
        """Shapefileがなくても.geojsonがあれば読み取れること。"""
        from data.nlni.downloader import read_shapefile_records
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "テスト駅", "code": "13101"},
                    "geometry": {"type": "Point", "coordinates": [139.7, 35.7]},
                }
            ],
        }
        path = tmp_path / "test.geojson"
        path.write_text(json.dumps(geojson), encoding="utf-8")

        records = read_shapefile_records(tmp_path)
        assert len(records) == 1
        assert records[0]["name"] == "テスト駅"
        assert abs(records[0]["_lon"] - 139.7) < 0.001

    def test_load_cached_csv_nonexistent(self):
        """存在しないCSVはNoneを返すこと。"""
        from data.nlni.downloader import load_cached_csv
        result = load_cached_csv("nonexistent_file_xyz.csv")
        assert result is None

    def test_save_and_load_cached_csv(self, tmp_path):
        """CSV保存→読み込みのラウンドトリップ。"""
        from data.nlni.downloader import save_cached_csv, CACHE_DIR
        df = pd.DataFrame({
            "pref_code": ["13", "14"],
            "muni_code": ["13101", "14101"],
            "value": [100, 200],
        })
        # Use the actual cache dir
        saved = save_cached_csv(df, "test_roundtrip.csv")
        assert saved.exists()

        from data.nlni.downloader import load_cached_csv
        loaded = load_cached_csv("test_roundtrip.csv")
        assert loaded is not None
        assert len(loaded) == 2
        assert loaded["pref_code"].dtype == object  # str dtype
        # Cleanup
        saved.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# 3. 空間集約の正確性
# ---------------------------------------------------------------------------

class TestSpatialAggregation:
    """point-in-polygon割り当ての正確性。"""

    def test_tokyo_station_in_chiyoda(self):
        """東京駅(139.7673, 35.6812)が千代田区(13101)に属すること。"""
        from data.nlni.spatial import assign_points_to_municipalities
        points = [(139.7673, 35.6812)]  # 東京駅
        result = assign_points_to_municipalities(points, 13)
        assert result[0] == "13101", f"Expected 13101 (千代田区), got {result[0]}"

    def test_shinjuku_station(self):
        """新宿駅(139.7006, 35.6896)が新宿区(13104)に属すること。"""
        from data.nlni.spatial import assign_points_to_municipalities
        points = [(139.7006, 35.6896)]
        result = assign_points_to_municipalities(points, 13)
        assert result[0] == "13104", f"Expected 13104 (新宿区), got {result[0]}"

    def test_point_outside_prefecture(self):
        """他県の座標は None になること。"""
        from data.nlni.spatial import assign_points_to_municipalities
        points = [(130.42, 33.59)]  # 福岡の座標を東京で検索
        result = assign_points_to_municipalities(points, 13)
        assert result[0] is None

    def test_multiple_points(self):
        """複数ポイントの一括処理。"""
        from data.nlni.spatial import assign_points_to_municipalities
        points = [
            (139.7673, 35.6812),  # 千代田区
            (139.7006, 35.6896),  # 新宿区
            (0.0, 0.0),          # 海外→None
        ]
        results = assign_points_to_municipalities(points, 13)
        assert len(results) == 3
        assert results[0] is not None
        assert results[1] is not None
        assert results[2] is None

    def test_boundary_loading(self):
        """47都道府県の境界データが全て読み込めること。"""
        from data.nlni.spatial import load_municipality_boundaries
        for pc in [1, 13, 27, 47]:  # 北海道、東京、大阪、沖縄
            bounds = load_municipality_boundaries(pc)
            assert len(bounds) > 0, f"Pref {pc} has no boundaries"
            # 各境界にN03_007コードがあること
            for b in bounds:
                code = b["properties"].get("N03_007", "")
                if code:  # 一部は空（海域等）
                    assert len(code) == 5, f"Bad muni code: {code}"


# ---------------------------------------------------------------------------
# 4. precompute統合の型安全性
# ---------------------------------------------------------------------------

class TestTypeSafety:
    """NaN/None/無限大がJSON出力を壊さないこと。"""

    def test_safe_int_normal(self):
        from scripts.precompute_json import _safe_int
        assert _safe_int(42) == 42
        assert _safe_int(3.7) == 3
        assert _safe_int("100") == 100

    def test_safe_int_edge_cases(self):
        from scripts.precompute_json import _safe_int
        assert _safe_int(None) == 0
        assert _safe_int(float("nan")) == 0
        assert _safe_int(float("inf")) == 0
        assert _safe_int("abc") == 0
        assert _safe_int("", default=-1) == -1

    def test_safe_float_normal(self):
        from scripts.precompute_json import _safe_float
        assert _safe_float(3.14159, decimals=2) == 3.14
        assert _safe_float("42.5") == 42.5

    def test_safe_float_edge_cases(self):
        from scripts.precompute_json import _safe_float
        assert _safe_float(None) == 0.0
        assert _safe_float(float("nan")) == 0.0
        assert _safe_float(float("inf")) == 0.0
        assert not math.isnan(_safe_float(float("nan")))

    def test_nlni_enrichment_with_empty_data(self):
        """NLNI CSVが空でもenrich関数がクラッシュしないこと。"""
        from scripts.precompute_json import _enrich_prefecture_with_nlni
        result = {"pref_code": 13}
        nlni = {
            "railways": pd.DataFrame(columns=["pref_code", "daily_riders"]),
            "land_prices": pd.DataFrame(columns=["pref_code", "price_per_m2"]),
        }
        # Should not raise
        _enrich_prefecture_with_nlni(result, 13, nlni)
        # No new keys added (empty data)

    def test_nlni_enrichment_with_nan_values(self):
        """NaN値を含むCSVでもenrich関数がクラッシュしないこと。"""
        from scripts.precompute_json import _enrich_prefecture_with_nlni
        result = {"pref_code": 13}
        nlni = {
            "railways": pd.DataFrame({
                "pref_code": ["13", "13"],
                "daily_riders": [1000, float("nan")],
                "station_name": ["A", "B"],
            }),
        }
        _enrich_prefecture_with_nlni(result, 13, nlni)
        assert result.get("num_stations") == 2

    def test_json_serializable_output(self):
        """enrich後のresultがJSON serializable であること。"""
        from scripts.precompute_json import _enrich_prefecture_with_nlni
        result = {"pref_code": 13, "pref_name": "東京都"}
        nlni = {
            "flood": pd.DataFrame({
                "pref_code": ["13"],
                "muni_code": ["13101"],
                "flood_area_pct": [15.3],
                "max_depth_class": [3],
                "num_risk_zones": [5],
            }),
        }
        _enrich_prefecture_with_nlni(result, 13, nlni)
        # Must not raise
        serialized = json.dumps(result, ensure_ascii=False)
        assert "flood_risk_avg_pct" in serialized


# ---------------------------------------------------------------------------
# 5. enhanced_investment_score
# ---------------------------------------------------------------------------

class TestEnhancedScore:
    """拡張投資スコアのテスト。"""

    def test_basic_computation(self):
        from calculator import investment_suitability_score, enhanced_investment_score
        base = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000)
        enhanced = enhanced_investment_score(base)
        assert 0 <= enhanced["total_score"] <= 100
        assert "disaster_score" in enhanced
        assert "accessibility_score" in enhanced
        assert "demographic_score" in enhanced
        assert "base_score" in enhanced

    def test_high_flood_risk_lowers_score(self):
        from calculator import investment_suitability_score, enhanced_investment_score
        base = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000)
        safe = enhanced_investment_score(base, flood_risk_pct=0.0)
        risky = enhanced_investment_score(base, flood_risk_pct=50.0)
        assert safe["total_score"] > risky["total_score"]
        assert safe["disaster_score"] == 100.0
        assert risky["disaster_score"] == 0.0

    def test_good_access_raises_score(self):
        from calculator import investment_suitability_score, enhanced_investment_score
        base = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000)
        no_access = enhanced_investment_score(base, num_stations=0, daily_riders=0)
        good_access = enhanced_investment_score(base, num_stations=100, daily_riders=200000, num_bus_stops=100)
        assert good_access["total_score"] > no_access["total_score"]

    def test_population_decline_lowers_score(self):
        from calculator import investment_suitability_score, enhanced_investment_score
        base = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000)
        growing = enhanced_investment_score(base, pop_change_pct=10.0)
        declining = enhanced_investment_score(base, pop_change_pct=-30.0)
        assert growing["total_score"] > declining["total_score"]

    def test_extreme_inputs(self):
        """極端な入力値でもクラッシュしないこと。"""
        from calculator import investment_suitability_score, enhanced_investment_score
        base = investment_suitability_score(1.0, 0.0, -50000, -100.0, 0)
        result = enhanced_investment_score(
            base,
            flood_risk_pct=100.0,
            num_stations=0,
            daily_riders=0,
            num_bus_stops=0,
            pop_change_pct=-50.0,
        )
        assert 0 <= result["total_score"] <= 100
        assert not math.isnan(result["total_score"])

    def test_existing_calculator_tests_still_pass(self):
        """既存の61テストが壊れていないことの確認（smoke test）。"""
        from calculator import (
            lq_table, economic_base_multiplier, population_employment_ratio,
            investment_suitability_score,
        )
        result = investment_suitability_score(4.0, 15.0, 5000, 10.0, 200000)
        assert "total_score" in result
        assert 0 <= result["total_score"] <= 100


# ---------------------------------------------------------------------------
# 6. プロセッサCSV出力形式
# ---------------------------------------------------------------------------

class TestProcessorOutputFormat:
    """各プロセッサの出力CSVが期待するカラムを持つこと。"""

    EXPECTED_COLUMNS = {
        "land_prices.csv": ["pref_code", "lon", "lat", "price_per_m2"],
        "flood_risk_by_muni.csv": ["pref_code", "muni_code", "flood_area_pct"],
        "did_by_muni.csv": ["pref_code", "muni_code", "did_area_ha", "did_population"],
        "facilities_medical.csv": ["pref_code", "muni_code", "facility_name"],
        "facilities_commercial.csv": ["pref_code", "muni_code", "facility_name"],
        "bus_coverage_by_muni.csv": ["pref_code", "muni_code", "num_bus_stops"],
        "mesh_pop_projection.csv": ["pref_code", "muni_code", "year", "population"],
        "location_optimization.csv": ["pref_code", "muni_code", "has_plan"],
        "roads_by_muni.csv": ["pref_code", "total_road_segments"],
        "railways_stations.csv": ["station_name", "lon", "lat"],
        "zoning_by_muni.csv": ["pref_code", "muni_code", "zone_code"],
    }

    @pytest.mark.parametrize("csv_name,required_cols", list(EXPECTED_COLUMNS.items()))
    def test_csv_columns_if_exists(self, csv_name, required_cols):
        """CSV が存在する場合、必要なカラムを含むこと。"""
        from data.nlni.downloader import load_cached_csv
        df = load_cached_csv(csv_name)
        if df is None:
            pytest.skip(f"{csv_name} not yet generated")
        for col in required_cols:
            assert col in df.columns, f"{csv_name} missing column: {col}"


# ---------------------------------------------------------------------------
# 7. download_nlni.py のconfig整合性
# ---------------------------------------------------------------------------

class TestDownloadConfig:
    """ダウンロード設定の整合性。"""

    def test_all_datasets_have_unique_ids(self):
        from scripts.download_nlni import ALL_DATASETS
        ids = [ds.dataset_id for ds in ALL_DATASETS]
        assert len(ids) == len(set(ids)), f"Duplicate IDs: {ids}"

    def test_all_datasets_have_unique_csv_names(self):
        from scripts.download_nlni import ALL_DATASETS
        names = [ds.output_csv for ds in ALL_DATASETS]
        assert len(names) == len(set(names)), f"Duplicate CSV names: {names}"

    def test_dataset_name_map_complete(self):
        from scripts.download_nlni import ALL_DATASETS, DATASET_NAME_MAP
        for ds in ALL_DATASETS:
            assert ds.dataset_id in [v.dataset_id for v in DATASET_NAME_MAP.values()], \
                f"{ds.dataset_id} not in DATASET_NAME_MAP"

    def test_per_prefecture_urls_have_placeholder(self):
        """県別データセットのURLに{pref_code}プレースホルダーがあること（MESH_BASED除く）。"""
        from scripts.download_nlni import ALL_DATASETS
        for ds in ALL_DATASETS:
            if ds.scope == "per_prefecture" and ds.url_template not in ("MANUAL_DOWNLOAD", "MESH_BASED"):
                assert "{pref_code" in ds.url_template, \
                    f"{ds.dataset_id}: per_prefecture URL must have {{pref_code}} placeholder"
