"use client";

import { useState, useEffect } from "react";

/**
 * NLNI overlay GeoJSON lazy-loading hook.
 *
 * Loads from /data/nlni/{layerId}_{prefCode}.geojson on demand.
 * Returns null if not yet loaded or file doesn't exist.
 */

const _cache: Record<string, any> = {};

export type NlniLayerId =
  | "railways"
  | "flood"
  | "zoning"
  | "land_prices"
  | "did"
  | "location_opt";

export interface NlniLayerConfig {
  id: NlniLayerId;
  label: string;
  type: "line" | "fill" | "circle";
  color: string;
  opacity: number;
}

export const NLNI_LAYERS: NlniLayerConfig[] = [
  { id: "railways", label: "鉄道路線", type: "line", color: "#1B2A4A", opacity: 0.8 },
  { id: "flood", label: "洪水浸水想定区域", type: "fill", color: "#3B82F6", opacity: 0.3 },
  { id: "zoning", label: "用途地域", type: "fill", color: "#D4A843", opacity: 0.2 },
  { id: "land_prices", label: "地価公示", type: "circle", color: "#E76F51", opacity: 0.7 },
  { id: "did", label: "人口集中地区(DID)", type: "fill", color: "#2A9D8F", opacity: 0.25 },
  { id: "location_opt", label: "立地適正化計画", type: "fill", color: "#8B5CF6", opacity: 0.3 },
];

export function useNlniOverlay(prefCode: number, layerId: NlniLayerId, enabled: boolean) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    const cacheKey = `${layerId}_${prefCode}`;
    if (_cache[cacheKey]) {
      setData(_cache[cacheKey]);
      return;
    }

    setLoading(true);
    setError(null);

    const url = `/data/nlni/${layerId}_${String(prefCode).padStart(2, "0")}.geojson`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((json) => {
        _cache[cacheKey] = json;
        setData(json);
      })
      .catch((err) => {
        console.warn(`NLNI overlay ${layerId} not available for pref ${prefCode}:`, err.message);
        setError(err.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [prefCode, layerId, enabled]);

  return { data, loading, error };
}
