"use client";

/**
 * ログインページ — CCIM受講生向けの共有パスワード入力画面。
 *
 * フロー:
 *   1. ?redirect=/path クエリで元の遷移先を保持
 *   2. パスワード入力 → /api/auth/login へ POST
 *   3. 成功時: redirect 先 (or /) へ遷移
 *   4. 失敗時: エラー表示
 */
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || "ログインに失敗しました");
        setLoading(false);
        return;
      }
      // 成功 — リダイレクト
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg bg-white shadow-md p-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold">CI102 市場分析ツール</h1>
            <p className="text-xs text-slate-500 mt-1">
              CCIM CI102 (不動産投資のための市場分析) 教育目的のツールです。
              受講生に配布されたパスワードを入力してください。
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                disabled={loading}
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="共有パスワードを入力"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded bg-rose-50 border border-rose-200 text-rose-900 text-xs p-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || password.length === 0}
              className="w-full rounded bg-slate-900 text-white py-2 text-sm hover:bg-slate-800 disabled:bg-slate-400 transition-colors"
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          <div className="text-[11px] text-slate-500 pt-3 border-t">
            <p className="mb-1">
              <strong>免責</strong>: 本ツールは CCIM CI102 のメソドロジーを参考にした教育目的の分析ツールです。
              投資助言ではなく、投資判断はお客様の責任で行ってください。
            </p>
            <p>
              データ: e-Stat / MLIT / NLNI / 社人研。詳細は <a href="/learn" className="underline">分析手法</a> 参照。
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-3">
          © CI102 Market Analysis — Educational use only
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">読み込み中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
