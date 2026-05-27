# Phase 6: 認証 + 利用ログ セットアップガイド

教育目的での運用 — CCIM 受講生に限定アクセスを提供し、AI API キーの濫用を防止。

---

## 概要

| 機能 | 内容 |
|---|---|
| **認証** | 共有パスワード方式 (Cookie + HMAC-SHA256 署名) |
| **ログ** | Vercel KV (Upstash Redis) で利用イベント記録 |
| **管理画面** | `/admin?token=<ADMIN_TOKEN>` で閲覧 |
| **匿名化** | IP は SHA-256 ハッシュ (先頭8文字) のみ保存 |

---

## 1. 環境変数設定 (Vercel Dashboard)

`Settings → Environment Variables` で以下を設定:

### 必須

| 変数名 | 用途 | 設定例 |
|---|---|---|
| `APP_PASSWORD` | 受講生に配布する共有パスワード | `ccim2026spring` |
| `AUTH_SECRET` | Cookie 署名鍵 (32文字以上のランダム) | 下記コマンドで生成 |

```powershell
# AUTH_SECRET 生成 (PowerShell)
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

```bash
# AUTH_SECRET 生成 (bash)
openssl rand -base64 32
```

### 任意 (利用ログ機能を有効化する場合)

| 変数名 | 用途 |
|---|---|
| `KV_REST_API_URL` | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Upstash Redis 書込トークン |
| `KV_REST_API_READ_ONLY_TOKEN` | Upstash Redis 読取専用トークン (admin画面用、省略可) |
| `ADMIN_TOKEN` | `/admin` 画面のアクセストークン (16文字以上推奨) |

---

## 2. Vercel KV 統合手順

### Vercel Dashboard で:

1. プロジェクトを開く
2. **Storage** タブ → **Create Database**
3. **必ず「Upstash for Redis」を選択** ⚠️
   - Upstash には4種類あるが、本ツールで使うのは **Redis のみ**
   - ❌ Upstash Vector (AI埋め込み用、用途違い)
   - ❌ Upstash QStash / Workflow (メッセージキュー、用途違い)
   - ❌ Upstash Search (全文検索、用途違い)
   - ✅ **Upstash for Redis** ← これ
4. リージョン: `hnd1` (東京 / Tokyo) を選択 — レイテンシ最小化のため
5. プロジェクトに接続 (Connect to Project)
6. 環境変数 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 等が自動注入される

### 課金プラン

| プラン | 容量 | 料金 |
|---|---|---|
| Hobby | 256 MB / 500 req/day | 無料 |
| Pro | 1 GB / 100k req/day | $0.20/100k req |

教育目的 (受講生10-100人) なら Hobby 無料枠で十分。

---

## 3. ADMIN_TOKEN 生成

```powershell
# 16文字のランダム英数字
-join ((1..16) | %{ [char[]](48..57+65..90+97..122) | Get-Random })
```

```bash
# bash
openssl rand -hex 16
```

このトークンは **配布しない** こと。あなた (講師) のみが知る秘匿情報。

---

## 4. ログイン体験フロー

```
1. 受講生が https://ci102-market-analysis.vercel.app を訪問
        ↓
2. /login にリダイレクト (Cookie がないため)
        ↓
3. 配布された APP_PASSWORD を入力
        ↓
4. /api/auth/login が検証 → Cookie 発行
        ↓
5. 元のページ (or /) にリダイレクト
        ↓
6. 7日間 Cookie 有効。期限切れで再ログイン
```

### ログアウト
フッターの「ログアウト」ボタン → `/api/auth/logout` → Cookie 削除 → /login

---

## 5. ログ閲覧

ブラウザで `https://ci102-market-analysis.vercel.app/admin?token=<ADMIN_TOKEN>` を訪問。

表示内容:
- **アクション別カウンタ**: ai_decision / osrm_table 等の累計呼出数
- **アクティブセッション**: 最近アクセスのあったセッションID + 最終時刻
- **最近のイベント** (最大500件): 時刻・action・SID・status・処理時間・メタデータ

### ログに記録される情報

| フィールド | 内容 | 例 |
|---|---|---|
| `ts` | タイムスタンプ (ms) | 1717000000000 |
| `action` | 操作種別 | `ai_decision`, `osrm_table` |
| `sid` | セッションID (匿名) | `a1b2c3d4e5f6...` |
| `ip` | IP の SHA-256 ハッシュ (8文字) | `3f7a1b2c` |
| `status` | HTTP ステータス | 200, 401, 502 |
| `ms` | 処理時間 (ms) | 1234 |
| `meta` | アクション固有情報 | `{target: "東京都", chars: 850}` |

