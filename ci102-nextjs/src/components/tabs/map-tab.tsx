"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrefectureData } from "@/lib/use-prefecture-data";
import { useMunicipalityData, type MunicipalityData } from "@/lib/use-municipality-data";
import { useNlniOverlay, NLNI_LAYERS, type NlniLayerId } from "@/lib/use-nlni-overlay";
import MapLayerControls from "@/components/map-layer-controls";

// Dynamic import to avoid SSR issues with MapLibre
const MapView = dynamic(() => import("@/components/maplibre-map"), { ssr: false });
const MuniMapInner = dynamic(() => import("@/components/muni-map-inner"), { ssr: false });

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

export type MapMetric = "basic_ratio" | "rs_total" | "suitability";

export const METRIC_CONFIG: Record<MapMetric, { label: string; colorScale: [string, string, string]; midpoint: number }> = {
  basic_ratio: { label: "基盤雇用比率(%)", colorScale: ["#2166ac", "#f7f7f7", "#b2182b"], midpoint: 10 },
  rs_total: { label: "RS合計(地域シフト)", colorScale: ["#d73027", "#ffffbf", "#1a9850"], midpoint: 0 },
  suitability: { label: "投資適格スコア", colorScale: ["#d73027", "#fee08b", "#1a9850"], midpoint: 50 },
};

export const SEGMENTS = [
  { key: "都市サービス集積型", icon: "🏢", color: "#1B2A4A", desc: "第3次産業比率が高く、若年〜生産年齢が多い都市部" },
  { key: "工業基盤型", icon: "⚙️", color: "#2A9D8F", desc: "製造業・建設業が強く、生産年齢人口が安定" },
  { key: "商業・観光型", icon: "🛒", color: "#D4A843", desc: "小売・宿泊飲食が突出、昼間人口が多い" },
  { key: "公務・教育型", icon: "🏛️", color: "#6B7280", desc: "公務・教育・医療が主力、人口安定だが成長力弱" },
  { key: "高齢縮小型", icon: "📉", color: "#E76F51", desc: "高齢化率が高く、第1次産業依存、人口減少" },
  { key: "均衡型", icon: "⚖️", color: "#9CA3AF", desc: "特定の偏りがなくバランスの取れた経済構造" },
] as const;

interface Props {
  prefCode: number;
  prefName: string;
  allData: Record<string, PrefectureData> | null;
  onPrefClick?: (prefCode: number) => void;
  onCityClick?: (areaCode: string, areaName: string) => void;
}

