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
  onMuniClick?: (areaCode: string, areaName: string) => void;
}

type HoverInfo =
  | { type: "muni"; lng: number; lat: number; name: string; basicRatio?: number; segment?: string; totalEmp?: number; maxLq?: number; maxLqIndustry?: string }
  | { type: "land_price"; lng: number; lat: number; price: number; use: string; station: string }
  | { type: "railway"; lng: number; lat: number; name: string; line?: string; riders?: number }
  | { type: "flood"; lng: number; lat: number; depthRank: number }
  | { type: "did"; lng: number; lat: number; name: string; pop?: number }
  | { type: "zoning"; lng: number; lat: number; zoneCode: number }
  | { type: "location_opt"; lng: number; lat: number; muniCode?: number | string; planName?: string };

// 国土数値情報 A29 用途地域コード → 名称
const ZONING_CODE_TO_NAME: Record<number, string> = {
  1: "第一種低層住居専用地域",
  2: "第二種低層住居専用地域",
  3: "第一種中高層住居専用地域",
  4: "第二種中高層住居専用地域",
  5: "第一種住居地域",
  6: "第二種住居地域",
  7: "準住居地域",
  8: "近隣商業地域",
  9: "商業地域",
  10: "準工業地域",
  11: "工業地域",
  12: "工業専用地域",
  21: "田園住居地域",
};

// 国土数値情報 A31 浸水深ランク → 説明
const FLOOD_DEPTH_DESC: Record<number, string> = {
  11: "0.5m未満",
  12: "0.5〜3m",
  13: "3〜5m",
  14: "5〜10m",
  15: "10〜20m",
  16: "20m以上",
};

function describeFloodDepth(rank: number): string {
  return FLOOD_DEPTH_DESC[rank] ?? `ランク ${rank}`;
}
function describeZoneCode(code: number): string {
  return ZONING_CODE_TO_NAME[code] ?? `用途地域コード ${code}`;
}

