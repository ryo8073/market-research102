/**
 * 通勤経済圏 動的生成API
 *
 * ODデータ・Louvainデータは public/data/ からfetchで読み込み。
 * サーバー側メモリキャッシュで2回目以降は即応答。
 *
 * GET /api/commute-zone?center=13120&threshold=10
 * GET /api/commute-zone?center=13120&method=louvain&resolution=1.0
 */

import { NextRequest, NextResponse } from "next/server";

// 隣接都道府県マップ
const ADJACENT_PREFS: Record<number, number[]> = {
  1: [2], 2: [1,3,5], 3: [2,4,5], 4: [3,5,6,7], 5: [2,3,4,6],
  6: [4,5,7,15], 7: [4,6,8,9,10,15], 8: [7,9,11,12], 9: [7,8,10,11,12],
  10: [7,9,11,15,20], 11: [8,9,10,12,13,19,20], 12: [8,9,11,13],
  13: [11,12,14,19], 14: [13,22], 15: [6,7,10,16,20],
  16: [15,17,20,21], 17: [16,18,21], 18: [17,21,25,26],
  19: [11,13,14,20,22], 20: [10,11,15,16,19,21,22,23],
  21: [16,17,18,20,23,24,25], 22: [14,19,20,23], 23: [20,21,22,24],
  24: [21,23,25,26,29,30], 25: [18,21,24,26], 26: [18,24,25,27,28,29],
  27: [26,28,29,30], 28: [26,27,29,30,31,33], 29: [24,26,27,30],
  30: [24,27,28,29], 31: [28,32,33], 32: [31,33,34,35],
  33: [28,31,34,37], 34: [32,33,35,37], 35: [32,34,40,44],
  36: [37,38,39], 37: [33,34,36,38], 38: [36,37,39,44],
  39: [36,38], 40: [35,41,42,43,44], 41: [40,42,43],
  42: [40,41,43], 43: [40,41,44,45,46], 44: [35,38,40,43,45],
  45: [43,44,46], 46: [43,45,47], 47: [46],
};

interface ODData {
  od: Record<string, Record<string, number>>;
  total_employed: Record<string, number>;
}

// メモリキャッシュ
const _odCache: Record<string, ODData> = {};
let _louvainCache: Record<string, { zones: Record<string, string[]>; muni_to_zone: Record<string, string> }> | null = null;

/**
 * ODデータをfetchで読み込み（内部URL）。
 * Vercelではpublic/はCDN配信されるため、自サイトURLでfetchする。
 * API RouteからのfetchはサーバーサイドなのでCookieは不要（internal request）。
 */
async function loadOD(prefCode: number, baseUrl: string): Promise<ODData | null> {
  const key = String(prefCode).padStart(2, "0");
  if (_odCache[key]) return _odCache[key];
  try {
    // Vercel内部ではpublic/のファイルはCDN経由でアクセス可能
    // 認証はproxyのmiddlewareで処理されるが、サーバーサイドfetchはmiddlewareを通らない場合がある
    // そのため直接URLでfetchする
    const url = `${baseUrl}/data/commute_od/${key}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: ODData = await res.json();
    _odCache[key] = data;
    return data;
  } catch {
    return null;
  }
}

async function loadLouvain(baseUrl: string): Promise<typeof _louvainCache> {
  if (_louvainCache) return _louvainCache;
  try {
    const res = await fetch(`${baseUrl}/data/commute_louvain.json`);
    if (!res.ok) return null;
    const data = await res.json();
    _louvainCache = data.resolutions;
    return _louvainCache;
  } catch {
    return null;
  }
}

function computeZone(
  center: string,
  threshold: number,
  odMap: Record<string, Record<string, number>>,
  totalEmployed: Record<string, number>,
  maxTiers: number = 3,
): string[] {
  const zone = new Set<string>();
  const queue = [center];
  zone.add(center);

  for (let tier = 0; tier < maxTiers; tier++) {
    const nextQueue: string[] = [];
    for (const target of queue) {
      for (const [origin, dests] of Object.entries(odMap)) {
        if (zone.has(origin)) continue;
        const commutersToTarget = dests[target] ?? 0;
        const totalEmp = totalEmployed[origin] ?? 0;
        if (totalEmp > 0 && commutersToTarget / totalEmp >= threshold / 100) {
          zone.add(origin);
          nextQueue.push(origin);
        }
      }
    }
    if (nextQueue.length === 0) break;
    queue.length = 0;
    queue.push(...nextQueue);
  }

  return Array.from(zone).sort();
}

export const dynamic = "force-dynamic";

/** 成功レスポンスにキャッシュヘッダーを付与 */
function cachedJson(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

export async function GET(request: NextRequest) {
  const center = request.nextUrl.searchParams.get("center");
  const thresholdStr = request.nextUrl.searchParams.get("threshold") ?? "10";
  const threshold = Number(thresholdStr);
  const method = request.nextUrl.searchParams.get("method") ?? "od";
  const resolutionStr = request.nextUrl.searchParams.get("resolution") ?? "1.0";

  if (!center || center.length < 4) {
    return NextResponse.json({ error: "center パラメータが必要です（市区町村コード5桁）" }, { status: 400 });
  }

  const centerCode = center.padStart(5, "0");
  const baseUrl = request.nextUrl.origin;

  // Louvainモード
  if (method === "louvain") {
    const louvain = await loadLouvain(baseUrl);
    if (!louvain || !louvain[resolutionStr]) {
      return NextResponse.json({ error: `Louvainデータが見つかりません（resolution=${resolutionStr}）` }, { status: 404 });
    }
    const resData = louvain[resolutionStr];
    const zoneId = resData.muni_to_zone[centerCode];
    if (!zoneId) {
      return NextResponse.json({ center: centerCode, zone: [centerCode], stats: { n_members: 1, note: "Louvainゾーン未所属" }, method: "louvain_fallback" });
    }
    const zone = resData.zones[zoneId] ?? [centerCode];
    return cachedJson({
      center: centerCode,
      resolution: Number(resolutionStr),
      zone,
      zone_id: zoneId,
      stats: { n_members: zone.length },
      method: `louvain_${resolutionStr}`,
    });
  }

  // ODモード
  if (![5, 10, 15, 20, 25].includes(threshold)) {
    return NextResponse.json({ error: "threshold は 5, 10, 15, 20, 25 のいずれか" }, { status: 400 });
  }

  const prefCode = parseInt(centerCode.slice(0, 2), 10);
  const prefsToLoad = [prefCode, ...(ADJACENT_PREFS[prefCode] ?? [])];
  const mergedOD: Record<string, Record<string, number>> = {};
  const mergedEmployed: Record<string, number> = {};

  await Promise.all(
    prefsToLoad.map(async (pc) => {
      const data = await loadOD(pc, baseUrl);
      if (data) {
        Object.assign(mergedOD, data.od);
        Object.assign(mergedEmployed, data.total_employed);
      }
    })
  );

  if (Object.keys(mergedOD).length === 0) {
    return NextResponse.json({
      center: centerCode,
      threshold,
      zone: [centerCode],
      stats: { n_members: 1, note: "OD行列データが未取得です" },
      method: "fallback_single",
    });
  }

  const zone = computeZone(centerCode, threshold, mergedOD, mergedEmployed);

  return cachedJson({
    center: centerCode,
    threshold,
    zone,
    stats: { n_members: zone.length, prefs_loaded: prefsToLoad.length },
    method: `commute_od_${threshold}pct`,
  });
}
