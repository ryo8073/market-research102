"use client";

import { useState, useEffect } from "react";

export interface PrefectureData {
  pref_code: number;
  pref_name: string;
  population: number;
  households: number;
  total_employment: number;
  persons_per_household: number;
  ebm: number;
  per: number;
  basic_emp: number;
  basic_ratio: number;
  top_lq_industries: Array<{ industry: string; lq: number; basic_emp_estimate: number }>;
  rs_total: number;
  actual_emp_change: number;
  top_rs_industry: string;
  top_rs_value: number;
  aggregate_gap_factor: number;
  num_leakage_sectors: number;
  num_surplus_sectors: number;
  suitability_score: {
    total_score: number;
    ebm_score: number;
    ratio_score: number;
    rs_score: number;
    gap_score: number;
    scale_score: number;
  };
  daytime_population: number;
  median_unit_price: number | null;
  // NLNI spatial data (optional — populated when NLNI data is downloaded)
  num_stations?: number;
  total_daily_riders?: number;
  land_price_median_l01?: number;
  flood_risk_avg_pct?: number;
  did_total_area_ha?: number;
  did_total_population?: number;
  num_medical?: number;
  num_commercial?: number;
  total_bus_stops?: number;
  pop_projection?: Record<string, number>;
  pop_change_pct?: number;
  has_location_plan_count?: number;
  total_road_segments?: number;
  lq_table: Array<{
    industry: string;
    local_emp: number;
    national_emp: number;
    lq: number;
    basic_emp_estimate: number;
  }>;
  shift_share_table: Array<{
    industry: string;
    actual_change: number;
    national_growth: number;
    industry_mix: number;
    regional_shift: number;
    total_share: number;
  }>;
  gap_table: Array<{
    sector: string;
    demand: number;
    supply: number;
    gap: number;
    factor: number;
    verdict: string;
  }>;
}

let _cache: Record<string, PrefectureData> | null = null;

export function usePrefectureData(prefCode: number) {
  const [data, setData] = useState<PrefectureData | null>(null);
  const [allData, setAllData] = useState<Record<string, PrefectureData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) {
      setAllData(_cache);
      setData(_cache[String(prefCode)] ?? null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetch("/data/prefectures.json")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} for /data/prefectures.json`);
        }
        return r.json();
      })
      .then((json: Record<string, PrefectureData>) => {
        _cache = json;
        setAllData(json);
        setData(json[String(prefCode)] ?? null);
      })
      .catch((err) => {
        console.error("[usePrefectureData]", err);
        setError(String(err));
        setData(null);
        setAllData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Update when prefCode changes (data already loaded)
  useEffect(() => {
    if (allData) {
      setData(allData[String(prefCode)] ?? null);
    }
  }, [prefCode, allData]);

  return { data, allData, loading, error };
}
