"use client";

import { useState, useEffect } from "react";

export interface MuniCentroid {
  name: string;
  lon: number;
  lat: number;
  pref_code: number;
  // OSRM 走行距離・時間（市区町村セントロイドから最寄り施設まで）
  nearest_station_km?: number;
  nearest_station_min?: number;
  nearest_medical_km?: number;
  nearest_medical_min?: number;
  nearest_commercial_km?: number;
  nearest_commercial_min?: number;
  car_dependency_score?: number;  // 0-100, 高いほど車依存
}

let _cache: Record<string, MuniCentroid> | null = null;

export function useMuniCentroids() {
  const [centroids, setCentroids] = useState<Record<string, MuniCentroid> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) {
      setCentroids(_cache);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("/data/muni_centroids.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: Record<string, MuniCentroid>) => {
        _cache = json;
        setCentroids(json);
      })
      .catch((err) => {
        console.error("[useMuniCentroids]", err);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  return { centroids, loading, error };
}

/** Great-circle distance in km between two (lon, lat) points */
export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371.0;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dlon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Find municipalities within radius_km of (lon, lat) */
export function findMunicipalitiesInRadius(
  centroids: Record<string, MuniCentroid>,
  centerLon: number,
  centerLat: number,
  radiusKm: number,
): Array<{ code: string; centroid: MuniCentroid; distance_km: number }> {
  const result: Array<{ code: string; centroid: MuniCentroid; distance_km: number }> = [];
  for (const [code, c] of Object.entries(centroids)) {
    const d = haversineKm(centerLon, centerLat, c.lon, c.lat);
    if (d <= radiusKm) {
      result.push({ code, centroid: c, distance_km: d });
    }
  }
  result.sort((a, b) => a.distance_km - b.distance_km);
  return result;
}
