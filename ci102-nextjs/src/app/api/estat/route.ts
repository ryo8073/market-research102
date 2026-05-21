/**
 * e-Stat API proxy route handler.
 * Fetches industry employment data from e-Stat economic census.
 *
 * GET /api/estat?prefCode=13&cityCode=101
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { buildAreaCode } from "@/lib/codes";

const ESTAT_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";

// Known table IDs
const EMPLOYMENT_2021 = "0003449718";
const EMPLOYMENT_2016 = "0003218721";
const POPULATION_2020 = "0003433220";

// Skip aggregate categories
const SKIP_CATEGORIES = new Set(["AS", "AR", "AB", "CR"]);

export async function GET(request: NextRequest) {
  const appId = getEnv("ESTAT_APP_ID");
  if (!appId) {
    return NextResponse.json({ error: "ESTAT_APP_ID not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const prefCode = Number(searchParams.get("prefCode") ?? 0);
  const cityCode = searchParams.get("cityCode")
    ? Number(searchParams.get("cityCode"))
    : undefined;
  const dataset = searchParams.get("dataset") ?? "employment_2021";

  if (!prefCode) {
    return NextResponse.json({ error: "prefCode required" }, { status: 400 });
  }

  const areaCode = buildAreaCode(prefCode, cityCode);

  try {
    let tableId: string;
    let cdTab: string;
    let extraParams: Record<string, string> = {};

    switch (dataset) {
      case "employment_2021":
        tableId = EMPLOYMENT_2021;
        cdTab = "113-2021";
        extraParams = { cdCat02: "0" };
        break;
      case "employment_2016":
        tableId = EMPLOYMENT_2016;
        cdTab = "812";
        extraParams = { cdCat01: "000" };
        break;
      case "population":
        tableId = POPULATION_2020;
        cdTab = "";
        break;
      default:
        return NextResponse.json({ error: `Unknown dataset: ${dataset}` }, { status: 400 });
    }

    const params = new URLSearchParams({
      appId,
      statsDataId: tableId,
      cdArea: areaCode,
      ...(cdTab && { cdTab }),
      ...extraParams,
    });

    const res = await fetch(`${ESTAT_BASE}?${params}`, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json({ error: `e-Stat API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const values = data?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE ?? [];

    // Parse into employment dict
    const employment: Record<string, number> = {};
    for (const v of values) {
      const catCode = v["@cat01"] ?? v["@cat02"] ?? "";
      const catName = v["$"] !== undefined ? undefined : v["@cat01"];
      if (SKIP_CATEGORIES.has(catCode)) continue;
      // Simplified: return raw values for client-side processing
    }

    return NextResponse.json({
      areaCode,
      dataset,
      rawValues: values.slice(0, 500), // Limit response size
      count: values.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch: ${String(error)}` },
      { status: 500 },
    );
  }
}
