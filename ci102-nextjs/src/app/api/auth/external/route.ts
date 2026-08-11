/**
 * Proformer連携 外部トークン認証エンドポイント
 *
 * フロー:
 *   1. Proformer(Cloud Run)がログイン済みユーザーに短期トークンを発行
 *   2. ユーザーがトークン付きURLでCI102に遷移
 *   3. proxy.tsが?token=を検出し、このエンドポイントにリダイレクト
 *   4. このエンドポイントがCloud Runの検証APIにトークンを送信
 *   5. 検証OKならci102_sessionクッキーを発行してリダイレクト
 *
 * 環境変数:
 *   PROFORMER_TOKEN_VERIFY_URL - Cloud Runのトークン検証APIのURL
 *     例: https://proformer-api-xxxxx-an.a.run.app/api/v1/verify-ci102-token
 *     未設定の場合は外部認証を無効化（共通パスワード認証のみ）
 *
 * リクエスト:
 *   GET /api/auth/external?token=xxx&redirect=/
 *
 * レスポンス:
 *   成功: Set-Cookie ci102_session + 302リダイレクト
 *   失敗: 401 JSON
 */

import { NextRequest, NextResponse } from "next/server";
import { issueSessionCookie } from "@/lib/auth";

const VERIFY_URL = process.env.PROFORMER_TOKEN_VERIFY_URL;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const redirect = request.nextUrl.searchParams.get("redirect") || "/";

  if (!token) {
    return NextResponse.json(
      { error: "token パラメータが必要です" },
      { status: 400 },
    );
  }

  // 外部認証が未設定の場合はフォールバック
  if (!VERIFY_URL) {
    // 開発環境: PROFORMER_TOKEN_VERIFY_URL未設定 → トークンを無視して/loginへ
    console.warn("[external-auth] PROFORMER_TOKEN_VERIFY_URL is not set. Falling back to /login.");
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", redirect);
    return NextResponse.redirect(loginUrl);
  }

  // Cloud Runのトークン検証APIに問い合わせ
  try {
    const verifyResponse = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(10000), // 10秒タイムアウト
    });

    if (!verifyResponse.ok) {
      const errorBody = await verifyResponse.text().catch(() => "");
      console.error(`[external-auth] Token verification failed: ${verifyResponse.status} ${errorBody}`);

      // 検証失敗 → /loginへリダイレクト（エラーメッセージ付き）
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", redirect);
      loginUrl.searchParams.set("error", "external_token_invalid");
      return NextResponse.redirect(loginUrl);
    }

    // 検証成功 → ci102_sessionクッキーを発行
    const { cookieString, sessionId } = await issueSessionCookie();
    console.log(`[external-auth] Token verified. Session ${sessionId} issued.`);

    // オープンリダイレクト防止: 相対パスのみ許可
    const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
    const redirectUrl = new URL(safeRedirect, request.url);
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set("Set-Cookie", cookieString);
    return response;

  } catch (err) {
    console.error("[external-auth] Token verification error:", err);

    // ネットワークエラー等 → /loginへフォールバック
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", redirect);
    loginUrl.searchParams.set("error", "external_auth_error");
    return NextResponse.redirect(loginUrl);
  }
}
