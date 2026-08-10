"use client";

/**
 * 管理者ページ — 利用ログ閲覧。
 *
 * 認証 (proxy.ts による APP_PASSWORD) 通過後、ADMIN_TOKEN をURLパラメータ
 * または入力欄に入れて初めて閲覧可能。
 *
 * URL: /admin?token=<ADMIN_TOKEN>
 */
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface LogEvent {
  ts: number;
  action: string;
  sid?: string;
  ip?: string;
  ms?: number;
  status?: number;
  meta?: Record<string, string | number | boolean>;
}

interface LogResponse {
  enabled: boolean;
  message?: string;
  events?: LogEvent[];
  counters?: Record<string, number>;
  sessions?: Array<{ sid: string; lastTs: number }>;
  fetched_at?: string;
}

function AdminInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [data, setData] = useState<LogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (t: string) => {
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/logs?token=${encodeURIComponent(t)}&limit=500`);
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || `HTTP ${r.status}`);
        setData(null);
      } else {
        setData(j);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) fetchLogs(token);
  }, [token, fetchLogs]);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h1 className="text-xl font-bold mb-2">📊 利用ログ管理</h1>
          <p className="text-xs text-slate-500">
            CCIM CI102 教育目的ツールの利用ログを閲覧します。ADMIN_TOKEN を URL クエリ ?token= で指定するか、下のフィールドに入力してください。
          </p>
          <div className="flex gap-2 mt-3">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ADMIN_TOKEN"
              className="flex-1 rounded border px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => fetchLogs(token)}
              disabled={loading || !token}
              className="px-4 py-1.5 rounded bg-slate-900 text-white text-sm disabled:bg-slate-400"
            >
              {loading ? "読込中..." : "再読込"}
            </button>
          </div>
          {error && (
            <div className="mt-2 rounded bg-rose-50 border border-rose-200 text-rose-900 text-xs p-2">
              {error}
            </div>
          )}
          {data?.message && (
            <div className="mt-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs p-2">
              {data.message}
            </div>
          )}
        </div>

        {/* カウンタ */}
        {data?.counters && Object.keys(data.counters).length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold mb-2">アクション別カウンタ</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(data.counters)
                .sort((a, b) => b[1] - a[1])
                .map(([action, count]) => (
                  <div key={action} className="rounded border p-2">
                    <div className="text-[11px] text-slate-500">{action}</div>
                    <div className="text-xl font-bold">{count.toLocaleString()}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* セッション */}
        {data?.sessions && data.sessions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold mb-2">
              アクティブセッション ({data.sessions.length})
            </h2>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left p-1">セッション ID</th>
                    <th className="text-right p-1">最終アクセス</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.slice(0, 50).map((s) => (
                    <tr key={s.sid} className="border-b">
                      <td className="p-1 font-mono">{s.sid}</td>
                      <td className="text-right p-1 text-slate-500">
                        {new Date(s.lastTs).toLocaleString("ja-JP")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* イベント */}
        {data?.events && data.events.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold mb-2">
              最近のイベント ({data.events.length})
            </h2>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left p-1">時刻</th>
                    <th className="text-left p-1">Action</th>
                    <th className="text-left p-1">SID</th>
                    <th className="text-right p-1">Status</th>
                    <th className="text-right p-1">ms</th>
                    <th className="text-left p-1">Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e, i) => (
                    <tr
                      key={i}
                      className={`border-b ${e.status && e.status >= 400 ? "bg-rose-50" : ""}`}
                    >
                      <td className="p-1 whitespace-nowrap text-slate-500">
                        {new Date(e.ts).toLocaleString("ja-JP", { hour12: false })}
                      </td>
                      <td className="p-1 font-medium">{e.action}</td>
                      <td className="p-1 font-mono text-[11px]">{e.sid?.substring(0, 8) ?? "-"}</td>
                      <td className="text-right p-1">{e.status ?? "-"}</td>
                      <td className="text-right p-1">{e.ms ?? "-"}</td>
                      <td className="p-1 text-[11px] text-slate-600 max-w-md truncate">
                        {e.meta ? JSON.stringify(e.meta) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.fetched_at && (
              <p className="text-[11px] text-slate-400 mt-2">
                取得時刻: {new Date(data.fetched_at).toLocaleString("ja-JP")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-4 text-slate-500">読み込み中...</div>}>
      <AdminInner />
    </Suspense>
  );
}
