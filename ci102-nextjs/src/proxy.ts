/**
 * Next.js 16 Proxy (旧 Middleware)。
 *
 * 役割:
 *   1. 認証チェック (CCIM受講生向け共有パスワード) — APP_PASSWORD 設定時
 *   2. /api/* に対するレート制限 (60req/min/IP)
 *   3. /api/* に対する Origin チェック
 *
 * 認証フロー:
 *   - 未認証 + 保護対象パス → /login にリダイレクト
 *   - 認証済み + /login にアクセス → / にリダイレクト
 *   - APP_PASSWORD 未設定 → 認証無効化 (ローカル開発)
 *
 * Edge Runtime で動作。`src/lib/auth.ts` の Web Crypto API を使用。
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, verifySessionCookie } from "@/lib/auth";

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter for API routes
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 req/min per IP

const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = ipHits.get(ip) ?? [];
  const recent = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    ipHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  return false;
}

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
// 認証チェック対象パス
// ---------------------------------------------------------------------------

/** 認証なしでアクセス可能なパスの prefix リスト */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/external",  // Proformer連携トークン認証
  "/data/commute_od/",   // 通勤OD行列（API Route内部からのfetch用・政府統計の加工品）
  "/data/commute_louvain.json", // Louvainゾーン（同上）
  // 静的アセット (_next, favicon等) は matcher で除外済み
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ---------------------------------------------------------------------------
// Proxy 本体
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ========== 0. Proformer連携: ?token= パラメータによる外部認証 ==========
  const externalToken = request.nextUrl.searchParams.get("token");
  if (externalToken && !pathname.startsWith("/api/auth/")) {
    // トークン付きURLは /api/auth/external へリダイレクトし認証処理を委任
    const authUrl = new URL("/api/auth/external", request.url);
    authUrl.searchParams.set("token", externalToken);
    // token以外のパラメータ（center, pref等）を保持してリダイレクト先に渡す
    const redirectParams = new URLSearchParams();
    request.nextUrl.searchParams.forEach((v, k) => {
      if (k !== "token") redirectParams.set(k, v);
    });
    const redirectTarget = pathname + (redirectParams.toString() ? `?${redirectParams.toString()}` : "");
    authUrl.searchParams.set("redirect", redirectTarget);
    return NextResponse.redirect(authUrl);
  }

  // ========== 1. 認証チェック (APP_PASSWORD 設定時のみ) ==========
  if (isAuthEnabled() && !isPublicPath(pathname)) {
    const cookieHeader = request.headers.get("cookie");
    const session = await verifySessionCookie(cookieHeader);
    if (!session) {
      // API ルートは 401 返却、ページは /login へリダイレクト
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "認証が必要です。/login からログインしてください" },
          { status: 401 },
        );
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    // セッション ID をダウンストリーム (API ルート) に伝搬 — ログ用
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set("x-session-id", session.sid);
    // 既にログイン済みでログインページを訪れた場合は / へ
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // ========== 2. API ルート向け: レート制限 + Origin チェック ==========
  if (pathname.startsWith("/api/")) {
    cleanup();

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

    const origin = request.headers.get("origin");
    if (origin) {
      const allowed =
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes(".vercel.app") ||
        origin.includes("ci102");
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
      }
    }

    const response = NextResponse.next();
    if (origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // 認証は全パスで適用、ただし静的アセット類は除外
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
