# Cloudflare R2 セットアップガイド（NLNI高解像度TopoJSON）

## 概要

地図タブの高解像度データ（TopoJSON, 180MB）をCloudflare R2に配置し、
低解像度版（git内, 84MB）と組み合わせて2段階ロードを実現する。

## 1. Cloudflare R2 バケット作成

### 1a. Cloudflareダッシュボードで

1. https://dash.cloudflare.com/ にログイン
2. 左メニュー → **R2 Object Storage** → **Create bucket**
3. バケット名: `ci102-nlni`
4. リージョン: **APAC (Asia Pacific)** を選択（東京に近い）
5. **Create bucket** をクリック

### 1b. パブリックアクセスを有効化

R2バケットはデフォルトで非公開。パブリック読み取りを有効にする:

1. 作成したバケット `ci102-nlni` を開く
2. **Settings** タブ → **Public access**
3. **Custom Domain** を設定:
   - 例: `nlni.proformer.ai`（Cloudflareで管理しているドメインが必要）
   - または **R2.dev subdomain** を有効化（`ci102-nlni.{account-id}.r2.dev`）
4. **Allow Access** をクリック

### 1c. R2.dev サブドメイン（最も簡単）

カスタムドメインがなくても使える:
1. **Settings** → **Public access** → **R2.dev subdomain**
2. **Allow Access** を有効化
3. URLは: `https://pub-{hash}.r2.dev/` の形式

## 2. データのアップロード

### 2a. Cloudflare Wrangler CLIでアップロード（推奨）

```bash
# Wrangler インストール
npm install -g wrangler

# ログイン
wrangler login

# アップロード（全TopoJSONファイル）
cd C:\dev3\CI102_MarketAnalysis\ci102-nextjs\public\data\nlni_topo
for f in *.topojson; do
  wrangler r2 object put "ci102-nlni/$f" --file="$f" --content-type="application/json"
done
```

### 2b. スクリプトでアップロード

```bash
python scripts/upload_nlni_r2.py
```

### 2c. ダッシュボードから手動アップロード

1. R2バケットを開く → **Upload** ボタン
2. `ci102-nextjs/public/data/nlni_topo/` の全ファイルをドラッグ&ドロップ
3. 275ファイル、約180MB

## 3. Vercel環境変数の設定

アップロード後、Vercelに環境変数を追加:

1. Vercel Dashboard → `ci102-market-analysis` → **Settings** → **Environment Variables**
2. 追加:

   | 変数名 | 値の例 |
   |--------|--------|
   | `NEXT_PUBLIC_NLNI_R2_URL` | `https://pub-xxxx.r2.dev` または `https://nlni.proformer.ai` |

   - **NEXT_PUBLIC_** プレフィックスが必要（クライアントサイドで使用するため）
   - Environment: **Production** にチェック

3. **Save** → **Redeploy**

## 4. 動作確認

設定後、地図タブで:
1. レイヤーをON → 低解像度版（Vercel CDN）が即座に表示
2. 数秒後 → 高解像度版（R2）がバックグラウンドで取得・表示が更新
3. ブラウザのDevTools → Networkタブで `r2.dev` へのリクエストを確認

## 5. コスト

| 項目 | R2無料枠 | 超過時 |
|------|---------|--------|
| ストレージ | 10GB/月 | $0.015/GB/月 |
| 読み取り | 1000万リクエスト/月 | $0.36/100万リクエスト |
| 書き込み | 100万リクエスト/月 | $4.50/100万リクエスト |
| 帯域 | **無制限** | **無料** |

180MBのデータを月1000万回読み取っても無料枠内。帯域は完全無料（これがR2の最大メリット）。

## 6. CORS設定（必要な場合）

ブラウザからR2に直接fetchする場合、CORSが必要:

1. R2バケット → **Settings** → **CORS Policy**
2. 以下を追加:
```json
[
  {
    "AllowedOrigins": ["https://ci102-market-analysis.vercel.app"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

## 7. 設定前の状態（フォールバック）

`NEXT_PUBLIC_NLNI_R2_URL` が未設定の場合:
- フロントエンドは `/data/nlni_topo/` から取得を試みる（Vercelにはないので404）
- 404の場合は `/data/nlni/` のレガシーGeoJSON（これもgitから除去済みなので404）
- 最終的に低解像度版（nlni_lite/）のみで表示される
- **何も壊れない** — 低解像度版だけで地図は正常動作
