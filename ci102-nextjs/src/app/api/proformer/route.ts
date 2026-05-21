/**
 * Proformer API proxy.
 *
 * GET /api/proformer?externalId=xxx
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

const PROFORMER_BASE = "https://api.proformer.ai/api/v1/exports";

export async function GET(request: NextRequest) {
  const apiKey = getEnv("PROFORMER_API_KEY");
  if (!apiKey) {
    return NextResponse.json({ error: "PROFORMER_API_KEY not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const externalId = searchParams.get("externalId");

  if (!externalId) {
    return NextResponse.json({ error: "externalId required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${PROFORMER_BASE}/${externalId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Proformer API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    if (data?.status !== "ok") {
      return NextResponse.json({ error: "Proformer returned non-ok status" }, { status: 502 });
    }

    return NextResponse.json(data.export);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to fetch: ${String(error)}` },
      { status: 500 },
    );
  }
}
