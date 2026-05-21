/**
 * MLIT Real Estate Information Library API proxy.
 *
 * GET /api/mlit?prefCode=13&year=2024&quarter=1&cityCode=13101
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

const MLIT_BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001";

export async function GET(request: NextRequest) {
  const apiKey = getEnv("MLIT_API_KEY");
  if (!apiKey) {
    return NextResponse.json({ error: "MLIT_API_KEY not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const prefCode = Number(searchParams.get("prefCode") ?? 0);
  const year = Number(searchParams.get("year") ?? 2024);
  const quarter = Number(searchParams.get("quarter") ?? 1);
  const cityCode = searchParams.get("cityCode");

  if (!prefCode) {
    return NextResponse.json({ error: "prefCode required" }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      year: String(year),
      quarter: String(quarter),
      area: String(prefCode).padStart(2, "0"),
    });
    if (cityCode) {
      params.set("city", cityCode.padStart(5, "0"));
    }

    const res = await fetch(`${MLIT_BASE}?${params}`, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      next: { revalidate: 86400 }, // Cache for 1 day
    });

    if (!res.ok) {
      return NextResponse.json({ error: `MLIT API error: ${res.status}` }, { status: 502 });
    }

    const payload = await res.json();
    const data = payload?.data ?? [];

    return NextResponse.json({
      prefCode,
      year,
      quarter,
      count: data.length,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch: ${String(error)}` },
      { status: 500 },
    );
  }
}
