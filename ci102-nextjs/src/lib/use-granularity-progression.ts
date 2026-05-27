"use client";

/**
 * 粒度進行データフック — Mulligan & Murphy (1995) 凸性質の可視化用。
 *
 * 大分類17 → 中分類95 → +細分類 と業種粒度を細かくすると、EBM が
 * 単調減少する様子を3点プロット可能なデータを提供する。
 */
import { useState, useEffect } from "react";

export interface GranularityLevel {
  label: string;
  n_industries: number;
  ebm: number;
  basic_ratio_pct: number;
  n_basic: number;
}

export interface GranularityProgression {
  pref_name: string;
  levels: GranularityLevel[];
  orlando_benchmark: {
    ebm: number;
    basic_ratio_pct: number;
    n_basic: number;
  };
}

let _cache: Record<string, GranularityProgression> | null = null;

export function useGranularityProgression(prefCode: number) {
  const [data, setData] = useState<GranularityProgression | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) {
      setData(_cache[String(prefCode)] ?? null);
      return;
    }
    setLoading(true);
    fetch("/data/granularity_progression.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: Record<string, GranularityProgression>) => {
        _cache = json;
        setData(json[String(prefCode)] ?? null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [prefCode]);

  return { data, loading, error };
}
