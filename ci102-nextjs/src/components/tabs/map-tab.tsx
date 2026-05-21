"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PREFECTURES } from "@/lib/codes";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData } from "@/lib/use-municipality-data";

// Dynamic import to avoid SSR issues with MapLibre
const MapView = dynamic(() => import("@/components/maplibre-map"), { ssr: false });

// Prefecture centers for zoom
const PREF_CENTERS: Record<number, [number, number]> = {
  1: [143.21, 43.06],  2: [140.74, 40.82],  3: [141.15, 39.70],
  4: [140.87, 38.27],  5: [140.10, 39.72],  6: [140.34, 38.24],
  7: [140.47, 37.75],  8: [140.45, 36.34],  9: [139.88, 36.57],
  10: [139.06, 36.39], 11: [139.65, 35.86], 12: [140.12, 35.60],
  13: [139.69, 35.69], 14: [139.64, 35.45], 15: [139.02, 37.90],
  16: [137.21, 36.70], 17: [136.63, 36.59], 18: [136.22, 35.99],
  19: [138.57, 35.66], 20: [138.18, 36.23], 21: [136.72, 35.39],
  22: [138.38, 34.98], 23: [136.91, 35.18], 24: [136.51, 34.73],
  25: [136.07, 35.00], 26: [135.76, 35.02], 27: [135.52, 34.69],
  28: [135.18, 34.69], 29: [135.83, 34.37], 30: [135.17, 33.95],
  31: [134.24, 35.50], 32: [133.05, 35.47], 33: [133.93, 34.66],
  34: [132.46, 34.40], 35: [131.47, 34.19], 36: [134.56, 34.07],
  37: [134.04, 34.34], 38: [132.77, 33.84], 39: [133.53, 33.56],
  40: [130.42, 33.59], 41: [130.30, 33.25], 42: [129.87, 32.95],
  43: [130.74, 32.79], 44: [131.61, 33.24], 45: [131.42, 31.91],
  46: [130.56, 31.56], 47: [127.68, 26.34],
};

type MapMetric = "basic_ratio" | "rs_total" | "suitability";

const METRIC_CONFIG: Record<MapMetric, { label: string; colorScale: [string, string, string]; midpoint: number }> = {
  basic_ratio: { label: "基盤雇用比率(%)", colorScale: ["#2166ac", "#f7f7f7", "#b2182b"], midpoint: 10 },
  rs_total: { label: "RS合計(地域シフト)", colorScale: ["#d73027", "#ffffbf", "#1a9850"], midpoint: 0 },
  suitability: { label: "投資適格スコア", colorScale: ["#d73027", "#fee08b", "#1a9850"], midpoint: 50 },
};

interface Props {
  prefCode: number;
  prefName: string;
  allData: Record<string, PrefectureData> | null;
}

const SEGMENTS = [
  { key: "都市サービス集積型", icon: "🏢", color: "#1B2A4A", desc: "第3次産業比率が高く、若年〜生産年齢が多い都市部" },
  { key: "工業基盤型", icon: "⚙️", color: "#2A9D8F", desc: "製造業・建設業が強く、生産年齢人口が安定" },
  { key: "商業・観光型", icon: "🛒", color: "#D4A843", desc: "小売・宿泊飲食が突出、昼間人口が多い" },
  { key: "公務・教育型", icon: "🏛️", color: "#6B7280", desc: "公務・教育・医療が主力、人口安定だが成長力弱" },
  { key: "高齢縮小型", icon: "📉", color: "#E76F51", desc: "高齢化率が高く、第1次産業依存、人口減少" },
  { key: "均衡型", icon: "⚖️", color: "#9CA3AF", desc: "特定の偏りがなくバランスの取れた経済構造" },
] as const;

