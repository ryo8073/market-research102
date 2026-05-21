import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter for API routes
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 req/min per IP

const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = ipHits.get(ip) ?? [];
  // Slide the window: keep only recent hits
  const recent = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    ipHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  return false;
}

// Periodic cleanup to avoid memory leak (every 5 minutes)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [ip, hits] of ipHits) {
    const recent = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      ipHits.delete(ip);
    } else {
      ipHits.set(ip, recent);
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to /api/* routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  cleanup();

  // --- Rate limiting ---
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  // --- Origin check (loose: block requests from unknown external origins) ---
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Allow: same-origin (no origin header), Vercel preview URLs, localhost
  if (origin) {
    const allowed =
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes(".vercel.app") ||
      origin.includes("ci102");
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden origin" },
        { status: 403 },
      );
    }
  }

  const response = NextResponse.next();

  // CORS headers for allowed origins
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