export default function MapTab({ prefCode, prefName, allData, onPrefClick, onCityClick }: Props) {
  const [metric, setMetric] = useState<MapMetric>("basic_ratio");
  const [muniGeojson, setMuniGeojson] = useState<any>(null);
  const [activeLayers, setActiveLayers] = useState<Set<NlniLayerId>>(new Set());
  const { data: municipalities } = useMunicipalityData(prefCode);

  // NLNI overlay data (lazy-loaded per active layer)
  const railwaysOverlay = useNlniOverlay(prefCode, "railways", activeLayers.has("railways"));
  const floodOverlay = useNlniOverlay(prefCode, "flood", activeLayers.has("flood"));
  const landPricesOverlay = useNlniOverlay(prefCode, "land_prices", activeLayers.has("land_prices"));
  const didOverlay = useNlniOverlay(prefCode, "did", activeLayers.has("did"));
  const zoningOverlay = useNlniOverlay(prefCode, "zoning", activeLayers.has("zoning"));
  const locationOptOverlay = useNlniOverlay(prefCode, "location_opt", activeLayers.has("location_opt"));

  const nlniOverlays = useMemo(() => ({
    railways: railwaysOverlay.data,
    flood: floodOverlay.data,
    land_prices: landPricesOverlay.data,
    did: didOverlay.data,
    zoning: zoningOverlay.data,
    location_opt: locationOptOverlay.data,
  }), [railwaysOverlay.data, floodOverlay.data, landPricesOverlay.data, didOverlay.data, zoningOverlay.data, locationOptOverlay.data]);

  const toggleLayer = useCallback((layerId: NlniLayerId) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

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

  // Enrich GeoJSON with municipality data (stable reference)
  const enrichedGeojson = useMemo(() => {
    if (!muniGeojson?.features) return muniGeojson;
    const muniMap = new Map(municipalities.map((m) => [m.area_code, m]));
    return {
      ...muniGeojson,
      features: muniGeojson.features.map((f: any) => {
        const code = f.properties?.N03_007;
        const m = code ? muniMap.get(code) : null;
        return {
          ...f,
          properties: {
            ...f.properties,
            basic_ratio: m?.basic_ratio ?? 0,
            segment: m?.segment ?? "均衡型",
            area_name: m?.area_name ?? f.properties?.N03_004 ?? f.properties?.N03_003 ?? "",
            total_emp: m?.total_emp ?? 0,
            max_lq: m?.max_lq ?? 0,
            max_lq_industry: m?.max_lq_industry ?? "",
          },
        };
      }),
    };
  }, [muniGeojson, municipalities]);

  // Build fill-color expression based on metric
  const fillColor = useMemo(() => {
    if (metric === "basic_ratio") {
      return [
        "interpolate", ["linear"], ["get", "basic_ratio"],
        0, "#f7fbff",
        5, "#c6dbef",
        10, "#6baed6",
        20, "#2171b5",
        35, "#08306b",
      ] as any;
    }
    const segColors: Record<string, string> = {
      "都市サービス集積型": "#1B2A4A",
      "工業基盤型": "#2A9D8F",
      "商業・観光型": "#D4A843",
      "公務・教育型": "#6B7280",
      "高齢縮小型": "#E76F51",
      "均衡型": "#9CA3AF",
    };
    return [
      "match", ["get", "segment"],
      ...Object.entries(segColors).flat(),
      "#9CA3AF",
    ] as any;
  }, [metric]);

  const cfg = METRIC_CONFIG[metric];
  const center = PREF_CENTERS[prefCode] ?? [137.0, 37.5];

  return (
    <div className="space-y-6">
      {/* Metric selector */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="地図指標の切り替え">
        {(Object.keys(METRIC_CONFIG) as MapMetric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            aria-pressed={metric === m}
            className={`px-3 py-1.5 text-xs md:px-4 md:py-2 md:text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none ${metric === m ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            {METRIC_CONFIG[m].label}
          </button>
        ))}
      </div>

      {/* National map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            全国マップ（都道府県別 — {cfg.label}）
            {onPrefClick && <span className="ml-2 text-xs text-slate-500">— クリックで県を選択</span>}
          </CardTitle>
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
            onFeatureClick={onPrefClick ? (code) => {
              const num = parseInt(code, 10);
              if (!Number.isNaN(num)) onPrefClick(num);
            } : undefined}
          />
          {/* National map legend */}
          <MapLegend metric={metric} />
        </CardContent>
      </Card>

      {/* NLNI Layer Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">空間データレイヤー（国土数値情報）</CardTitle>
        </CardHeader>
        <CardContent>
          <MapLayerControls activeLayers={activeLayers} onToggle={toggleLayer} />
          <p className="text-[11px] text-muted-foreground mt-2">
            レイヤーを選択すると県内マップ上に重ねて表示されます。<strong>すべてのレイヤーでホバー時に詳細情報を表示</strong>（金額・浸水深・用途名・施設名等）。
            複数レイヤー重ね合わせ時は『ポイント &gt; 用途地域 &gt; 洪水 &gt; DID &gt; 立地適正 &gt; 市区町村』の優先順位で表示。
          </p>

          {/* アクティブレイヤーの凡例 */}
          {activeLayers.size > 0 && (
            <div className="mt-3 space-y-2">
              {activeLayers.has("land_prices") && (
                <details open className="rounded border bg-white dark:bg-slate-900 p-2 text-xs">
                  <summary className="font-semibold cursor-pointer">💰 地価公示の凡例</summary>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="inline-block w-2 h-2 rounded-full bg-[#fef3c7] border" />
                      <span className="inline-block w-3 h-3 rounded-full bg-[#fb923c]" />
                      <span className="inline-block w-4 h-4 rounded-full bg-[#dc2626]" />
                      <span className="inline-block w-5 h-5 rounded-full bg-[#7f1d1d]" />
                      <span className="ml-2">3万円/m² → 10万 → 30万 → 100万円/m²</span>
                    </div>
                    <p className="text-[11px] text-slate-500">サイズ・色ともに価格に比例。ホバーで詳細表示。ズームインで大きく表示。</p>
                  </div>
                </details>
              )}
              {activeLayers.has("flood") && (
                <details open className="rounded border bg-white dark:bg-slate-900 p-2 text-xs">
                  <summary className="font-semibold cursor-pointer">💧 洪水浸水想定区域の凡例</summary>
                  <div className="mt-2 flex items-center flex-wrap gap-1 text-[11px]">
                    {[
                      { c: "#bfdbfe", l: "0.5m未満" },
                      { c: "#60a5fa", l: "0.5-3m" },
                      { c: "#2563eb", l: "3-5m" },
                      { c: "#1e40af", l: "5-10m" },
                      { c: "#581c87", l: "10-20m" },
                      { c: "#3b0764", l: "20m+" },
                    ].map((x) => (
                      <span key={x.l} className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: x.c }} />
                        {x.l}
                      </span>
                    ))}
                  </div>
                </details>
              )}
              {activeLayers.has("zoning") && (
                <details open className="rounded border bg-white dark:bg-slate-900 p-2 text-xs">
                  <summary className="font-semibold cursor-pointer">📍 用途地域の凡例</summary>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-0.5 text-[11px]">
                    {[
                      { c: "#86efac", l: "低層住居専用" },
                      { c: "#bbf7d0", l: "中高層住居" },
                      { c: "#dcfce7", l: "住居系" },
                      { c: "#fef9c3", l: "準住居" },
                      { c: "#fca5a5", l: "近隣商業" },
                      { c: "#ef4444", l: "商業" },
                      { c: "#a78bfa", l: "準工業" },
                      { c: "#8b5cf6", l: "工業" },
                      { c: "#6d28d9", l: "工業専用" },
                      { c: "#fde68a", l: "田園住居" },
                    ].map((x) => (
                      <span key={x.l} className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: x.c }} />
                        {x.l}
                      </span>
                    ))}
                  </div>
                </details>
              )}
              {activeLayers.has("did") && (
                <p className="text-xs">
                  <span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ backgroundColor: "#2A9D8F", opacity: 0.35 }} />
                  🏙 <strong>人口集中地区(DID)</strong>: 人口密度 4,000人/km²以上の連続区域。市街化された場所の目安。
                </p>
              )}
              {activeLayers.has("location_opt") && (
                <p className="text-xs">
                  <span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{ backgroundColor: "#8B5CF6", opacity: 0.35 }} />
                  🎯 <strong>立地適正化計画区域</strong>: 居住・都市機能誘導区域。コンパクトシティ施策の対象エリア。
                </p>
              )}
              {activeLayers.has("railways") && (
                <p className="text-xs">
                  <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ backgroundColor: "#1B2A4A" }} />
                  🚉 <strong>鉄道駅</strong>: ホバーで駅名・路線・乗降客数を表示。
                </p>
              )}
            </div>
          )}
          {/* Active overlay status messages */}
          {activeLayers.size > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="flex flex-wrap gap-3">
                {NLNI_LAYERS.filter((l) => activeLayers.has(l.id)).map((layer) => {
                  const overlay = nlniOverlays[layer.id];
                  const featureCount = overlay?.features?.length ?? 0;
                  const hasData = overlay != null && featureCount > 0;
                  return (
                    <span key={layer.id} className="inline-flex items-center gap-1.5 text-[11px]">
                      <span
                        className="inline-block w-4 h-3 rounded-sm border border-gray-300"
                        style={{ backgroundColor: layer.color, opacity: hasData ? (layer.id === "zoning" ? 0.5 : layer.opacity) : 0.2 }}
                      />
                      {layer.label}
                      {hasData
                        ? <span className="text-muted-foreground">({featureCount.toLocaleString()}件)</span>
                        : <span className="text-red-500">(データなし)</span>}
                    </span>
                  );
                })}
              </div>
              {/* Specific status messages for missing data */}
              {activeLayers.has("location_opt") && (!nlniOverlays.location_opt || nlniOverlays.location_opt?.features?.length === 0) && (
                <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
                  {prefName}には立地適正化計画の策定済み区域データがありません。全自治体が未策定、またはデータが国土数値情報に未登録の可能性があります。
                </p>
              )}
              {activeLayers.has("flood") && (!nlniOverlays.flood || nlniOverlays.flood?.features?.length === 0) && (
                <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
                  {prefName}の洪水浸水想定区域データがありません。データ未取得またはシミュレーション未公表の可能性があります。
                </p>
              )}
              {activeLayers.has("zoning") && nlniOverlays.zoning && nlniOverlays.zoning?.features?.length > 10000 && (
                <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1">
                  用途地域データが{nlniOverlays.zoning.features.length.toLocaleString()}件と大量のため、描画に時間がかかる場合があります。ズームインすると表示されやすくなります。
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prefecture municipality map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {prefName} 県内マップ（市区町村別）
            {onCityClick && <span className="ml-2 text-xs text-slate-500">— クリックで市区町村を選択</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {enrichedGeojson ? (
            <div style={{ height: 500 }} className="rounded-lg overflow-hidden border">
              <MuniMapInner
                geojson={enrichedGeojson}
                center={center}
                fillColor={fillColor}
                overlays={nlniOverlays}
                activeLayers={Array.from(activeLayers)}
                onMuniClick={onCityClick}
              />
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              市区町村境界データを読込中...
            </div>
          )}
          {/* Municipality map legend */}
          <MapLegend metric={metric} />
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
        <summary className="font-medium cursor-pointer">地図の見方</summary>
        <div className="mt-2 space-y-2">
          <p>
            <strong>【基盤雇用比率】</strong>色が濃いほど基盤産業の雇用比率が高い地域。外部資金の流入基盤が強い。
          </p>
          <p>
            <strong>【RS合計 / 投資スコア】</strong>市区町村の経済構造セグメントで色分け。ホバーで詳細表示。
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

/** Visual color legend for the active metric */
function MapLegend({ metric }: { metric: MapMetric }) {
  if (metric === "basic_ratio") {
    return (
      <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
        <span>低 0%</span>
        <div className="flex h-3 flex-1 max-w-[200px] rounded-sm overflow-hidden">
          {["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"].map((c) => (
            <div key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>高 35%+</span>
        <span className="ml-2">— 基盤雇用比率</span>
      </div>
    );
  }

  // RS / Suitability → segment colors
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {SEGMENTS.map((seg) => (
        <span key={seg.key} className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: seg.color }} />
          {seg.key}
        </span>
      ))}
    </div>
  );
}
