"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useMuniCentroids, haversineKm, findMunicipalitiesInRadius } from "@/lib/use-muni-centroids";
import { useMuniIndustryMatrix, computeCustomMetro } from "@/lib/use-muni-industry";

// Dynamic import for MapLibre (no SSR)
const TradeAreaMap = dynamic(() => import("@/components/trade-area-map"), { ssr: false });

interface GeocodeResult {
  title: string;
  lon: number;
  lat: number;
}

const RADIUS_OPTIONS = [
  { km: 1, label: "1km（徒歩商圏）" },
  { km: 2, label: "2km（徒歩+自転車）" },
  { km: 5, label: "5km（近隣商圏）" },
  { km: 10, label: "10km（広域商圏）" },
  { km: 30, label: "30km（都市圏）" },
];

export default function TradeAreaTab() {
  const { centroids, loading: centroidsLoading } = useMuniCentroids();
  const { matrix, loading: matrixLoading } = useMuniIndustryMatrix();

  const [addressQuery, setAddressQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([]);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [center, setCenter] = useState<{ lon: number; lat: number; title: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [manualLon, setManualLon] = useState("");
  const [manualLat, setManualLat] = useState("");

  const doGeocode = async () => {
    if (!addressQuery.trim()) return;
    setGeocoding(true);
    setGeocodeError(null);
    setGeocodeResults([]);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(addressQuery.trim())}`);
      const data = await r.json();
      if (data.error) {
        setGeocodeError(data.error);
      } else if (data.results.length === 0) {
        setGeocodeError("該当する住所が見つかりません。都道府県名から入力するか、もう少し詳しく入力してください。");
      } else {
        setGeocodeResults(data.results);
        if (data.results.length === 1) {
          setCenter(data.results[0]);
        }
      }
    } catch (err) {
      setGeocodeError(String(err));
    } finally {
      setGeocoding(false);
    }
  };

  const useManualCoords = () => {
    const lon = parseFloat(manualLon);
    const lat = parseFloat(manualLat);
    if (isNaN(lon) || isNaN(lat) || lon < 120 || lon > 150 || lat < 20 || lat > 50) {
      setGeocodeError("緯度経度が日本の範囲外です。経度120-150、緯度20-50で入力してください。");
      return;
    }
    setCenter({ lon, lat, title: `緯度経度直接指定 (${lon.toFixed(4)}, ${lat.toFixed(4)})` });
    setGeocodeError(null);
  };

  // 圏内市区町村
  const munisInRadius = useMemo(() => {
    if (!centroids || !center) return [];
    return findMunicipalitiesInRadius(centroids, center.lon, center.lat, radiusKm);
  }, [centroids, center, radiusKm]);

  // 集計結果
  const aggregate = useMemo(() => {
    if (!matrix || munisInRadius.length === 0) return null;
    const codes = munisInRadius.map((m) => m.code);
    return computeCustomMetro(matrix, codes);
  }, [matrix, munisInRadius]);

  if (centroidsLoading || matrixLoading) {
    return <div className="text-sm text-slate-500">商圏データを読み込み中...</div>;
  }
  if (!centroids || !matrix) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        データ読み込みエラー
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">商圏分析（住所から周辺集計）</h2>
        <p className="text-sm text-gray-700">
          住所から緯度経度を取得し、<strong>指定半径内の市区町村</strong>を経済圏として合算評価します。
          物件単位の投資判断に使えます。
        </p>
      </div>

      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-3 text-sm">
        <strong>💡 使い方</strong>:
        ①住所を入力 or 緯度経度を直接指定 → ②半径を選択 → ③圏内の市区町村データが自動集計されます。
        距離は<strong>直線距離（haversine）</strong>で判定。
        OSRM 全国カバレッジ拡大後は車での走行時間ベース判定に切替予定。
      </div>

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
        {/* 左: 入力 + 圏内市区町村リスト */}
        <div className="space-y-3">
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <p className="font-semibold text-sm">📍 1. 場所を指定</p>

            {/* 住所入力 */}
            <div>
              <label className="text-xs font-medium block mb-1">住所で検索</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doGeocode(); }}
                  placeholder="例: 東京都千代田区丸の内1-9-1"
                  className="flex-1 rounded px-2 py-1.5 text-sm border"
                />
                <button
                  onClick={doGeocode}
                  disabled={geocoding || !addressQuery.trim()}
                  className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white disabled:bg-slate-300"
                >
                  {geocoding ? "検索中..." : "検索"}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">国土地理院の住所検索API（無料）を利用</p>
            </div>

            {/* 検索結果 */}
            {geocodeResults.length > 1 && (
              <div className="text-xs space-y-1">
                <p className="font-medium">候補から選択:</p>
                {geocodeResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setCenter(r)}
                    className={`block w-full text-left px-2 py-1 rounded border hover:bg-emerald-50 ${
                      center?.lat === r.lat && center?.lon === r.lon ? "bg-emerald-100 border-emerald-400" : ""
                    }`}
                  >
                    {r.title} ({r.lat.toFixed(4)}, {r.lon.toFixed(4)})
                  </button>
                ))}
              </div>
            )}

            {geocodeError && (
              <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded">{geocodeError}</p>
            )}

            {/* 緯度経度直接指定 */}
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-600">緯度経度を直接指定する</summary>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={manualLon}
                  onChange={(e) => setManualLon(e.target.value)}
                  placeholder="経度 例:139.69"
                  className="rounded px-2 py-1 text-xs border w-24"
                />
                <input
                  type="text"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="緯度 例:35.69"
                  className="rounded px-2 py-1 text-xs border w-24"
                />
                <button
                  onClick={useManualCoords}
                  className="px-2 py-1 text-xs rounded bg-slate-600 text-white"
                >
                  この点を使用
                </button>
              </div>
            </details>

            {/* 半径選択 */}
            <div>
              <p className="font-semibold text-sm mt-2">📏 2. 商圏の半径</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r.km}
                    onClick={() => setRadiusKm(r.km)}
                    className={`px-2 py-1 text-xs rounded border ${
                      radiusKm === r.km
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 中心点表示 */}
            {center && (
              <div className="text-xs bg-emerald-50 border border-emerald-200 rounded p-2 mt-2">
                <strong>中心地点:</strong> {center.title}
                <br />
                <span className="text-[10px] text-slate-500">
                  ({center.lat.toFixed(4)}, {center.lon.toFixed(4)})
                </span>
              </div>
            )}
          </div>

          {/* 圏内市区町村リスト */}
          {center && (
            <div className="rounded-lg border bg-white p-3">
              <p className="font-semibold text-sm mb-2">
                📍 商圏内の市区町村: <strong>{munisInRadius.length}件</strong>
              </p>
              <div className="max-h-[300px] overflow-y-auto text-xs space-y-1">
                {munisInRadius.slice(0, 50).map((m) => (
                  <div key={m.code} className="flex justify-between border-b border-slate-100 py-1">
                    <span>{m.centroid.name}</span>
                    <span className="text-slate-500">{m.distance_km.toFixed(1)} km</span>
                  </div>
                ))}
                {munisInRadius.length > 50 && (
                  <p className="text-slate-500 text-center pt-2">
                    （他 {munisInRadius.length - 50}件）
                  </p>
                )}
                {munisInRadius.length === 0 && (
                  <p className="text-slate-500 text-center py-4">
                    圏内に市区町村がありません。半径を大きくしてください。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右: 地図 + 集計結果 */}
        <div className="space-y-3">
          {center ? (
            <>
              {/* 地図 */}
              <div className="rounded-lg overflow-hidden border" style={{ height: 320 }}>
                <TradeAreaMap
                  centerLon={center.lon}
                  centerLat={center.lat}
                  radiusKm={radiusKm}
                  munisInRadius={munisInRadius.slice(0, 50)}
                />
              </div>

              {/* 集計結果 */}
              {aggregate && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <KpiBox label="総雇用" value={aggregate.total_employment.toLocaleString()} />
                    <KpiBox label="基盤雇用" value={Math.round(aggregate.basic_employment).toLocaleString()} />
                    <KpiBox label="基盤雇用比率" value={`${aggregate.basic_ratio.toFixed(1)}%`} sub="Orlando: 20.2%" />
                    <KpiBox label="EBM" value={aggregate.ebm.toFixed(2)} sub="Orlando: 4.94 / 健全 3-6" />
                    <KpiBox label="基盤産業数" value={String(aggregate.n_basic_industries)} />
                    <KpiBox label="HHI" value={aggregate.hhi.toFixed(0)} sub="低=多角化" />
                  </div>

                  {/* 商圏のアクセス性集計（OSRM ベース、利用可能な市区町村のみ） */}
                  <AccessibilitySummary munisInRadius={munisInRadius} matrix={matrix} />

                  <div className="rounded-lg border bg-white p-3">
                    <p className="text-sm font-semibold mb-2">基盤産業 TOP {Math.min(aggregate.top_lq_industries.length, 10)}</p>
                    {aggregate.top_lq_industries.length === 0 ? (
                      <p className="text-xs text-slate-500">LQ &gt; 1.0 の業種がありません。半径を変更してください。</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-slate-600">
                            <th className="py-1">業種</th>
                            <th className="text-right py-1">LQ</th>
                            <th className="text-right py-1">基盤雇用</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aggregate.top_lq_industries.map((r) => (
                            <tr key={r.industry} className="border-b last:border-b-0">
                              <td className="py-1">{r.industry}</td>
                              <td className="text-right py-1">{r.lq.toFixed(2)}</td>
                              <td className="text-right py-1">{Math.round(r.basic_emp).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* 解釈ガイド */}
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs space-y-1">
                    <p><strong>商圏 ({radiusKm}km半径) の解釈</strong>:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>圏内 <strong>{munisInRadius.length}</strong> 市区町村、人口換算 <strong>{aggregate.total_employment.toLocaleString()}人</strong> の雇用ベース</li>
                      {aggregate.ebm >= 3.0 && aggregate.ebm <= 6.0 && (
                        <li>EBM {aggregate.ebm.toFixed(2)} = 健全レンジ（多角化＋輸出基盤バランス）</li>
                      )}
                      {aggregate.ebm > 8.0 && (
                        <li>EBM {aggregate.ebm.toFixed(2)} = 基盤雇用が薄め（半径を広げると改善するかも）</li>
                      )}
                      {aggregate.ebm < 2.5 && aggregate.ebm > 0 && (
                        <li>EBM {aggregate.ebm.toFixed(2)} = 過剰特化（観光地や工業中心地の可能性）</li>
                      )}
                      <li>テナント・商業出店の需給判断には、この商圏内の購買力（雇用×給与水準）を参考に</li>
                      <li className="text-[10px] text-slate-500 mt-1">
                        ※ 直線距離(haversine) ベース。実際の車・徒歩アクセスは地形・道路網で変動
                      </li>
                    </ul>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-12 text-center text-slate-500 text-sm">
              ← 左側で住所を入力してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

import type { MuniCentroid } from "@/lib/use-muni-centroids";
import type { MuniIndustryEntry } from "@/lib/use-muni-industry";

/** 商圏内市区町村のアクセス性集計（OSRM ベース） */
function AccessibilitySummary({
  munisInRadius,
  matrix,
}: {
  munisInRadius: Array<{ code: string; centroid: MuniCentroid; distance_km: number }>;
  matrix: Record<string, MuniIndustryEntry>;
}) {
  // OSRM データがある市区町村のみ集計
  const withOsrm = munisInRadius.filter((m) => m.centroid.car_dependency_score != null);
  if (withOsrm.length === 0) return null;

  const avg = (key: keyof MuniCentroid): number => {
    const vals = withOsrm
      .map((m) => m.centroid[key])
      .filter((v): v is number => typeof v === "number" && !isNaN(v));
    if (vals.length === 0) return 0;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  const avgCarDep = avg("car_dependency_score");
  const avgStationKm = avg("nearest_station_km");
  const avgStationMin = avg("nearest_station_min");
  const avgMedicalMin = avg("nearest_medical_min");
  const avgCommercialMin = avg("nearest_commercial_min");

  // 車依存度ランク
  const carDepRank =
    avgCarDep >= 70 ? { label: "高（地方山間・離島型）", color: "text-rose-700" } :
    avgCarDep >= 50 ? { label: "中（地方都市・郊外型）", color: "text-amber-700" } :
    avgCarDep >= 30 ? { label: "低（都市型）", color: "text-emerald-700" } :
    { label: "極低（鉄道網密集地）", color: "text-emerald-700" };

  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-sm font-semibold mb-2">
        🚗 商圏のアクセス性（OSRM 走行距離ベース）
      </p>
      <p className="text-xs text-slate-500 mb-2">
        圏内 {withOsrm.length}/{munisInRadius.length} 市区町村のセントロイドから最寄り施設までの走行時間・距離の平均
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        <div className="rounded border p-2">
          <div className="text-slate-500">平均車依存度</div>
          <div className="text-lg font-semibold">{avgCarDep.toFixed(0)}</div>
          <div className={`text-[10px] ${carDepRank.color}`}>{carDepRank.label}</div>
        </div>
        <div className="rounded border p-2">
          <div className="text-slate-500">最寄り駅まで(車)</div>
          <div className="text-lg font-semibold">{avgStationMin.toFixed(0)}分</div>
          <div className="text-[10px] text-slate-400">{avgStationKm.toFixed(1)}km</div>
        </div>
        <div className="rounded border p-2">
          <div className="text-slate-500">最寄り医療施設まで</div>
          <div className="text-lg font-semibold">{avgMedicalMin.toFixed(0)}分</div>
        </div>
        <div className="rounded border p-2 col-span-2 md:col-span-3">
          <div className="text-slate-500">最寄り商業施設まで</div>
          <div className="text-lg font-semibold">{avgCommercialMin.toFixed(0)}分</div>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-2">
        ※ 各市区町村セントロイドから最寄り施設への走行時間(OSRM)。
        商圏中心点からではないため、商圏内の典型的なアクセス性として参照。
      </p>
    </div>
  );
}
