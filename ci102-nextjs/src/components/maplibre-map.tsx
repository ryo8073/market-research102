"use client";

import { useCallback, useMemo, useState } from "react";
import Map, { Source, Layer, Popup, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

// Free tile source (OpenStreetMap via Versatiles)
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Japan center
const JAPAN_CENTER = { longitude: 137.0, latitude: 37.5 };
const JAPAN_ZOOM = 4.5;

export interface ChoroplethFeature {
  code: string;
  name: string;
  value: number;
}

interface Props {
  geojsonUrl: string;
  data: ChoroplethFeature[];
  featureCodeProperty: string; // GeoJSON property for matching (e.g. "N03_007" for municipality)
  featureNameProperty: string; // GeoJSON property for name
  valueLabel: string;
  colorScale?: [string, string, string]; // [low, mid, high]
  midpoint?: number;
  center?: { longitude: number; latitude: number };
  zoom?: number;
  height?: number;
}

export default function ChoroplethMap({
  geojsonUrl,
  data,
  featureCodeProperty,
  featureNameProperty,
  valueLabel,
  colorScale = ["#2166ac", "#f7f7f7", "#b2182b"],
  midpoint = 1.0,
  center = JAPAN_CENTER,
  zoom = JAPAN_ZOOM,
  height = 600,
}: Props) {
  const [hoverInfo, setHoverInfo] = useState<{
    longitude: number;
    latitude: number;
    name: string;
    value: number | null;
  } | null>(null);

  // Build lookup map: code -> value
  const lookup = useMemo(() => {
    const m: Record<string, { name: string; value: number }> = {};
    for (const d of data) {
      m[d.code] = { name: d.name, value: d.value };
    }
    return m;
  }, [data]);

  // Compute min/max for color interpolation
  const { minVal, maxVal } = useMemo(() => {
    const values = data.map((d) => d.value).filter((v) => v != null && isFinite(v));
    return {
      minVal: Math.min(...values, 0),
      maxVal: Math.max(...values, midpoint * 2),
    };
  }, [data, midpoint]);

  // Build match expression for fill-color
  const fillColorExpression: any = useMemo(() => {
    if (data.length === 0) return "#cccccc";

    const stops: any[] = [];
    for (const d of data) {
      // Normalize to 0-1 range around midpoint
      const ratio = maxVal !== minVal ? (d.value - minVal) / (maxVal - minVal) : 0.5;
      const r = Math.max(0, Math.min(1, ratio));
      stops.push(d.code, interpolateColor(colorScale, r));
    }

    return ["match", ["to-string", ["get", featureCodeProperty]], ...stops, "#cccccc"];
  }, [data, featureCodeProperty, colorScale, minVal, maxVal]);

  const onHover = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (feature) {
        const code = feature.properties?.[featureCodeProperty];
        const info = lookup[code];
        setHoverInfo({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          name: info?.name ?? feature.properties?.[featureNameProperty] ?? code,
          value: info?.value ?? null,
        });
      } else {
        setHoverInfo(null);
      }
    },
    [featureCodeProperty, featureNameProperty, lookup],
  );

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border">
      <Map
        initialViewState={{ ...center, zoom }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={["choropleth-fill"]}
        onMouseMove={onHover}
        onMouseLeave={() => setHoverInfo(null)}
      >
        <Source id="choropleth" type="geojson" data={geojsonUrl}>
          <Layer
            id="choropleth-fill"
            type="fill"
            paint={{
              "fill-color": fillColorExpression,
              "fill-opacity": 0.7,
            }}
          />
          <Layer
            id="choropleth-line"
            type="line"
            paint={{
              "line-color": "#333",
              "line-width": 0.5,
            }}
          />
        </Source>

        {hoverInfo && (
          <Popup
            longitude={hoverInfo.longitude}
            latitude={hoverInfo.latitude}
            closeButton={false}
            anchor="top"
          >
            <div className="text-xs">
              <p className="font-bold">{hoverInfo.name}</p>
              {hoverInfo.value != null && (
                <p>
                  {valueLabel}: {hoverInfo.value.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                </p>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}

/** Linear interpolation between 3 colors */
function interpolateColor(colors: [string, string, string], t: number): string {
  const [low, mid, high] = colors.map(hexToRgb);
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const s = t * 2;
    r = low[0] + (mid[0] - low[0]) * s;
    g = low[1] + (mid[1] - low[1]) * s;
    b = low[2] + (mid[2] - low[2]) * s;
  } else {
    const s = (t - 0.5) * 2;
    r = mid[0] + (high[0] - mid[0]) * s;
    g = mid[1] + (high[1] - mid[1]) * s;
    b = mid[2] + (high[2] - mid[2]) * s;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}
