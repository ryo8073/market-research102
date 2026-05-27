"use client";

/**
 * 卸売・小売業 細分類 LQ データ (都道府県レベル)。
 *
 * Mulligan & Murphy (1995) の LQ 凸性質を、卸売・小売業セクターで
 * 4桁細分類まで拡張。商業不動産のテナント想定に直結する具体性。
 *
 * データソース: e-Stat 0004003257 (経済センサス 2021)
 * 生成: scripts/precompute_minor_retail.py → public/data/minor_retail_lq.json
 * 制限: 都道府県レベルのみ (市区町村別の細分類データは e-Stat に存在しない)
 */
import { useState, useEffect } from "react";

export interface MinorRetailLqEntry {
  code: string;       // 4桁 JSIC コード
  name: string;       // 業種名
  lq: number;         // 立地特化係数
  local_emp: number;  // 当該県の従業者数
  national_emp: number;  // 全国の従業者数
}

export interface MinorRetailLqData {
  pref_name: string;
  pref_total_emp: number;
  top_lq: MinorRetailLqEntry[];
}

type AllData = Record<string, MinorRetailLqData>;

let _cache: AllData | null = null;

export function useMinorRetailLq(prefCode: number) {
  const [data, setData] = useState<MinorRetailLqData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) {
      setData(_cache[String(prefCode)] ?? null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("/data/minor_retail_lq.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: AllData) => {
        _cache = json;
        setData(json[String(prefCode)] ?? null);
      })
      .catch((err) => {
        console.error("[useMinorRetailLq]", err);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, [prefCode]);

  return { data, loading, error };
}
