"use client";

/**
 * 粒度進行データフック — Mulligan & Murphy (1995) 凸性質の可視化用。
 *
 * 大分類17 → 中分類95 → +細分類 と業種粒度を細かくすると、EBM が
 * 単調減少する様子を3点プロット可能なデータを提供する。
 */
import { useState, useEffect } from "react";

export interface BasicIndustryEntry {
  name: string;
  lq: number;
}

export interface GranularityLevel {
  label: string;
  n_industries: number;
  ebm: number;
  basic_ratio_pct: number;
  n_basic: number;
  basic_industries?: BasicIndustryEntry[];
  /** この level で初めて LQ>1 になった業種 (一つ前の level にはなかった) */
  newly_added?: BasicIndustryEntry[];
}

export interface GranularityProgression {
  pref_name: string;
  /** L2 EBM ÷ L0 EBM × 100 — 100以下なら粒度効果あり (低いほど効果大) */
  compression_pct: number;
  /** L0 - L2 (粒度を細かくして EBM がいくら下がったか) */
  ebm_reduction: number;
  /** L2 EBM が Orlando 4.94 ±0.56 の範囲内 (≤ 5.5) か */
  in_textbook_range: boolean;
  levels: GranularityLevel[];
  orlando_benchmark: {
    ebm: number;
    basic_ratio_pct: number;
    n_basic: number;
  };
}

let _cache: Record<string, GranularityProgression> | null = null;
let _allDataCache: Record<string, GranularityProgression> | null = null;

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
        _allDataCache = json;
        setData(json[String(prefCode)] ?? null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [prefCode]);

  return { data, loading, error };
}

/** 全47都道府県のデータを返すフック (compare ページ用) */
export function useAllGranularityProgression() {
  const [data, setData] = useState<Record<string, GranularityProgression> | null>(_allDataCache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_allDataCache) {
      setData(_allDataCache);
      return;
    }
    setLoading(true);
    fetch("/data/granularity_progression.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: Record<string, GranularityProgression>) => {
        _allDataCache = json;
        _cache = json;
        setData(json);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
