/**
 * 管理者向けログ閲覧API。
 *
 * 認証 (proxy.ts) を通過した上で、ADMIN_PASSWORD が一致するセッションのみ
 * アクセス可能。教育目的の限定的な管理機能。
 *
 * GET /api/admin/logs?token=<ADMIN_TOKEN>
 *   ?limit=200 で件数指定 (デフォルト200、最大1000)
 *
 * Response:
 *   { events: LogEvent[], counters: {action: count}, sessions: [...], enabled: bool }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  fetchRecentLogs,
  fetchActionCounters,
  fetchSessions,
  isLogEnabled,
} from "@/lib/usage-log";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN || "";

  // ADMIN_TOKEN 未設定 = admin 機能無効
  if (!adminToken) {
    return NextResponse.json(
      { error: "ADMIN_TOKEN が未設定のため管理画面は無効です" },
      { status: 503 },
    );
  }

  const token = request.nextUrl.searchParams.get("token");
  if (token !== adminToken) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isLogEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: "KV (ログ機能) が設定されていません。KV_REST_API_URL/TOKEN を設定してください",
      events: [],
      counters: {},
      sessions: [],
    });
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(1000, Math.max(10, Number(limitRaw) || 200));

  const [events, counters, sessions] = await Promise.all([
    fetchRecentLogs(limit),
    fetchActionCounters(),
    fetchSessions(),
  ]);

  return NextResponse.json({
    enabled: true,
    events,
    counters,
    sessions,
    fetched_at: new Date().toISOString(),
  });
}
