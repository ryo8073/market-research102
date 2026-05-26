/**
 * 住所→緯度経度ジオコーディング API。
 * 国土地理院の住所検索API（無料、認証不要）を利用。
 *
 * 注意: 国土地理院API は完全一致ではないため、簡易的な住所のみ対応。
 * 例: "東京都新宿区西新宿2-8-1" → ヒット
 *     "新宿区西新宿2-8-1" → ヒットしない場合あり（都道府県名必須）
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

interface GsiResult {
  geometry: { coordinates: [number, number] };
  type: string;
  properties: { title: string };
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  try {
    const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query.trim())}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "CI102-MarketAnalysis/1.0" },
      // GSI keeps results fresh, no need for long cache
      next: { revalidate: 3600 },
    });
    if (!r.ok) {
      return NextResponse.json({ error: `GSI returned ${r.status}` }, { status: 502 });
    }
    const data: GsiResult[] = await r.json();
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ results: [] });
    }
    const results = data.slice(0, 5).map((d) => ({
      title: d.properties.title,
      lon: d.geometry.coordinates[0],
      lat: d.geometry.coordinates[1],
    }));
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[geocode]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
