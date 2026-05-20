"""data/transforms.py の単体テスト。"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.transforms import (
    prepare_lq_inputs_from_estat,
    prepare_lq_inputs_from_resas,
    prepare_shift_share_inputs,
    prepare_gap_analysis_sectors,
    extract_population_from_resas,
)


class TestPrepareLQFromRESAS:
    def test_extracts_employee_lq(self):
        resas_data = [
            {"simcCode": "09", "simcName": "食料品", "employee": 1.35, "value": 0.8},
            {"simcCode": "22", "simcName": "鉄鋼業", "employee": 2.10, "value": 1.5},
        ]
        result = prepare_lq_inputs_from_resas(resas_data, aggregate_to_major=False)
        assert "E_製造業_食料品" in result
        assert result["E_製造業_食料品"] == 1.35
        assert "E_製造業_鉄鋼業" in result
        assert result["E_製造業_鉄鋼業"] == 2.10

    def test_skips_null_employee(self):
        resas_data = [
            {"simcCode": "09", "simcName": "食料品", "employee": None, "value": 0.8},
        ]
        result = prepare_lq_inputs_from_resas(resas_data, aggregate_to_major=False)
        assert len(result) == 0

    def test_aggregate_to_major(self):
        resas_data = [
            {"simcCode": "09", "simcName": "食料品", "employee": 1.35},
            {"simcCode": "22", "simcName": "鉄鋼業", "employee": 2.10},
        ]
        result = prepare_lq_inputs_from_resas(resas_data, aggregate_to_major=True)
        assert "製造業" in result


class TestPrepareLQFromEStat:
    def test_common_industries_only(self):
        local = {"製造業": 5000, "サービス業": 3000, "農業": 100}
        national = {"製造業": 500000, "サービス業": 800000}
        l, n = prepare_lq_inputs_from_estat(local, national)
        assert set(l.keys()) == {"製造業", "サービス業"}
        assert set(n.keys()) == {"製造業", "サービス業"}
        assert "農業" not in l

    def test_empty_when_no_common(self):
        local = {"農業": 100}
        national = {"製造業": 500000}
        l, n = prepare_lq_inputs_from_estat(local, national)
        assert l == {}
        assert n == {}

    def test_with_name_mapping(self):
        local = {"E": 5000}
        national = {"E": 500000}
        name_map = {"E": "製造業"}
        l, n = prepare_lq_inputs_from_estat(local, national, industry_name_map=name_map)
        assert "製造業" in l


class TestPrepareShiftShareInputs:
    def test_filters_to_common_industries(self):
        lt0 = {"A": 100, "B": 200, "C": 300}
        lt1 = {"A": 110, "B": 190}
        nt0 = {"A": 10000, "B": 20000, "C": 30000}
        nt1 = {"A": 10500, "B": 19000, "C": 31000}
        l0, l1, n0, n1 = prepare_shift_share_inputs(lt0, lt1, nt0, nt1)
        assert set(l0.keys()) == {"A", "B"}
        assert set(l1.keys()) == {"A", "B"}

    def test_empty_when_no_common(self):
        l0, l1, n0, n1 = prepare_shift_share_inputs(
            {"A": 1}, {"B": 2}, {"C": 3}, {"D": 4}
        )
        assert l0 == {}


class TestPrepareGapAnalysisSectors:
    def test_merges_demand_and_supply(self):
        demand = {"食品": 1000, "衣料品": 500}
        supply = {"食品": 800, "家電": 200}
        sectors = prepare_gap_analysis_sectors(demand, supply)
        names = [s["sector"] for s in sectors]
        assert "食品" in names
        assert "衣料品" in names
        assert "家電" in names
        food = next(s for s in sectors if s["sector"] == "食品")
        assert food["demand"] == 1000
        assert food["supply"] == 800

    def test_missing_sector_defaults_to_zero(self):
        demand = {"食品": 1000}
        supply = {"家電": 200}
        sectors = prepare_gap_analysis_sectors(demand, supply)
        food = next(s for s in sectors if s["sector"] == "食品")
        assert food["supply"] == 0.0
        elec = next(s for s in sectors if s["sector"] == "家電")
        assert elec["demand"] == 0.0


class TestExtractPopulation:
    def test_extracts_latest_actual(self):
        data = {
            "boundaryYear": 2020,
            "data": [
                {
                    "label": "総人口",
                    "data": [
                        {"year": 2015, "value": 100000},
                        {"year": 2020, "value": 110000},
                        {"year": 2025, "value": 115000},  # 推計
                    ],
                }
            ],
        }
        pop = extract_population_from_resas(data)
        assert pop == 110000.0  # 2020 (boundaryYear) が最新実績

    def test_specific_year(self):
        data = {
            "boundaryYear": 2020,
            "data": [
                {
                    "label": "総人口",
                    "data": [
                        {"year": 2015, "value": 100000},
                        {"year": 2020, "value": 110000},
                    ],
                }
            ],
        }
        assert extract_population_from_resas(data, target_year=2015) == 100000.0

    def test_returns_none_on_empty(self):
        assert extract_population_from_resas({}) is None
        assert extract_population_from_resas({"data": []}) is None
