/**
 * ログインAPI。共有パスワードを検証し、セッションCookieを発行する。
 *
 * POST /api/auth/login
 * Body: { password: string }
 *
 * Response:
 *   200 { ok: true, sessionId: string }  — Cookie 設定済
 *   401 { error: "..." }                  — パスワード不一致
 *   429 { error: "..." }                  — 連続失敗 (proxy.ts のレート制限)
 *
 * セキュリティ:
 *   - パスワード比較は定数時間 (lib/auth.ts の verifyPassword)
 *   - Cookie は HttpOnly + Secure + SameSite=Lax
 *   - 失敗時は意図的に少し遅延 (タイミング攻撃緩和)
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, issueSessionCookie, verifyPassword } from "@/lib/auth";

export const runtime = "edge";

interface LoginBody {
  password?: unknown;
}

export async function POST(request: NextRequest) {
  // 認証無効化 (ローカル開発時) でも常にダミーセッションを発行する
  if (!isAuthEnabled()) {
    const { cookieString, sessionId } = await issueSessionCookie();
    const res = NextResponse.json({ ok: true, sessionId, devMode: true });
    res.headers.set("Set-Cookie", cookieString);
    return res;
  }

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (typeof body.password !== "string" || body.password.length === 0 || body.password.length > 200) {
    // 既に password 長さに依存しないよう短絡しないが、明らかに不正な型は弾く
    await delayMs(300);
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  if (!verifyPassword(body.password)) {
    // タイミング攻撃緩和のため意図的に遅延
    await delayMs(300 + Math.floor(Math.random() * 200));
    return NextResponse.json({ error: "パスワードが正しくありません" }, { status: 401 });
  }

  try {
    const { cookieString, sessionId } = await issueSessionCookie();
    const res = NextResponse.json({ ok: true, sessionId });
    res.headers.set("Set-Cookie", cookieString);
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: `認証設定エラー: ${String(err).substring(0, 200)}` },
      { status: 500 },
    );
  }
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
