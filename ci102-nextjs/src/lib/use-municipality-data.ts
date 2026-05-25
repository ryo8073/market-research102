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
  zoning_dominant?: string;
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
