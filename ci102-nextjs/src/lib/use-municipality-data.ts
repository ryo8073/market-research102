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
}

const _cache: Record<number, MunicipalityData[]> = {};

export function useMunicipalityData(prefCode: number) {
  const [data, setData] = useState<MunicipalityData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (_cache[prefCode]) {
      setData(_cache[prefCode]);
      return;
    }

    setLoading(true);
    fetch(`/data/municipalities/${prefCode}.json`)
      .then((r) => r.json())
      .then((json: MunicipalityData[]) => {
        _cache[prefCode] = json;
        setData(json);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [prefCode]);

  return { data, loading };
}
