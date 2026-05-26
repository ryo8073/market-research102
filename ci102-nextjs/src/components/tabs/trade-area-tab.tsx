"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  useMuniCentroids,
  findMunicipalitiesInRadius,
  findMunicipalitiesInDriveTime,
  type MuniCentroid,
  type MuniWithDriveTime,
} from "@/lib/use-muni-centroids";
import { useMuniIndustryMatrix, computeCustomMetro, type MuniIndustryEntry } from "@/lib/use-muni-industry";

// Dynamic import for MapLibre (no SSR)
const TradeAreaMap = dynamic(() => import("@/components/trade-area-map"), { ssr: false });

interface GeocodeResult {
  title: string;
  lon: number;
  lat: number;
}

type Mode = "haversine" | "drive_time";

const RADIUS_OPTIONS = [
  { km: 1, label: "1km（徒歩商圏）" },
  { km: 2, label: "2km（徒歩+自転車）" },
  { km: 5, label: "5km（近隣商圏）" },
  { km: 10, label: "10km（広域商圏）" },
  { km: 30, label: "30km（都市圏）" },
];

const DRIVE_TIME_OPTIONS = [
  { min: 10, label: "10分（近隣・徒歩+自転車相当）" },
  { min: 15, label: "15分（地元商圏）" },
  { min: 30, label: "30分（広域商圏）" },
  { min: 60, label: "60分（都市圏・通勤圏）" },
  { min: 90, label: "90分（広域都市圏）" },
];

