"use client";

import { useState, useEffect } from "react";

export interface CommuteZone {
  name: string;
  type: "MEA" | "McEA";
  centers: string[];
  suburbs: string[];
  all: string[];
  did_pop: number;
}

interface CommuteZonesData {
  zones: Record<string, CommuteZone>;
  muni_to_zone: Record<string, string>;
}

let _cache: CommuteZonesData | null = null;

export function useCommuteZones() {
  const [data, setData] = useState<CommuteZonesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) {
      setData(_cache);
      return;
    }
    setLoading(true);
    fetch("/data/commute_zones.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: CommuteZonesData) => {
        _cache = json;
        setData(json);
      })
      .catch((err) => {
        console.error("[useCommuteZones]", err);
        setError(String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

/** 市区町村コードから所属する通勤経済圏を取得 */
export function getZoneForMunicipality(
  data: CommuteZonesData,
  muniCode: string,
): { zoneId: string; zone: CommuteZone } | null {
  const zoneId = data.muni_to_zone[muniCode];
  if (!zoneId) return null;
  const zone = data.zones[zoneId];
  if (!zone) return null;
  return { zoneId, zone };
}
