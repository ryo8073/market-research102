/**
 * 共有パスワード認証ヘルパー (Edge Runtime 対応)。
 *
 * 教育目的での運用: CCIM 受講生に1つの共有パスワードを配布し、
 * AI API キー濫用を防ぐ。Web Crypto API で HMAC-SHA256 署名Cookie を発行。
 *
 * 環境変数:
 *   APP_PASSWORD - 共有パスワード (Vercel ダッシュボードで設定)
 *   AUTH_SECRET  - HMAC 署名鍵 (32文字以上のランダム文字列)
 *
 * クッキー仕様:
 *   名前: ci102_session
 *   形式: <payload_base64>.<signature_base64>
 *   payload: { iat: 発行時刻ms, exp: 失効時刻ms, sid: セッションID }
 *   有効期限: 7日間
 *   属性: HttpOnly, Secure, SameSite=Lax
 */

const COOKIE_NAME = "ci102_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;  // 7日
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

interface SessionPayload {
  iat: number;  // issued-at (ms)
  exp: number;  // expires-at (ms)
  sid: string;  // session ID (ログ識別用)
}

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET 環境変数が未設定または短すぎます (16文字以上推奨)");
  }
  return s;
}

function getPassword(): string | null {
  // 未設定の場合は認証無効 (開発時の利便性)
  return process.env.APP_PASSWORD || null;
}

/**
 * 認証機能が有効かどうか。APP_PASSWORD 未設定なら無効 (ローカル開発用)。
 */
export function isAuthEnabled(): boolean {
  return getPassword() !== null;
}

/**
 * パスワードを定数時間比較で検証 (タイミング攻撃対策)。
 */
export function verifyPassword(input: string): boolean {
  const expected = getPassword();
  if (!expected) return true;  // 認証無効時は常にOK
  if (input.length !== expected.length) {
    // 長さが違うのは確実に NG だが、短絡せず比較は続ける (タイミング差を作らない)
  }
  // 定数時間比較
  let diff = input.length ^ expected.length;
  const maxLen = Math.max(input.length, expected.length);
  for (let i = 0; i < maxLen; i++) {
    diff |= (input.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ============================================================================
// HMAC 署名 (Web Crypto API、Edge Runtime 対応)
// ============================================================================

let _cachedKey: CryptoKey | null = null;

async function getSignKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  _cachedKey = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return _cachedKey;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // ArrayBuffer (not SharedArrayBuffer) を明示的に確保して BufferSource 互換にする
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function sign(payload: string): Promise<string> {
  const key = await getSignKey();
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

async function verify(payload: string, signature: string): Promise<boolean> {
  try {
    const key = await getSignKey();
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      ENCODER.encode(payload),
    );
  } catch {
    return false;
  }
}

// ============================================================================
// セッション Cookie 発行・検証
// ============================================================================

/**
 * 新しいセッションを発行し Cookie 文字列を返す。
 * Set-Cookie ヘッダーにそのまま入れられる形式。
 */
export async function issueSessionCookie(): Promise<{
  value: string;
  cookieString: string;
  sessionId: string;
}> {
  const now = Date.now();
  const sessionId = generateSessionId();
  const payload: SessionPayload = {
    iat: now,
    exp: now + SESSION_DURATION_MS,
    sid: sessionId,
  };
  const payloadEncoded = base64UrlEncode(ENCODER.encode(JSON.stringify(payload)));
  const signature = await sign(payloadEncoded);
  const value = `${payloadEncoded}.${signature}`;
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
  const cookieString = `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  return { value, cookieString, sessionId };
}

/**
 * Cookie を無効化する Set-Cookie 文字列を返す (ログアウト用)。
 */
export function clearSessionCookieString(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * リクエストの Cookie からセッションを検証する。
 * 有効なら payload を返し、無効なら null。
 */
export async function verifySessionCookie(cookieHeader: string | null): Promise<SessionPayload | null> {
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const value = cookies[COOKIE_NAME];
  if (!value) return null;

  const dotIdx = value.indexOf(".");
  if (dotIdx === -1) return null;
  const payloadEncoded = value.substring(0, dotIdx);
  const signature = value.substring(dotIdx + 1);

  const valid = await verify(payloadEncoded, signature);
  if (!valid) return null;

  try {
    const payloadJson = DECODER.decode(base64UrlDecode(payloadEncoded));
    const payload = JSON.parse(payloadJson) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.substring(0, idx).trim();
    const v = part.substring(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;