export default function TradeAreaTab() {
  const { centroids, loading: centroidsLoading } = useMuniCentroids();
  const { matrix, loading: matrixLoading } = useMuniIndustryMatrix();

  const [mode, setMode] = useState<Mode>("haversine");
  const [addressQuery, setAddressQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([]);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [center, setCenter] = useState<{ lon: number; lat: number; title: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [driveMinutes, setDriveMinutes] = useState<number>(30);
  const [manualLon, setManualLon] = useState("");
  const [manualLat, setManualLat] = useState("");

  // Drive-time mode 状態
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveResult, setDriveResult] = useState<MuniWithDriveTime[]>([]);
  const [driveMeta, setDriveMeta] = useState<{
    candidatesTotal: number;
    candidatesQueried: number;
    apiLatencyMs: number;
  } | null>(null);

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

  // Haversine 圏内市区町村
  const munisInRadiusHav = useMemo(() => {
    if (!centroids || !center || mode !== "haversine") return [];
    return findMunicipalitiesInRadius(centroids, center.lon, center.lat, radiusKm);
  }, [centroids, center, radiusKm, mode]);

  // Drive-time モードに切替 or 中心変更 or 時間変更時に OSRM 呼出
  useEffect(() => {
    if (mode !== "drive_time" || !centroids || !center) {
      setDriveResult([]);
      setDriveMeta(null);
      return;
    }
    let cancelled = false;
    setDriveLoading(true);
    setDriveError(null);
    findMunicipalitiesInDriveTime(centroids, center.lon, center.lat, driveMinutes)
      .then((res) => {
        if (cancelled) return;
        setDriveResult(res.result);
        setDriveMeta({
          candidatesTotal: res.candidatesTotal,
          candidatesQueried: res.candidatesQueried,
          apiLatencyMs: res.apiLatencyMs,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[drive-time]", err);
        setDriveError(String(err));
        setDriveResult([]);
      })
      .finally(() => {
        if (cancelled) return;
        setDriveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, centroids, center, driveMinutes]);

  // 統一: モードに応じて該当する市区町村リスト
  const munisInArea = mode === "haversine" ? munisInRadiusHav : driveResult;

  // 集計結果
  const aggregate = useMemo(() => {
    if (!matrix || munisInArea.length === 0) return null;
    const codes = munisInArea.map((m) => m.code);
    return computeCustomMetro(matrix, codes);
  }, [matrix, munisInArea]);

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

  // 地図表示用のシンプル化された配列 (TradeAreaMap が期待する形式)
  const munisForMap = mode === "drive_time"
    ? driveResult.map((m) => ({ code: m.code, centroid: m.centroid, distance_km: m.distance_km }))
    : munisInRadiusHav;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">商圏分析（住所から周辺集計）</h2>
        <p className="text-sm text-gray-700">
          住所から緯度経度を取得し、<strong>指定半径 (km) または走行時間 (分) 内の市区町村</strong>を経済圏として合算評価します。
          物件単位の投資判断に使えます。
        </p>
      </div>

      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-3 text-sm">
        <strong>💡 使い方</strong>:
        ①住所/緯度経度を指定 → ②モード選択 (直線距離 / 走行時間) → ③半径または時間を選択 → ④圏内データ自動集計。
        <span className="block mt-1 text-xs">
          🚗 <strong>走行時間モード</strong>は OSRM (Open Source Routing Machine) で実際の道路ネットワーク経由の到達時間を計算。
          山・川・島による分断を反映した実態に近い商圏になります。
        </span>
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

            {/* モード切替 */}
            <div className="mt-2">
              <p className="font-semibold text-sm mb-1">📐 2. 商圏の判定モード</p>
              <div className="inline-flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMode("haversine")}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    mode === "haversine" ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
                  }`}
                >
                  📏 直線距離 (km)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("drive_time")}
                  className={`px-3 py-1.5 text-xs transition-colors border-l ${
                    mode === "drive_time" ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
                  }`}
                  title="OSRM で実際の道路ネットワーク経由の走行時間を計算"
                >
                  🚗 走行時間 (分)
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {mode === "haversine"
                  ? "直線距離(haversine)。即時計算だが川・山・島の分断を考慮しない"
                  : "OSRM Table API。実際の道路経由。1-3秒程度の計算時間"}
              </p>
            </div>

            {/* 半径選択 or 走行時間選択 */}
            <div>
              <p className="font-semibold text-sm mt-2">
                {mode === "haversine" ? "📏 3. 商圏の半径" : "⏱️ 3. 商圏の到達時間"}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {mode === "haversine"
                  ? RADIUS_OPTIONS.map((r) => (
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
                    ))
                  : DRIVE_TIME_OPTIONS.map((r) => (
                      <button
                        key={r.min}
                        onClick={() => setDriveMinutes(r.min)}
                        className={`px-2 py-1 text-xs rounded border ${
                          driveMinutes === r.min
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

          {/* OSRM ローディング・エラー */}
          {mode === "drive_time" && driveLoading && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                <span>OSRM で走行時間を計算中...</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                公開OSRMサーバーへのリクエスト中 (通常1-3秒)
              </p>
            </div>
          )}
          {mode === "drive_time" && driveError && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
              <p className="font-semibold">⚠️ 走行時間計算エラー</p>
              <p className="mt-1">{driveError}</p>
              <p className="mt-1 text-rose-700">直線距離モードに切り替えるか、しばらく待ってから再試行してください。</p>
            </div>
          )}

          {/* 圏内市区町村リスト */}
          {center && (
            <div className="rounded-lg border bg-white p-3">
              <p className="font-semibold text-sm mb-2">
                📍 商圏内の市区町村: <strong>{munisInArea.length}件</strong>
                {mode === "drive_time" && driveMeta && (
                  <span className="text-[10px] text-slate-500 font-normal ml-1">
                    (候補{driveMeta.candidatesQueried}件中、{driveMeta.apiLatencyMs}ms)
                  </span>
                )}
              </p>
              <div className="max-h-[300px] overflow-y-auto text-xs space-y-1">
                {munisInArea.slice(0, 50).map((m) => {
                  const driveMin = (m as MuniWithDriveTime).drive_min;
                  const driveKm = (m as MuniWithDriveTime).drive_km;
                  return (
                    <div key={m.code} className="flex justify-between border-b border-slate-100 py-1">
                      <span>{m.centroid.name}</span>
                      {mode === "drive_time" && driveMin != null ? (
                        <span className="text-slate-500">
                          🚗 {driveMin.toFixed(0)}分
                          {driveKm != null && <span className="text-[10px] ml-1">({driveKm.toFixed(1)}km)</span>}
                        </span>
                      ) : (
                        <span className="text-slate-500">{m.distance_km.toFixed(1)} km</span>
                      )}
                    </div>
                  );
                })}
                {munisInArea.length > 50 && (
                  <p className="text-slate-500 text-center pt-2">
                    （他 {munisInArea.length - 50}件）
                  </p>
                )}
                {munisInArea.length === 0 && !driveLoading && (
                  <p className="text-slate-500 text-center py-4">
                    圏内に市区町村がありません。{mode === "haversine" ? "半径" : "時間"}を大きくしてください。
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
              {/* 地図 (走行時間モードは radiusKm の代わりに最大走行距離を概算で渡す) */}
              <div className="rounded-lg overflow-hidden border" style={{ height: 320 }}>
                <TradeAreaMap
                  centerLon={center.lon}
                  centerLat={center.lat}
                  radiusKm={mode === "haversine" ? radiusKm : Math.max(...munisForMap.map((m) => m.distance_km), 5)}
                  munisInRadius={munisForMap.slice(0, 50)}
                />
              </div>
              {mode === "drive_time" && (
                <p className="text-[10px] text-slate-500 -mt-2">
                  ※ 地図の円は商圏内市区町村の最大直線距離を表示。実際の到達範囲は道路網に沿うため形状は不規則。
                </p>
              )}

              {/* 集計結果 */}
              {aggregate && munisInArea.length > 0 && (
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
                  <AccessibilitySummary munisInRadius={munisForMap} matrix={matrix} />

                  <div className="rounded-lg border bg-white p-3">
                    <p className="text-sm font-semibold mb-2">基盤産業 TOP {Math.min(aggregate.top_lq_industries.length, 10)}</p>
                    {aggregate.top_lq_industries.length === 0 ? (
                      <p className="text-xs text-slate-500">LQ &gt; 1.0 の業種がありません。{mode === "haversine" ? "半径" : "時間"}を変更してください。</p>
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
                    <p>
                      <strong>
                        商圏 ({mode === "haversine" ? `${radiusKm}km半径` : `${driveMinutes}分走行圏`}) の解釈
                      </strong>:
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      <li>圏内 <strong>{munisInArea.length}</strong> 市区町村、人口換算 <strong>{aggregate.total_employment.toLocaleString()}人</strong> の雇用ベース</li>
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
                        ※ {mode === "haversine"
                          ? "直線距離(haversine) ベース。実際の車・徒歩アクセスは地形・道路網で変動"
                          : "OSRM 走行時間ベース。山・川・島の分断や高速道路を考慮した実態的な商圏。テナント想定の信頼性が高い"}
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

/** 商圏内市区町村のアクセス性集計（OSRM ベース） */
function AccessibilitySummary({
  munisInRadius,
  matrix,
}: {
  munisInRadius: Array<{ code: string; centroid: MuniCentroid; distance_km: number }>;
  matrix: Record<string, MuniIndustryEntry>;
}) {
  void matrix;
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
