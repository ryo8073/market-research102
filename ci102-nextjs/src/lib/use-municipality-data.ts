"use client";

import { useState, useEffect } from "react";

export interface MunicipalityData {
  area_code: string;
  area_name: string;
  total_emp: number;
  basic_emp: number;
  basic_ratio: number;
  num_basic: number;
  max_lq: number;
  max_lq_industry: string;
  segment?: string;
  census2025?: {
    population: number;
    population_2020: number;
    households: number;
    pop_change_pct: number;
    hh_change_pct: number;
    national_pop_change_pct: number;
    momentum_gap: number;
    momentum_class: "growth" | "resilient" | "outperform_decline" | "decline" | "severe_decline";
    density: number;
    source: string;
  };
  // 過去6回分の国勢調査（2000-2025）人口・世帯時系列
  pop_timeseries?: Array<{
    year: number;
    population: number;
    households?: number;
    pop_under15?: number;
    pop_over65?: number;
  }>;
  // NLNI spatial data (optional)
  num_stations?: number;
  daily_riders?: number;
  land_price_median?: number;
  flood_risk_pct?: number;
  max_flood_depth?: number;
  did_area_ha?: number;
  did_population?: number;
  num_medical?: number;
  num_commercial?: number;
  num_bus_stops?: number;
  pop_2030?: number;
  pop_2050?: number;
  has_location_plan?: boolean;
  has_residential_zone?: boolean;  // 居住誘導 or 居住調整
  has_function_zone?: boolean;     // 都市機能誘導
  location_zones_summary?: Record<string, number>;
  zoning_dominant?: string;
  // Driving distance (OSRM)
  nearest_station_km?: number;
  nearest_station_min?: number;
  nearest_station_name?: string;
  nearest_medical_km?: number;
  nearest_medical_min?: number;
  nearest_commercial_km?: number;
  nearest_commercial_min?: number;
  car_dependency_score?: number;
  // 大分類EBM
  ebm?: number;
  // 中分類95業種版（業種粒度補正）
  ebm_mid?: number;
  basic_ratio_mid?: number;
  basic_emp_mid?: number;
  n_basic_industries_mid?: number;
  top_lq_industries_mid?: Array<{ industry: string; lq: number; basic_emp_estimate: number }>;
  // 農林業センサス2020 補完版（家族農家含む推計）
  ebm_mid_extended?: number;
  basic_ratio_mid_extended?: number;
  basic_emp_mid_extended?: number;
  n_basic_industries_extended?: number;
  top_lq_industries_extended?: Array<{ industry: string; lq: number; basic_emp_estimate: number }>;
  agri_eco_workers?: number;
  agri_extended_workers?: number;
}

const _cache: Record<number, MunicipalityData[]> = {};

export function useMunicipalityData(prefCode: number) {
  const [data, setData] = useState<MunicipalityData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache[prefCode]) {
      setData(_cache[prefCode]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const url = `/data/municipalities/${prefCode}.json`;
    fetch(url)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} for ${url}`);
        }
        return r.json();
      })
      .then((json: MunicipalityData[]) => {
        if (!Array.isArray(json)) {
          throw new Error(`Invalid response: expected array, got ${typeof json}`);
        }
        _cache[prefCode] = json;
        setData(json);
      })
      .catch((err) => {
        console.error("[useMunicipalityData]", err);
        setError(String(err));
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [prefCode]);

  return { data, loading, error };
}
