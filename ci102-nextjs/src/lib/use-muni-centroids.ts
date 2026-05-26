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

export interface MuniWithDriveTime {
  code: string;
  centroid: MuniCentroid;
  distance_km: number;       // haversine 直線距離 (フォールバック用)
  drive_min: number | null;  // OSRM 走行時間 (分)
  drive_km: number | null;   // OSRM 走行距離 (km)
}

/**
 * OSRM Table API 経由で中心点から各市区町村までの走行時間を計算し、
 * maxMinutes 以内の市区町村のみを返す。
 *
 * パフォーマンス対策:
 *   - haversine で事前フィルタ (走行時間×平均速度 60km/h で初期半径を推定)
 *   - 候補数が多すぎる場合は haversine 距離順に上位500件に絞る
 *   - API側でバッチ分割 (1バッチ80件、200ms間隔)
 *
 * @param maxMinutes 最大走行時間 (分)
 * @returns drive_min が maxMinutes 以下の市区町村
 */
export async function findMunicipalitiesInDriveTime(
  centroids: Record<string, MuniCentroid>,
  centerLon: number,
  centerLat: number,
  maxMinutes: number,
): Promise<{
  result: MuniWithDriveTime[];
  candidatesTotal: number;
  candidatesQueried: number;
  apiLatencyMs: number;
}> {
  // 初期半径推定: 走行時間 × 80km/h (高速道路を考慮した上限)
  // 例: 30分 → 40km、60分 → 80km。実際の到達範囲より広めに取って取りこぼし防止
  const initialRadiusKm = Math.max(maxMinutes * 1.5, 10);

  // 候補抽出 (haversine)
  const candidates = findMunicipalitiesInRadius(centroids, centerLon, centerLat, initialRadiusKm);

  // 上限500件 (OSRM Table API 制約)
  const queried = candidates.slice(0, 500);

  if (queried.length === 0) {
    return { result: [], candidatesTotal: 0, candidatesQueried: 0, apiLatencyMs: 0 };
  }

  const startTime = Date.now();
  const r = await fetch("/api/osrm-table", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      src: [centerLon, centerLat],
      destinations: queried.map((q) => [q.centroid.lon, q.centroid.lat]),
    }),
  });
  const apiLatencyMs = Date.now() - startTime;

  if (!r.ok) {
    throw new Error(`OSRM API エラー: ${r.status}`);
  }
  const data: {
    durations_min: (number | null)[];
    distances_km: (number | null)[];
  } = await r.json();

  const filtered: MuniWithDriveTime[] = [];
  for (let i = 0; i < queried.length; i++) {
    const dur = data.durations_min[i];
    const dist = data.distances_km[i];
    if (dur != null && dur <= maxMinutes) {
      filtered.push({
        code: queried[i].code,
        centroid: queried[i].centroid,
        distance_km: queried[i].distance_km,
        drive_min: dur,
        drive_km: dist,
      });
    }
  }
  filtered.sort((a, b) => (a.drive_min ?? Infinity) - (b.drive_min ?? Infinity));

  return {
    result: filtered,
    candidatesTotal: candidates.length,
    candidatesQueried: queried.length,
    apiLatencyMs,
  };
}
