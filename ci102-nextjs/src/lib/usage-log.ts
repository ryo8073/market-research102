/**
 * 利用ログ — Upstash Redis (Vercel KV) REST API 直叩き。
 *
 * 教育目的の運用で AI API キー濫用や受講生別の利用統計を把握する。
 * @vercel/kv パッケージを使わず fetch で直接呼ぶことで、Edge Runtime と
 * Node Runtime の両方で動作する。
 *
 * 環境変数 (Vercel KV 統合時に自動セット):
 *   KV_REST_API_URL    - 例: https://xxxx.upstash.io
 *   KV_REST_API_TOKEN  - 書込権限付きトークン
 *
 * データ構造 (Redis):
 *   logs:events     — LIST (最新10000件、それ以上は LTRIM)
 *   logs:counters   — HASH (キー: action 名、値: 累計呼出数)
 *   logs:sessions   — HASH (キー: session_id、値: 最終アクセス時刻)
 */

const KV_URL = process.env.KV_REST_API_URL || "";
const KV_TOKEN = process.env.KV_REST_API_TOKEN || "";
const KV_READONLY_TOKEN = process.env.KV_REST_API_READ_ONLY_TOKEN || KV_TOKEN;
const MAX_LOG_ENTRIES = 10000;

export interface LogEvent {
  ts: number;          // ms epoch
  action: string;      // "ai_decision" / "tab_view" / "trade_area" / "error" 等
  sid?: string;        // session_id (auth.ts で発行)
  ip?: string;         // hashed IP (privacy)
  ms?: number;         // 処理時間
  status?: number;     // HTTP status
  meta?: Record<string, string | number | boolean>;
}

/** ログ機能が有効か (KV 環境変数が設定されていれば true) */
export function isLogEnabled(): boolean {
  return KV_URL.length > 0 && KV_TOKEN.length > 0;
}

/**
 * IP アドレスをハッシュ化して匿名化 (個情法対策)。
 * SHA-256 の先頭8文字のみ保存 = 個人特定不可能だが、
 * 同一IP からの連続アクセスは識別可能。
 */
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + (process.env.AUTH_SECRET || ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Upstash Redis REST API の単一コマンド実行。
 * 失敗してもアプリ動作を止めないよう、エラーは握りつぶす。
 */
async function kvExec(command: (string | number)[]): Promise<unknown | null> {
  if (!isLogEnabled()) return null;
  try {
    const r = await fetch(KV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(3000),  // ログ書込で3秒以上待たない
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data as { result: unknown }).result;
  } catch {
    return null;
  }
}

async function kvExecReadonly(command: (string | number)[]): Promise<unknown | null> {
  if (!isLogEnabled()) return null;
  try {
    const r = await fetch(KV_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KV_READONLY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data as { result: unknown }).result;
  } catch {
    return null;
  }
}

/**
 * イベントをログに追加する。
 * 失敗してもアプリの動作には影響しない (fire-and-forget)。
 */
export async function logEvent(event: Omit<LogEvent, "ts">, rawIp?: string): Promise<void> {
  if (!isLogEnabled()) return;
  const full: LogEvent = {
    ...event,
    ts: Date.now(),
  };
  if (rawIp) {
    full.ip = await hashIp(rawIp);
  }
  // 1. LIST に追加
  await kvExec(["LPUSH", "logs:events", JSON.stringify(full)]);
  // 2. 古いログを切る (LTRIM)
  await kvExec(["LTRIM", "logs:events", 0, MAX_LOG_ENTRIES - 1]);
  // 3. action 別カウンタを増やす
  await kvExec(["HINCRBY", "logs:counters", full.action, 1]);
  // 4. セッション最終アクセス
  if (full.sid) {
    await kvExec(["HSET", "logs:sessions", full.sid, String(full.ts)]);
  }
}

/**
 * 最新N件のログを取得 (admin画面用)。
 */
export async function fetchRecentLogs(limit: number = 200): Promise<LogEvent[]> {
  const raw = await kvExecReadonly(["LRANGE", "logs:events", 0, limit - 1]);
  if (!Array.isArray(raw)) return [];
  const out: LogEvent[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      try {
        out.push(JSON.parse(item) as LogEvent);
      } catch {
        // skip malformed
      }
    }
  }
  return out;
}

/**
 * Action 別の累計カウンタを取得。
 */
export async function fetchActionCounters(): Promise<Record<string, number>> {
  const raw = await kvExecReadonly(["HGETALL", "logs:counters"]);
  if (!raw || typeof raw !== "object") return {};
  // Upstash は HGETALL を [k1, v1, k2, v2, ...] または {k1: v1, ...} で返す
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length - 1; i += 2) {
      out[String(raw[i])] = Number(raw[i + 1]) || 0;
    }
  } else {
    for (const [k, v] of Object.entries(raw)) {
      out[k] = Number(v) || 0;
    }
  }
  return out;
}

/**
 * セッション一覧 (sid, last_access_ts) を取得。
 */
export async function fetchSessions(): Promise<Array<{ sid: string; lastTs: number }>> {
  const raw = await kvExecReadonly(["HGETALL", "logs:sessions"]);
  if (!raw) return [];
  const result: Array<{ sid: string; lastTs: number }> = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length - 1; i += 2) {
      result.push({ sid: String(raw[i]), lastTs: Number(raw[i + 1]) || 0 });
    }
  } else if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      result.push({ sid: String(k), lastTs: Number(v) || 0 });
    }
  }
  result.sort((a, b) => b.lastTs - a.lastTs);
  return result;
}
