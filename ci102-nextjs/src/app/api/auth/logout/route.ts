/**
 * ログアウトAPI。Cookie を無効化する。
 */
import { NextResponse } from "next/server";
import { clearSessionCookieString } from "@/lib/auth";

export const runtime = "edge";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookieString());
  return res;
}
