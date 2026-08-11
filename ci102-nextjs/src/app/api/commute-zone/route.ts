/**
 * 通勤経済圏 動的生成API
 *
 * ODデータ・Louvainデータは static import で直接バンドル。
 * fetchもfsも不要 — 認証問題・NFTトレース問題を完全解消。
 *
 * GET /api/commute-zone?center=13120&threshold=10
 * GET /api/commute-zone?center=13120&method=louvain&resolution=1.0
 */

import { NextRequest, NextResponse } from "next/server";

// OD行列とLouvainデータをstatic importでバンドル
import od01 from "@/../public/data/commute_od/01.json";
import od02 from "@/../public/data/commute_od/02.json";
import od03 from "@/../public/data/commute_od/03.json";
import od04 from "@/../public/data/commute_od/04.json";
import od05 from "@/../public/data/commute_od/05.json";
import od06 from "@/../public/data/commute_od/06.json";
import od07 from "@/../public/data/commute_od/07.json";
import od08 from "@/../public/data/commute_od/08.json";
import od09 from "@/../public/data/commute_od/09.json";
import od10 from "@/../public/data/commute_od/10.json";
import od11 from "@/../public/data/commute_od/11.json";
import od12 from "@/../public/data/commute_od/12.json";
import od13 from "@/../public/data/commute_od/13.json";
import od14 from "@/../public/data/commute_od/14.json";
import od15 from "@/../public/data/commute_od/15.json";
import od16 from "@/../public/data/commute_od/16.json";
import od17 from "@/../public/data/commute_od/17.json";
import od18 from "@/../public/data/commute_od/18.json";
import od19 from "@/../public/data/commute_od/19.json";
import od20 from "@/../public/data/commute_od/20.json";
import od21 from "@/../public/data/commute_od/21.json";
import od22 from "@/../public/data/commute_od/22.json";
import od23 from "@/../public/data/commute_od/23.json";
import od24 from "@/../public/data/commute_od/24.json";
import od25 from "@/../public/data/commute_od/25.json";
import od26 from "@/../public/data/commute_od/26.json";
import od27 from "@/../public/data/commute_od/27.json";
import od28 from "@/../public/data/commute_od/28.json";
import od29 from "@/../public/data/commute_od/29.json";
import od30 from "@/../public/data/commute_od/30.json";
import od31 from "@/../public/data/commute_od/31.json";
import od32 from "@/../public/data/commute_od/32.json";
import od33 from "@/../public/data/commute_od/33.json";
import od34 from "@/../public/data/commute_od/34.json";
import od35 from "@/../public/data/commute_od/35.json";
import od36 from "@/../public/data/commute_od/36.json";
import od37 from "@/../public/data/commute_od/37.json";
import od38 from "@/../public/data/commute_od/38.json";
import od39 from "@/../public/data/commute_od/39.json";
import od40 from "@/../public/data/commute_od/40.json";
import od41 from "@/../public/data/commute_od/41.json";
import od42 from "@/../public/data/commute_od/42.json";
import od43 from "@/../public/data/commute_od/43.json";
import od44 from "@/../public/data/commute_od/44.json";
import od45 from "@/../public/data/commute_od/45.json";
import od46 from "@/../public/data/commute_od/46.json";
import od47 from "@/../public/data/commute_od/47.json";
import louvainData from "@/../public/data/commute_louvain.json";

interface ODData {
  od: Record<string, Record<string, number>>;
  total_employed: Record<string, number>;
}

const OD_MAP: Record<number, ODData> = {
  1: od01, 2: od02, 3: od03, 4: od04, 5: od05, 6: od06, 7: od07,
  8: od08, 9: od09, 10: od10, 11: od11, 12: od12, 13: od13, 14: od14,
  15: od15, 16: od16, 17: od17, 18: od18, 19: od19, 20: od20, 21: od21,
  22: od22, 23: od23, 24: od24, 25: od25, 26: od26, 27: od27, 28: od28,
  29: od29, 30: od30, 31: od31, 32: od32, 33: od33, 34: od34, 35: od35,
  36: od36, 37: od37, 38: od38, 39: od39, 40: od40, 41: od41, 42: od42,
  43: od43, 44: od44, 45: od45, 46: od46, 47: od47,
};

const LOUVAIN: Record<string, { zones: Record<string, string[]>; muni_to_zone: Record<string, string> }> =
  (louvainData as { resolutions: typeof LOUVAIN }).resolutions;

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

  if (!center || !/^\d{4,5}$/.test(center)) {
    return NextResponse.json({ error: "center パラメータが必要です（数字4-5桁の市区町村コード）" }, { status: 400 });
  }

  const centerCode = center.padStart(5, "0");

  // Louvainモード
  if (method === "louvain") {
    const resData = LOUVAIN[resolutionStr];
    if (!resData) {
      return NextResponse.json({ error: `Louvainデータが見つかりません（resolution=${resolutionStr}）` }, { status: 404 });
    }
    const zoneId = resData.muni_to_zone[centerCode];
    if (!zoneId) {
      return cachedJson({ center: centerCode, zone: [centerCode], stats: { n_members: 1, note: "Louvainゾーン未所属" }, method: "louvain_fallback" });
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

  for (const pc of prefsToLoad) {
    const data = OD_MAP[pc];
    if (data) {
      Object.assign(mergedOD, data.od);
      Object.assign(mergedEmployed, data.total_employed);
    }
  }

  if (Object.keys(mergedOD).length === 0) {
    return NextResponse.json({
      center: centerCode,
      threshold,
      zone: [centerCode],
      stats: { n_members: 1, note: "OD行列データが見つかりません" },
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
