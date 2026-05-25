"use client";

import { useState, useCallback } from "react";
import Map, { Source, Layer, Popup, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  geojson: any;
  center: [number, number];
  fillColor: any;
  overlays: Record<string, any>;
  activeLayers: string[];
}

type HoverInfo =
  | { type: "muni"; lng: number; lat: number; name: string; basicRatio?: number; segment?: string; totalEmp?: number; maxLq?: number; maxLqIndustry?: string }
  | { type: "land_price"; lng: number; lat: number; price: number; use: string; station: string }
  | { type: "railway"; lng: number; lat: number; name: string; riders?: number };

export default function MuniMapInner({ geojson, center, fillColor, overlays, activeLayers }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const activeSet = new Set(activeLayers);

  // All interactive layer IDs
  const interactiveIds = ["muni-fill"];
  if (activeSet.has("land_prices") && overlays.land_prices) interactiveIds.push("nlni-land-prices-circle");
  if (activeSet.has("railways") && overlays.railways) interactiveIds.push("nlni-railways-circle");

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) { setHover(null); return; }

    const layerId = f.layer?.id;

    if (layerId === "nlni-land-prices-circle") {
      setHover({
        type: "land_price",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        price: f.properties?.price ?? 0,
        use: f.properties?.station ?? "",   // CSV columns are swapped: "station" actually has use
        station: f.properties?.use ?? "",   // "use" actually has station/area name
      });
    } else if (layerId === "nlni-railways-circle") {
      setHover({
        type: "railway",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: f.properties?.name ?? "",
        riders: f.properties?.riders,
      });
    } else {
      setHover({
        type: "muni",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: f.properties?.area_name ?? f.properties?.N03_004 ?? "",
        basicRatio: f.properties?.basic_ratio,
        segment: f.properties?.segment,
        totalEmp: f.properties?.total_emp,
        maxLq: f.properties?.max_lq,
        maxLqIndustry: f.properties?.max_lq_industry,
      });
    }
  }, []);

  return (
    <Map
      initialViewState={{ longitude: center[0], latitude: center[1], zoom: 9 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      interactiveLayerIds={interactiveIds}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* Base municipality layer */}
      <Source id="muni" type="geojson" data={geojson}>
        <Layer
          id="muni-fill"
          type="fill"
          paint={{ "fill-color": fillColor, "fill-opacity": 0.6 }}
        />
        <Layer
          id="muni-line"
          type="line"
          paint={{ "line-color": "#1B2A4A", "line-width": 1 }}
        />
      </Source>

      {/* NLNI Overlays */}
      {activeSet.has("railways") && overlays.railways && (
        <Source id="nlni-railways" type="geojson" data={overlays.railways}>
          <Layer id="nlni-railways-circle" type="circle" paint={{ "circle-radius": 5, "circle-color": "#1B2A4A", "circle-opacity": 0.8, "circle-stroke-width": 1, "circle-stroke-color": "#fff" }} />
        </Source>
      )}
      {activeSet.has("land_prices") && overlays.land_prices && (
        <Source id="nlni-land-prices" type="geojson" data={overlays.land_prices}>
          <Layer id="nlni-land-prices-circle" type="circle" paint={{
            "circle-radius": ["interpolate", ["linear"], ["get", "price"], 30000, 3, 200000, 5, 500000, 8, 1000000, 12],
            "circle-color": ["interpolate", ["linear"], ["get", "price"], 30000, "#fee08b", 100000, "#E76F51", 500000, "#d73027"],
            "circle-opacity": 0.75,
            "circle-stroke-width": 0.5,
            "circle-stroke-color": "#fff",
          }} />
        </Source>
      )}
      {activeSet.has("flood") && overlays.flood && (
        <Source id="nlni-flood" type="geojson" data={overlays.flood}>
          <Layer id="nlni-flood-fill" type="fill" paint={{ "fill-color": "#3B82F6", "fill-opacity": 0.3 }} />
        </Source>
      )}
      {activeSet.has("did") && overlays.did && (
        <Source id="nlni-did" type="geojson" data={overlays.did}>
          <Layer id="nlni-did-fill" type="fill" paint={{ "fill-color": "#2A9D8F", "fill-opacity": 0.25 }} />
        </Source>
      )}
      {activeSet.has("zoning") && overlays.zoning && (
        <Source id="nlni-zoning" type="geojson" data={overlays.zoning}>
          <Layer id="nlni-zoning-fill" type="fill" paint={{ "fill-color": "#D4A843", "fill-opacity": 0.45 }} />
          <Layer id="nlni-zoning-line" type="line" paint={{ "line-color": "#B8941F", "line-width": 0.5, "line-opacity": 0.6 }} />
        </Source>
      )}
      {activeSet.has("location_opt") && overlays.location_opt && (
        <Source id="nlni-location-opt" type="geojson" data={overlays.location_opt}>
          <Layer id="nlni-location-opt-fill" type="fill" paint={{ "fill-color": "#8B5CF6", "fill-opacity": 0.3 }} />
        </Source>
      )}

      {/* Popup */}
      {hover && (
        <Popup longitude={hover.lng} latitude={hover.lat} closeButton={false} anchor="top">
          <div className="text-xs">
            {hover.type === "land_price" && (
              <>
                <p className="font-bold text-[#E76F51]">{hover.price.toLocaleString()}円/m²</p>
                {hover.use && <p>用途: {hover.use}</p>}
                {hover.station && <p>エリア: {hover.station}</p>}
              </>
            )}
            {hover.type === "railway" && (
              <>
                <p className="font-bold">{hover.name}</p>
                {hover.riders != null && hover.riders > 0 && <p>乗降客数: {hover.riders.toLocaleString()}人/日</p>}
              </>
            )}
            {hover.type === "muni" && (
              <>
                <p className="font-bold">{hover.name}</p>
                {hover.basicRatio != null && <p>基盤比率: {hover.basicRatio.toFixed(1)}%</p>}
                {hover.segment && <p>セグメント: {hover.segment}</p>}
                {hover.totalEmp != null && hover.totalEmp > 0 && <p>総雇用: {hover.totalEmp.toLocaleString()}</p>}
                {hover.maxLqIndustry && <p>最大LQ: {hover.maxLqIndustry} ({hover.maxLq?.toFixed(2)})</p>}
              </>
            )}
          </div>
        </Popup>
      )}
    </Map>
  );
}