export default function MuniMapInner({ geojson, center, fillColor, overlays, activeLayers, onMuniClick }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [cursor, setCursor] = useState<string>("");

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    if (!onMuniClick || !e.features || e.features.length === 0) return;
    // 市区町村フィルレイヤーのフィーチャを優先（NLNIレイヤーが上にあっても市区町村を取得）
    const muniFeature = e.features.find((f) => f.layer?.id === "muni-fill");
    if (!muniFeature) return;
    const props = muniFeature.properties ?? {};
    const code = props.N03_007 ?? props.area_code;
    const name = props.area_name ?? props.N03_004 ?? "";
    if (code) {
      onMuniClick(String(code), String(name));
    }
  }, [onMuniClick]);

  const activeSet = new Set(activeLayers);

  // All interactive layer IDs — 全レイヤーをホバー対応に
  const interactiveIds = ["muni-fill"];
  if (activeSet.has("land_prices") && overlays.land_prices) interactiveIds.push("nlni-land-prices-circle");
  if (activeSet.has("railways") && overlays.railways) interactiveIds.push("nlni-railways-circle");
  if (activeSet.has("flood") && overlays.flood) interactiveIds.push("nlni-flood-fill");
  if (activeSet.has("did") && overlays.did) interactiveIds.push("nlni-did-fill");
  if (activeSet.has("zoning") && overlays.zoning) interactiveIds.push("nlni-zoning-fill");
  if (activeSet.has("location_opt") && overlays.location_opt) interactiveIds.push("nlni-location-opt-fill");

  // 上位レイヤーが下のレイヤーよりも優先される: ポイント > ポリゴン (狭い > 広い)
  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (!e.features || e.features.length === 0) { setHover(null); return; }

    // 優先順位でレイヤーを並べ替え（ポイントが上、用途地域が次、洪水/DID/立地適正、最後に市区町村）
    const priority = [
      "nlni-railways-circle",
      "nlni-land-prices-circle",
      "nlni-zoning-fill",
      "nlni-flood-fill",
      "nlni-did-fill",
      "nlni-location-opt-fill",
      "muni-fill",
    ];
    const sorted = [...e.features].sort((a, b) =>
      priority.indexOf(a.layer?.id ?? "") - priority.indexOf(b.layer?.id ?? "")
    );
    const f = sorted[0];
    const layerId = f.layer?.id;
    const p = f.properties ?? {};

    if (layerId === "nlni-land-prices-circle") {
      setHover({
        type: "land_price",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        price: p.price ?? 0,
        use: p.station ?? "",   // CSV columns are swapped
        station: p.use ?? "",
      });
    } else if (layerId === "nlni-railways-circle") {
      setHover({
        type: "railway",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: p.name ?? "",
        line: p.line,
        riders: p.riders,
      });
    } else if (layerId === "nlni-flood-fill") {
      setHover({
        type: "flood",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        depthRank: Number(p.depth ?? 0),
      });
    } else if (layerId === "nlni-did-fill") {
      setHover({
        type: "did",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: String(p.name ?? ""),
        pop: typeof p.pop === "number" ? p.pop : undefined,
      });
    } else if (layerId === "nlni-zoning-fill") {
      setHover({
        type: "zoning",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        zoneCode: Number(p.zone ?? 0),
      });
    } else if (layerId === "nlni-location-opt-fill") {
      setHover({
        type: "location_opt",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        muniCode: p.type,
        planName: p.name ? String(p.name) : undefined,
      });
    } else {
      setHover({
        type: "muni",
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        name: p.area_name ?? p.N03_004 ?? "",
        basicRatio: p.basic_ratio,
        segment: p.segment,
        totalEmp: p.total_emp,
        maxLq: p.max_lq,
        maxLqIndustry: p.max_lq_industry,
      });
    }
  }, []);

  return (
    <Map
      initialViewState={{ longitude: center[0], latitude: center[1], zoom: 9 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      interactiveLayerIds={interactiveIds}
      cursor={cursor}
      onMouseMove={(e) => {
        onMouseMove(e);
        // 市区町村フィーチャの上にマウスがある時はポインターに
        if (onMuniClick && e.features?.some((f) => f.layer?.id === "muni-fill")) {
          setCursor("pointer");
        } else {
          setCursor("");
        }
      }}
      onMouseLeave={() => { setHover(null); setCursor(""); }}
      onClick={onClick}
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
          {/* ズーム連動: 低ズーム時は上位価格帯のみ、高ズームで全表示 */}
          <Layer id="nlni-land-prices-circle" type="circle"
            paint={{
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                7, ["interpolate", ["linear"], ["get", "price"], 30000, 1, 200000, 2, 500000, 4, 1000000, 6],
                10, ["interpolate", ["linear"], ["get", "price"], 30000, 3, 200000, 5, 500000, 8, 1000000, 12],
                14, ["interpolate", ["linear"], ["get", "price"], 30000, 5, 200000, 8, 500000, 12, 1000000, 18],
              ],
              "circle-color": [
                "interpolate", ["linear"], ["get", "price"],
                30000, "#fef3c7",   // 黄
                100000, "#fb923c",  // オレンジ
                300000, "#dc2626",  // 赤
                1000000, "#7f1d1d", // 濃赤
              ],
              "circle-opacity": 0.8,
              "circle-stroke-width": 0.5,
              "circle-stroke-color": "#fff",
            }}
          />
        </Source>
      )}
      {activeSet.has("flood") && overlays.flood && (
        <Source id="nlni-flood" type="geojson" data={overlays.flood}>
          {/* 浸水深ランクで色分け: 浅い=薄青、深い=濃い赤 */}
          <Layer id="nlni-flood-fill" type="fill" paint={{
            "fill-color": [
              "match", ["to-number", ["get", "depth"]],
              11, "#bfdbfe",  // 0.5m未満
              12, "#60a5fa",  // 0.5-3m
              13, "#2563eb",  // 3-5m
              14, "#1e40af",  // 5-10m
              15, "#581c87",  // 10-20m
              16, "#3b0764",  // 20m以上
              "#3B82F6",
            ],
            "fill-opacity": 0.45,
          }} />
        </Source>
      )}
      {activeSet.has("did") && overlays.did && (
        <Source id="nlni-did" type="geojson" data={overlays.did}>
          <Layer id="nlni-did-fill" type="fill" paint={{ "fill-color": "#2A9D8F", "fill-opacity": 0.35 }} />
          <Layer id="nlni-did-line" type="line" paint={{ "line-color": "#0f766e", "line-width": 0.6 }} />
        </Source>
      )}
      {activeSet.has("zoning") && overlays.zoning && (
        <Source id="nlni-zoning" type="geojson" data={overlays.zoning}>
          {/* 用途地域コードで色分け: 住居系=緑、商業系=赤、工業系=青 */}
          <Layer id="nlni-zoning-fill" type="fill" paint={{
            "fill-color": [
              "match", ["to-number", ["get", "zone"]],
              1, "#86efac",   // 第一種低層住居専用
              2, "#86efac",   // 第二種低層住居専用
              3, "#bbf7d0",   // 第一種中高層住居専用
              4, "#bbf7d0",   // 第二種中高層住居専用
              5, "#dcfce7",   // 第一種住居
              6, "#dcfce7",   // 第二種住居
              7, "#fef9c3",   // 準住居
              8, "#fca5a5",   // 近隣商業
              9, "#ef4444",   // 商業
              10, "#a78bfa",  // 準工業
              11, "#8b5cf6",  // 工業
              12, "#6d28d9",  // 工業専用
              21, "#fde68a",  // 田園住居
              "#D4A843",
            ],
            "fill-opacity": 0.55,
          }} />
          <Layer id="nlni-zoning-line" type="line" paint={{ "line-color": "#1f2937", "line-width": 0.3, "line-opacity": 0.4 }} />
        </Source>
      )}
      {activeSet.has("location_opt") && overlays.location_opt && (
        <Source id="nlni-location-opt" type="geojson" data={overlays.location_opt}>
          <Layer id="nlni-location-opt-fill" type="fill" paint={{ "fill-color": "#8B5CF6", "fill-opacity": 0.35 }} />
          <Layer id="nlni-location-opt-line" type="line" paint={{ "line-color": "#5b21b6", "line-width": 0.8, "line-dasharray": [3, 2] }} />
        </Source>
      )}

      {/* Popup */}
      {hover && (
        <Popup longitude={hover.lng} latitude={hover.lat} closeButton={false} anchor="top">
          <div className="text-xs space-y-0.5">
            {hover.type === "land_price" && (
              <>
                <p className="font-bold text-[#E76F51]">地価公示</p>
                <p className="font-bold">{hover.price.toLocaleString()}円/m²</p>
                {hover.use && <p>用途: {hover.use}</p>}
                {hover.station && <p>エリア: {hover.station}</p>}
              </>
            )}
            {hover.type === "railway" && (
              <>
                <p className="font-bold">🚉 {hover.name}駅</p>
                {hover.line && <p>路線: {hover.line}</p>}
                {hover.riders != null && hover.riders > 0 && <p>乗降客数: {hover.riders.toLocaleString()}人/日</p>}
              </>
            )}
            {hover.type === "flood" && (
              <>
                <p className="font-bold text-blue-700">💧 洪水浸水想定区域</p>
                <p>想定浸水深: <span className="font-bold">{describeFloodDepth(hover.depthRank)}</span></p>
                <p className="text-[11px] text-slate-500 mt-1">想定最大規模降雨での計算値</p>
              </>
            )}
            {hover.type === "did" && (
              <>
                <p className="font-bold text-emerald-700">🏙 人口集中地区（DID）</p>
                {hover.name && <p>市区町村: {hover.name}</p>}
                <p className="text-[11px] text-slate-500 mt-1">人口密度 4,000人/km²以上の連続区域</p>
              </>
            )}
            {hover.type === "zoning" && (
              <>
                <p className="font-bold text-amber-700">📍 用途地域</p>
                <p className="font-bold">{describeZoneCode(hover.zoneCode)}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {hover.zoneCode <= 7 ? "住居系用途" : hover.zoneCode === 8 || hover.zoneCode === 9 ? "商業系用途" : hover.zoneCode <= 12 ? "工業系用途" : "その他"}
                </p>
              </>
            )}
            {hover.type === "location_opt" && (
              <>
                <p className="font-bold text-purple-700">🎯 立地適正化計画区域</p>
                {hover.muniCode && <p>市区町村コード: {hover.muniCode}</p>}
                {hover.planName && <p>{hover.planName}</p>}
                <p className="text-[11px] text-slate-500 mt-1">居住誘導区域 or 都市機能誘導区域</p>
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
