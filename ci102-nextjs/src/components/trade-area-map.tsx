"use client";

import { useMemo } from "react";
import Map, { Source, Layer, Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  centerLon: number;
  centerLat: number;
  radiusKm: number;
  munisInRadius: Array<{ code: string; centroid: { name: string; lon: number; lat: number }; distance_km: number }>;
}

/** 円のポリゴンを生成（haversine 近似、64セグメント） */
function generateCircle(lon: number, lat: number, radiusKm: number): GeoJSON.Feature {
  const points: [number, number][] = [];
  const segments = 64;
  const latRad = (lat * Math.PI) / 180;
  // 1km = 緯度0.009度 / 経度は緯度依存（cos(lat) 倍）
  const dLat = radiusKm / 111.0;
  const dLon = radiusKm / (111.0 * Math.cos(latRad));
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    points.push([lon + dLon * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [points] },
    properties: {},
  };
}

export default function TradeAreaMap({ centerLon, centerLat, radiusKm, munisInRadius }: Props) {
  const circle = useMemo(() => generateCircle(centerLon, centerLat, radiusKm), [centerLon, centerLat, radiusKm]);

  // ズーム自動調整: 半径に応じて
  const zoom = useMemo(() => {
    if (radiusKm <= 1) return 13;
    if (radiusKm <= 2) return 12;
    if (radiusKm <= 5) return 11;
    if (radiusKm <= 10) return 10;
    return 8.5;
  }, [radiusKm]);

  return (
    <Map
      initialViewState={{ longitude: centerLon, latitude: centerLat, zoom }}
      key={`${centerLon}-${centerLat}-${radiusKm}`}
      style={{ width: "100%", height: "100%" }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
    >
      {/* 半径円 */}
      <Source id="trade-area-circle" type="geojson" data={circle as any}>
        <Layer
          id="circle-fill"
          type="fill"
          paint={{ "fill-color": "#10B981", "fill-opacity": 0.15 }}
        />
        <Layer
          id="circle-line"
          type="line"
          paint={{ "line-color": "#059669", "line-width": 2, "line-dasharray": [3, 2] }}
        />
      </Source>

      {/* 中心ピン */}
      <Marker longitude={centerLon} latitude={centerLat} anchor="bottom">
        <div className="text-2xl" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}>📍</div>
      </Marker>

      {/* 圏内市区町村のセントロイドピン */}
      {munisInRadius.map((m) => (
        <Marker key={m.code} longitude={m.centroid.lon} latitude={m.centroid.lat} anchor="center">
          <div
            className="rounded-full border-2 border-emerald-600 bg-white text-[8px] font-semibold px-1 py-0.5 whitespace-nowrap"
            title={`${m.centroid.name} (${m.distance_km.toFixed(1)}km)`}
          >
            {m.centroid.name}
          </div>
        </Marker>
      ))}
    </Map>
  );
}
