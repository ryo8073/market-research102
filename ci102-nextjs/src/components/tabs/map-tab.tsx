"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PREFECTURES } from "@/lib/codes";
import { lq_table, total_basic_employment } from "@/lib/calculator";
import { TAKAMATSU_EMP, NATIONAL_EMP } from "@/lib/sample-data";

// Dynamic import to avoid SSR issues with MapLibre
const MapView = dynamic(() => import("@/components/maplibre-map"), { ssr: false });

// Prefecture centers for zoom
const PREF_CENTERS: Record<number, [number, number]> = {
  1: [141.35, 43.06], 13: [139.69, 35.69], 14: [139.64, 35.45],
  23: [136.91, 35.18], 27: [135.52, 34.69], 37: [134.04, 34.34],
  40: [130.42, 33.59], 47: [127.68, 26.34],
};

interface Props {
  prefCode: number;
  prefName: string;
}

type MapMetric = "lq_summary" | "basic_ratio";

export default function MapTab({ prefCode, prefName }: Props) {
  const [metric, setMetric] = useState<MapMetric>("basic_ratio");
  const [muniGeojson, setMuniGeojson] = useState<any>(null);

  // Load municipality TopoJSON and convert to GeoJSON
  useEffect(() => {
    const url = `/geo/N03-21_${String(prefCode).padStart(2, "0")}_210101.json`;
    fetch(url)
      .then((r) => r.json())
      .then(async (topo) => {
        const topojson = await import("topojson-client");
        const objectName = Object.keys(topo.objects)[0];
        const geojson = topojson.feature(topo, topo.objects[objectName]);
        setMuniGeojson(geojson);
      })
      .catch(() => setMuniGeojson(null));
  }, [prefCode]);

  // Compute sample LQ data for all prefectures (demo)
  const prefData = useMemo(() => {
    const lq = lq_table(TAKAMATSU_EMP, NATIONAL_EMP);
    const basic = total_basic_employment(lq);
    const totalEmp = lq.reduce((s, r) => s + r.local_emp, 0);
    const ratio = totalEmp > 0 ? (basic / totalEmp) * 100 : 0;

    // For demo: assign the same ratio to all prefectures with slight variation
    return Object.keys(PREFECTURES).map((code) => {
      const pc = Number(code);
      const variation = ((pc * 7) % 20) - 10; // deterministic pseudo-random
      return {
        code: String(pc),
        name: PREFECTURES[pc],
        value: Math.max(1, ratio + variation),
      };
    });
  }, []);

  const center = PREF_CENTERS[prefCode] ?? [137.0, 37.5];

  return (
    <div className="space-y-6">
      {/* Metric selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMetric("basic_ratio")}
          className={`px-4 py-2 text-sm rounded-lg border ${metric === "basic_ratio" ? "bg-slate-900 text-white" : "bg-white"}`}
        >
          基盤雇用比率
        </button>
        <button
          onClick={() => setMetric("lq_summary")}
          className={`px-4 py-2 text-sm rounded-lg border ${metric === "lq_summary" ? "bg-slate-900 text-white" : "bg-white"}`}
        >
          LQサマリ
        </button>
      </div>

      {/* National map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">全国マップ（都道府県別 — {metric === "basic_ratio" ? "基盤雇用比率" : "LQサマリ"}）</CardTitle>
        </CardHeader>
        <CardContent>
          <MapView
            geojsonUrl="/geo/japan_prefectures.geojson"
            data={prefData}
            featureCodeProperty="pref_code"
            featureNameProperty="nam_ja"
            valueLabel={metric === "basic_ratio" ? "基盤雇用比率(%)" : "最大LQ"}
            colorScale={["#2166ac", "#f7f7f7", "#b2182b"]}
            midpoint={10}
            height={500}
          />
        </CardContent>
      </Card>

      {/* Prefecture municipality map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{prefName} 県内マップ（市区町村別）</CardTitle>
        </CardHeader>
        <CardContent>
          {muniGeojson ? (
            <div style={{ height: 500 }} className="rounded-lg overflow-hidden border">
              <MuniMap geojson={muniGeojson} center={center} />
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              市区町村境界データを読込中...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Segmentation */}
      <Card>
        <CardHeader><CardTitle className="text-sm">セグメンテーション</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { icon: "🏢", name: "都市サービス集積型", color: "#1B2A4A" },
              { icon: "⚙️", name: "工業基盤型", color: "#2A9D8F" },
              { icon: "🛒", name: "商業・観光型", color: "#D4A843" },
              { icon: "🏛️", name: "公務・教育型", color: "#6B7280" },
              { icon: "📉", name: "高齢縮小型", color: "#E76F51" },
              { icon: "⚖️", name: "均衡型", color: "#9CA3AF" },
            ].map((seg) => (
              <div key={seg.name} className="text-center p-3 rounded-lg border">
                <div className="text-2xl">{seg.icon}</div>
                <p className="text-xs mt-1 font-medium" style={{ color: seg.color }}>{seg.name}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Municipality map using inline GeoJSON (already converted from TopoJSON) */
function MuniMap({ geojson, center }: { geojson: any; center: [number, number] }) {
  const MapInner = dynamic(
    () =>
      import("react-map-gl/maplibre").then((mod) => {
        const { default: MapGL, Source, Layer, Popup } = mod;
        return function MuniMapInner() {
          const [hover, setHover] = useState<{ lng: number; lat: number; name: string } | null>(null);

          return (
            <MapGL
              initialViewState={{ longitude: center[0], latitude: center[1], zoom: 9 }}
              style={{ width: "100%", height: "100%" }}
              mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
              interactiveLayerIds={["muni-fill"]}
              onMouseMove={(e: any) => {
                const f = e.features?.[0];
                if (f) {
                  setHover({
                    lng: e.lngLat.lng,
                    lat: e.lngLat.lat,
                    name: f.properties?.N03_004 ?? f.properties?.N03_003 ?? "",
                  });
                } else {
                  setHover(null);
                }
              }}
              onMouseLeave={() => setHover(null)}
            >
              <Source id="muni" type="geojson" data={geojson}>
                <Layer
                  id="muni-fill"
                  type="fill"
                  paint={{
                    "fill-color": "#2A9D8F",
                    "fill-opacity": 0.4,
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
              {hover && (
                <Popup longitude={hover.lng} latitude={hover.lat} closeButton={false} anchor="top">
                  <span className="text-xs font-bold">{hover.name}</span>
                </Popup>
              )}
            </MapGL>
          );
        };
      }),
    { ssr: false },
  );

  return <MapInner />;
}
