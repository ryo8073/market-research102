"use client";

import { useState } from "react";
import Map, { Source, Layer, Popup, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
// NlniLayerId keys arrive as string[] via props

interface Props {
  geojson: any;
  center: [number, number];
  fillColor: any;
  overlays: Record<string, any>;
  activeLayers: string[];
}

/**
 * Separated MapLibre component for municipality map.
 * Imported via next/dynamic (ssr:false) from map-tab.tsx.
 *
 * Key design: this component does NOT re-mount when overlays/layers change.
 * MapLibre handles layer add/remove internally via Source/Layer reconciliation.
 */
export default function MuniMapInner({ geojson, center, fillColor, overlays, activeLayers }: Props) {
  const [hover, setHover] = useState<{
    lng: number; lat: number; name: string;
    basicRatio?: number; segment?: string; totalEmp?: number;
    maxLq?: number; maxLqIndustry?: string;
  } | null>(null);

  const activeSet = new Set(activeLayers);

  return (
    <Map
      initialViewState={{ longitude: center[0], latitude: center[1], zoom: 9 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      interactiveLayerIds={["muni-fill"]}
      onMouseMove={(e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (f) {
          setHover({
            lng: e.lngLat.lng,
            lat: e.lngLat.lat,
            name: f.properties?.area_name ?? f.properties?.N03_004 ?? "",
            basicRatio: f.properties?.basic_ratio,
            segment: f.properties?.segment,
            totalEmp: f.properties?.total_emp,
            maxLq: f.properties?.max_lq,
            maxLqIndustry: f.properties?.max_lq_industry,
          });
        } else {
          setHover(null);
        }
      }}
      onMouseLeave={() => setHover(null)}
    >
      {/* Base municipality layer */}
      <Source id="muni" type="geojson" data={geojson}>
        <Layer
          id="muni-fill"
          type="fill"
          paint={{
            "fill-color": fillColor,
            "fill-opacity": 0.6,
          }}
        />
        <Layer
          id="muni-line"
          type="line"
          paint={{
            "line-color": "#1B2A4A",
            "line-width": 1,
          }}
        />
      </Source>

      {/* NLNI Overlays — conditionally rendered without re-mounting the map */}
      {activeSet.has("railways") && overlays.railways && (
        <Source id="nlni-railways" type="geojson" data={overlays.railways}>
          <Layer id="nlni-railways-circle" type="circle" paint={{ "circle-radius": 4, "circle-color": "#1B2A4A", "circle-opacity": 0.8 }} />
        </Source>
      )}
      {activeSet.has("land_prices") && overlays.land_prices && (
        <Source id="nlni-land-prices" type="geojson" data={overlays.land_prices}>
          <Layer id="nlni-land-prices-circle" type="circle" paint={{ "circle-radius": 3, "circle-color": "#E76F51", "circle-opacity": 0.7 }} />
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
          <Layer id="nlni-zoning-line" type="line" paint={{ "line-color": "#D4A843", "line-width": 0.5, "line-opacity": 0.6 }} />
        </Source>
      )}
      {activeSet.has("location_opt") && overlays.location_opt && (
        <Source id="nlni-location-opt" type="geojson" data={overlays.location_opt}>
          <Layer id="nlni-location-opt-fill" type="fill" paint={{ "fill-color": "#8B5CF6", "fill-opacity": 0.3 }} />
        </Source>
      )}

      {hover && (
        <Popup longitude={hover.lng} latitude={hover.lat} closeButton={false} anchor="top">
          <div className="text-xs">
            <p className="font-bold">{hover.name}</p>
            {hover.basicRatio != null && <p>基盤比率: {hover.basicRatio.toFixed(1)}%</p>}
            {hover.segment && <p>セグメント: {hover.segment}</p>}
            {hover.totalEmp != null && hover.totalEmp > 0 && <p>総雇用: {hover.totalEmp.toLocaleString()}</p>}
            {hover.maxLqIndustry && <p>最大LQ: {hover.maxLqIndustry} ({hover.maxLq?.toFixed(2)})</p>}
          </div>
        </Popup>
      )}
    </Map>
  );
}
