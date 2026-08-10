"use client";

import { useState, useEffect } from "react";

/** 市区町村×業種マトリクス */
export interface MuniIndustryEntry {
  area_name: string;
  pref_code: number;
  employment: Record<string, number>;
}

let _cache: Record<string, MuniIndustryEntry> | null = null;
let _cacheMid: Record<string, MuniIndustryEntry> | null = null;

function _useFetchMatrix(url: string, cacheRef: { current: Record<string, MuniIndustryEntry> | null }, enabled = true) {
  const [matrix, setMatrix] = useState<Record<string, MuniIndustryEntry> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (cacheRef.current) {
      setMatrix(cacheRef.current);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: Record<string, MuniIndustryEntry>) => {
        cacheRef.current = json;
        setMatrix(json);
      })
      .catch((err) => {
        console.error(`[useMuniIndustryMatrix] ${url}`, err);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, [url, cacheRef, enabled]);

  return { matrix, loading, error };
}

const _majorRef = { get current() { return _cache; }, set current(v) { _cache = v; } };
const _midRef = { get current() { return _cacheMid; }, set current(v) { _cacheMid = v; } };

/** 大分類17業種マトリクス */
export function useMuniIndustryMatrix() {
  return _useFetchMatrix("/data/muni_industry_matrix.json", _majorRef);
}

/** 中分類95業種マトリクス（enabled=falseで遅延ロード可能） */
export function useMuniIndustryMatrixMid(enabled = true) {
  return _useFetchMatrix("/data/muni_industry_matrix_mid.json", _midRef, enabled);
}

/** 複数市区町村の雇用を業種別に合算 */
export function aggregateEmployment(
  matrix: Record<string, MuniIndustryEntry>,
  areaCodes: string[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const code of areaCodes) {
    const entry = matrix[code];
    if (!entry) continue;
    for (const [industry, count] of Object.entries(entry.employment)) {
      result[industry] = (result[industry] || 0) + count;
    }
  }
  return result;
}

/** カスタム経済圏のLQテーブル+基盤雇用を計算 */
export interface CustomMetroResult {
  total_employment: number;
  basic_employment: number;
  basic_ratio: number;
  ebm: number;
  n_basic_industries: number;
  top_lq_industries: Array<{ industry: string; local_emp: number; lq: number; basic_emp: number }>;
  hhi: number;
  effective_n_industries: number;
  shannon_entropy: number;
}

export function computeCustomMetro(
  matrix: Record<string, MuniIndustryEntry>,
  selectedAreaCodes: string[],
): CustomMetroResult | null {
  if (selectedAreaCodes.length === 0) return null;

  const local = aggregateEmployment(matrix, selectedAreaCodes);
  const national = matrix["00000"]?.employment ?? {};
  const totalLocal = Object.values(local).reduce((s, v) => s + v, 0);
  const totalNational = Object.values(national).reduce((s, v) => s + v, 0);
  if (totalLocal === 0 || totalNational === 0) return null;

  const lqRows: Array<{ industry: string; local_emp: number; lq: number; basic_emp: number }> = [];
  let totalBasic = 0;
  for (const industry of Object.keys(local)) {
    const e = local[industry];
    const E = national[industry] ?? 0;
    if (E === 0) continue;
    const lq = (e / totalLocal) / (E / totalNational);
    const basic = lq > 1.0 ? e * (1 - 1 / lq) : 0;
    if (basic > 0) totalBasic += basic;
    lqRows.push({ industry, local_emp: e, lq, basic_emp: basic });
  }

  // 多角化指標
  const shares = Object.values(local).filter((v) => v > 0).map((v) => v / totalLocal);
  const hhi = shares.reduce((s, x) => s + x * x, 0) * 10000;
  const effective_n = 1 / shares.reduce((s, x) => s + x * x, 0);
  const shannon = -shares.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0);

  const top = lqRows.filter((r) => r.lq > 1.0).sort((a, b) => b.basic_emp - a.basic_emp).slice(0, 10);

  return {
    total_employment: totalLocal,
    basic_employment: totalBasic,
    basic_ratio: (totalBasic / totalLocal) * 100,
    ebm: totalBasic > 0 ? totalLocal / totalBasic : 0,
    n_basic_industries: lqRows.filter((r) => r.lq > 1.0).length,
    top_lq_industries: top,
    hhi,
    effective_n_industries: effective_n,
    shannon_entropy: shannon,
  };
}
