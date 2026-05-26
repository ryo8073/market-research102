"use client";

import { useState, useEffect } from "react";

export interface MetroData {
  key: string;
  name: string;
  prefectures: number[];
  pref_names: string[];
  core_pref: number;
  note: string;
  population: number;
  households: number;
  total_employment: number;
  ebm: number;
  per: number;
  basic_emp: number;
  basic_ratio: number;
  top_lq_industries: Array<{
    industry: string;
    lq: number;
    basic_emp_estimate: number;
  }>;
  rs_total: number;
  top_rs_industry: string;
  top_rs_value: number;
  aggregate_gap_factor: number;
  // 多角化指標
  n_basic_industries?: number;
  hhi?: number;
  effective_n_industries?: number;
  shannon_entropy?: number;
  top5_share?: number;
  max_lq?: number;
}

let _cache: Record<string, MetroData> | null = null;

export function useMetroData() {
  const [allMetros, setAllMetros] = useState<Record<string, MetroData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) {
      setAllMetros(_cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("/data/metro_summary.json")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status} for /data/metro_summary.json`);
        }
        return r.json();
      })
      .then((json: Record<string, MetroData>) => {
        _cache = json;
        setAllMetros(json);
      })
      .catch((err) => {
        console.error("[useMetroData]", err);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  return { allMetros, loading, error };
}