export default function MapTab({ prefCode, prefName, allData }: Props) {
  const [metric, setMetric] = useState<MapMetric>("basic_ratio");
  const [muniGeojson, setMuniGeojson] = useState<any>(null);
  const { data: municipalities } = useMunicipalityData(prefCode);

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

  // Build real prefecture data for choropleth
  const prefData = useMemo(() => {
    if (!allData) return [];
    return Object.values(allData).map((p) => {
      let value: number;
      switch (metric) {
        case "basic_ratio":
          value = p.basic_ratio;
          break;
        case "rs_total":
          value = p.rs_total;
          break;
        case "suitability":
          value = p.suitability_score.total_score;
          break;
      }
      return {
        code: String(p.pref_code),
        name: p.pref_name,
        value,
      };
    });
  }, [allData, metric]);

  const cfg = METRIC_CONFIG[metric];
  const center = PREF_CENTERS[prefCode] ?? [137.0, 37.5];

  return (
    <div className="space-y-6">
      {/* Metric selector */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(METRIC_CONFIG) as MapMetric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`px-3 py-1.5 text-xs md:px-4 md:py-2 md:text-sm rounded-lg border ${metric === m ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            {METRIC_CONFIG[m].label}
          </button>
        ))}
      </div>

      {/* National map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">全国マップ（都道府県別 — {cfg.label}）</CardTitle>
        </CardHeader>
        <CardContent>
          <MapView
            geojsonUrl="/geo/japan_prefectures.geojson"
            data={prefData}
            featureCodeProperty="pref_code"
            featureNameProperty="nam_ja"
            valueLabel={cfg.label}
            colorScale={cfg.colorScale}
            midpoint={cfg.midpoint}
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
        <CardHeader><CardTitle className="text-sm">{prefName} 市区町村セグメンテーション</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const segCounts: Record<string, { count: number; names: string[] }> = {};
            for (const seg of SEGMENTS) {
              segCounts[seg.key] = { count: 0, names: [] };
            }
            for (const m of municipalities) {
              const s = m.segment ?? "均衡型";
              if (!segCounts[s]) segCounts[s] = { count: 0, names: [] };
              segCounts[s].count++;
              if (segCounts[s].names.length < 3) segCounts[s].names.push(m.area_name);
            }
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {SEGMENTS.map((seg) => (
                    <div key={seg.key} className="text-center p-3 rounded-lg border">
                      <div className="text-2xl">{seg.icon}</div>
                      <p className="text-xs mt-1 font-medium" style={{ color: seg.color }}>{seg.key}</p>
                      <p className="text-lg font-bold">{segCounts[seg.key]?.count ?? 0}</p>
                    </div>
                  ))}
                </div>
                {municipalities.length > 0 && (
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">市区町村</th>
                          <th className="p-2 text-left">セグメント</th>
                          <th className="p-2 text-right">総雇用</th>
                          <th className="p-2 text-right">基盤比率</th>
                          <th className="p-2 text-left">最大LQ産業</th>
                        </tr>
                      </thead>
                      <tbody>
                        {municipalities.map((m) => {
                          const seg = SEGMENTS.find((s) => s.key === (m.segment ?? "均衡型"));
                          return (
                            <tr key={m.area_code} className="border-b hover:bg-slate-50">
                              <td className="p-2">{m.area_name}</td>
                              <td className="p-2" style={{ color: seg?.color }}>{seg?.icon} {m.segment ?? "均衡型"}</td>
                              <td className="p-2 text-right font-mono">{m.total_emp.toLocaleString()}</td>
                              <td className="p-2 text-right font-mono">{m.basic_ratio.toFixed(1)}%</td>
                              <td className="p-2">{m.max_lq_industry} ({m.max_lq.toFixed(2)})</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      {/* Educational content */}
      <details open className="rounded-lg border p-4 text-sm text-muted-foreground">
        <summary className="font-medium cursor-pointer">ℹ️ 地図の見方</summary>
        <div className="mt-2 space-y-2">
          <p>
            <strong>【基盤雇用比率】</strong>色が濃いほど基盤産業の雇用比率が高い地域。外部資金の流入基盤が強い。
          </p>
          <p>
            <strong>【RS合計】</strong>緑 = 地域シフト(RS)合計が正 → 全国トレンドを上回る競争優位。赤 = RS合計が負 → 全国の同産業と比べ雇用が減少傾向。期間: 2016年→2021年。
          </p>
          <p>
            <strong>【投資スコア】</strong>複合指標（EBM・基盤比率・RS・ギャップ・規模）を100点満点でスコアリング。
          </p>
          <p className="font-medium">市区町村セグメント:</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            <li><strong>都市サービス集積型:</strong> 情報・金融等のサービス産業が集積</li>
            <li><strong>工業基盤型:</strong> 製造業が域外輸出の柱</li>
            <li><strong>商業・観光型:</strong> 小売・宿泊・飲食が中心</li>
            <li><strong>公務・教育型:</strong> 公的セクターが雇用の柱</li>
            <li><strong>高齢縮小型:</strong> 基盤産業が少なく人口減少リスクが高い</li>
            <li><strong>均衡型:</strong> 特定産業への偏りが少ない</li>
          </ul>
        </div>
      </details>
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
