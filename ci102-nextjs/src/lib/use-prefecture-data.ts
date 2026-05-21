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

  useEffect(() => {
    if (_cache) {
      setAllData(_cache);
      setData(_cache[String(prefCode)] ?? null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/data/prefectures.json")
      .then((r) => r.json())
      .then((json: Record<string, PrefectureData>) => {
        _cache = json;
        setAllData(json);
        setData(json[String(prefCode)] ?? null);
      })
      .catch(() => {
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

  return { data, allData, loading };
}
