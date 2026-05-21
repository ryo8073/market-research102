"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Fetch MLIT transaction data for a given prefecture/quarter.
 */
export function useMlitData(prefCode: number, year: number, quarter: number, cityCode?: number) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefCode) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      prefCode: String(prefCode),
      year: String(year),
      quarter: String(quarter),
    });
    if (cityCode) params.set("cityCode", String(cityCode));

    fetch(`/api/mlit?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setData(json.data ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [prefCode, year, quarter, cityCode]);

  return { data, loading, error };
}

/**
 * Fetch Proformer analysis by external ID.
 */
export function useProformerData() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async (externalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proformer?externalId=${externalId}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetch: fetch_ };
}
