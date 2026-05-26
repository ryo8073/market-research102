/**
 * OSRM Table API プロキシ。
 *
 * 中心点 (src) から複数の宛先 (destinations[]) への
 * 走行距離・走行時間を一括計算する。
 *
 * 公開OSRM デモサーバ (router.project-osrm.org) を利用。
 * クライアントから直接呼ぶと CORS エラーになるため本プロキシ経由で。
 *
 * 大量の宛先 (>=100) は複数バッチに分割してリクエスト。
 * OSRM public のレート制限を考慮して各バッチ間に 200ms 待機。
 *
 * POST /api/osrm-table
 * Body: { src: [lon, lat], destinations: Array<[lon, lat]> }
 * Returns: { durations_min: Array<number|null>, distances_km: Array<number|null> }
 *   配列の順序は destinations と一致 (失敗した場合 null)
 */
import { NextRequest, NextResponse } from "next/server";

const OSRM_BASE = "https://router.project-osrm.org";
const OSRM_PROFILE = "car";
const BATCH_SIZE = 80;  // 1リクエストあたりの最大宛先数 (URL長制限・サーバ負荷考慮)
const BATCH_DELAY_MS = 200;  // バッチ間の待機時間

interface TableResponse {
  code: string;
  durations?: (number | null)[][];
  distances?: (number | null)[][];
}

async function osrmTableBatch(
  src: [number, number],
  batch: [number, number][],
): Promise<{ durations: (number | null)[]; distances: (number | null)[] }> {
  const allCoords = [src, ...batch];
  const coordsStr = allCoords.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const destIndices = batch.map((_, i) => i + 1).join(";");
  const url =
    `${OSRM_BASE}/table/v1/${OSRM_PROFILE}/${coordsStr}` +
    `?sources=0&destinations=${destIndices}&annotations=distance,duration`;

  const r = await fetch(url, {
    headers: { "User-Agent": "CI102-MarketAnalysis/1.0" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!r.ok) {
    throw new Error(`OSRM Table API returned ${r.status}`);
  }
  const data: TableResponse = await r.json();
  if (data.code !== "Ok" || !data.durations || !data.distances) {
    throw new Error(`OSRM error: ${data.code}`);
  }
  return {
    durations: data.durations[0],
    distances: data.distances[0],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OsrmTableBody {
  src?: [number, number];
  destinations?: [number, number][];
}

function isValidCoord(c: unknown): c is [number, number] {
  return (
    Array.isArray(c) &&
    c.length === 2 &&
    typeof c[0] === "number" &&
    typeof c[1] === "number" &&
    isFinite(c[0]) &&
    isFinite(c[1]) &&
    c[0] >= 120 && c[0] <= 150 &&  // 経度 (日本範囲)
    c[1] >= 20 && c[1] <= 50       // 緯度 (日本範囲)
  );
}

export async function POST(request: NextRequest) {
  let body: OsrmTableBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディの解析失敗" }, { status: 400 });
  }

  if (!body.src || !isValidCoord(body.src)) {
    return NextResponse.json({ error: "src (中心点) の経緯度が不正です。日本範囲 (経度120-150, 緯度20-50) を指定してください" }, { status: 400 });
  }

  if (!Array.isArray(body.destinations) || body.destinations.length === 0) {
    return NextResponse.json({ error: "destinations が空です" }, { status: 400 });
  }

  if (body.destinations.length > 500) {
    return NextResponse.json({ error: "destinations は最大500件まで。半径を絞ってください" }, { status: 400 });
  }

  // 全宛先をバリデーション
  const validDestinations: [number, number][] = [];
  const indexMap: number[] = [];  // 結果配列のインデックス → 元のインデックス
  for (let i = 0; i < body.destinations.length; i++) {
    const d = body.destinations[i];
    if (isValidCoord(d)) {
      validDestinations.push(d);
      indexMap.push(i);
    }
  }

  // バッチ分割
  const allDurationsMin: (number | null)[] = new Array(body.destinations.length).fill(null);
  const allDistancesKm: (number | null)[] = new Array(body.destinations.length).fill(null);

  try {
    const startTime = Date.now();
    for (let batchStart = 0; batchStart < validDestinations.length; batchStart += BATCH_SIZE) {
      const batch = validDestinations.slice(batchStart, batchStart + BATCH_SIZE);
      const result = await osrmTableBatch(body.src, batch);
      for (let i = 0; i < batch.length; i++) {
        const originalIdx = indexMap[batchStart + i];
        const durSec = result.durations[i];
        const distM = result.distances[i];
        allDurationsMin[originalIdx] = durSec != null ? Math.round((durSec / 60) * 10) / 10 : null;
        allDistancesKm[originalIdx] = distM != null ? Math.round((distM / 1000) * 10) / 10 : null;
      }
      // バッチ間レート制限 (最後のバッチでは不要)
      if (batchStart + BATCH_SIZE < validDestinations.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    return NextResponse.json({
      durations_min: allDurationsMin,
      distances_km: allDistancesKm,
      meta: {
        total: body.destinations.length,
        batches: Math.ceil(validDestinations.length / BATCH_SIZE),
        latency_ms: Date.now() - startTime,
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: `OSRM Table API 呼び出し失敗: ${String(err).substring(0, 200)}`,
    }, { status: 502 });
  }
}