**個人特定可能な情報は記録しない**: 生IP・住所入力・氏名等は保存されない。

---

## 6. 認証無効化 (ローカル開発時)

`APP_PASSWORD` を未設定にすると認証が無効化される。
ローカル開発時は `.env.local` で `APP_PASSWORD=` (空) にすれば全アクセス可。

```env
# .env.local (ローカル開発用)
APP_PASSWORD=
AUTH_SECRET=local-dev-secret-min-16-chars-padding
```

---

## 7. セキュリティ考慮事項

| 項目 | 対策 |
|---|---|
| パスワードリスト攻撃 | proxy.ts の rate-limiter で 60req/min/IP に制限 |
| タイミング攻撃 | `verifyPassword()` は定数時間比較、失敗時に300-500ms遅延 |
| Cookie 改ざん | HMAC-SHA256 署名で検証 |
| Cookie 窃取 | HttpOnly + Secure + SameSite=Lax |
| IP プライバシー | SHA-256 ハッシュの先頭4バイトのみ保存 |
| ADMIN_TOKEN 漏洩 | クエリパラメータで送信 → URL ログに残るリスクあり。本番では Header 送信に変更を検討 |

---

## 8. 運用シナリオ

### 受講開始時 (講師の作業)
1. Vercel に `APP_PASSWORD` 設定 (例: `ccim2026spring`)
2. 受講生にメール送信:
   > 「CI102 市場分析ツール: https://... にアクセスし、パスワード `ccim2026spring` でログインしてください。期間: 2026/4/1 - 2026/6/30」

### 受講期間終了時
1. Vercel で `APP_PASSWORD` を変更 (旧パスワードを無効化)
2. または環境変数を削除して全アクセス停止

### AI API キー濫用が疑われる時
1. `/admin?token=...` で `ai_decision` カウンタを確認
2. 異常に多いセッションIDを特定
3. 必要なら `APP_PASSWORD` を変更して既存セッションを失効

---

## 9. トラブルシューティング

### Q: ログインしたのに `/login` にリダイレクトされ続ける
- **原因**: `AUTH_SECRET` が変更された (Cookie の署名検証失敗)
- **対処**: ブラウザの Cookie を削除して再ログイン

### Q: `/admin` が `Forbidden` を返す
- **原因**: `ADMIN_TOKEN` 環境変数未設定 or トークン不一致
- **対処**: Vercel Dashboard で `ADMIN_TOKEN` を設定/確認

### Q: ログが表示されない
- **原因**: Vercel KV 未統合 or `KV_REST_API_*` 環境変数なし
- **対処**: 上記「2. Vercel KV 統合手順」を実施

### Q: 「認証設定エラー: AUTH_SECRET が未設定...」
- **原因**: `AUTH_SECRET` が16文字未満
- **対処**: 32文字以上のランダム文字列を設定

---

## 10. 監視すべき指標

| 指標 | 閾値 | 対応 |
|---|---|---|
| `ai_decision` 1日累計 | 500回超 | 受講生数で割って異常か判定 |
| 同一セッションの `ai_decision` 1時間累計 | 30回超 | 自動スクリプト疑い、セッション失効検討 |
| `status=401` 連続発生 | 10件/分超 | パスワード総当たり攻撃疑い、APP_PASSWORD 変更 |
| `osrm_table` 1日累計 | 1000回超 | OSRM 公開サーバへの過剰負荷 |

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `ci102-nextjs/src/lib/auth.ts` | 認証ヘルパー (HMAC-SHA256) |
| `ci102-nextjs/src/lib/usage-log.ts` | ログヘルパー (Upstash Redis REST) |
| `ci102-nextjs/src/proxy.ts` | Next.js 16 Proxy (認証チェック + レート制限) |
| `ci102-nextjs/src/app/login/page.tsx` | ログイン画面 |
| `ci102-nextjs/src/app/admin/page.tsx` | 管理画面 |
| `ci102-nextjs/src/app/api/auth/login/route.ts` | ログインAPI |
| `ci102-nextjs/src/app/api/auth/logout/route.ts` | ログアウトAPI |
| `ci102-nextjs/src/app/api/admin/logs/route.ts` | ログ取得API |
