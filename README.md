# CI102 不動産市場分析ダッシュボード

CCIM CI102（Market Analysis for Commercial Investment Real Estate）の数理モデルを日本の公的オープンデータで再現する不動産投資判断ツール。

## 2つのバージョン

| | Streamlit (Python) | Next.js (TypeScript) |
|---|---|---|
| 用途 | 検証・開発環境 | **本番Web公開用** |
| 起動 | `streamlit run app.py` | `cd ci102-nextjs && npm run dev` |
| テスト | 61テスト | 69テスト |
| 地図 | Plotly choropleth | **MapLibre GL JS** |
| デプロイ | ローカル | **Vercel** |

## 機能一覧（8タブ）

| タブ | 分析内容 |
|---|---|
| **⓪ 投資スコアカード** | 全指標1画面集約 + 投資適格スコア(0-100) + テナント戦略 + AI分析(Claude) + Proformer連携 |
| **① 経済基盤** | LQ(特化係数) + シフトシェア統合 + 投資シグナル4象限 |
| **② 需要予測** | EBM/PER + ウォーターフォール + 物件規模換算 + 開発フィジビリティ |
| **③ シフトシェア分析** | NS/IM/RS 3要因分解 + スター産業判定 |
| **④ 小売市場** | ギャップ分析(漏損/余剰) + オフィス/工業ギャップ |
| **⑤ 不動産取引** | MLIT取引価格 + 時系列トレンド(8四半期) + Mueller市場サイクル |
| **⑥ 地図分析** | 都道府県コロプレス + 市区町村境界 + セグメンテーション(6タイプ) |
| **⑦ クロス分析** | ギャップ × 取引価格 4象限散布図 |

## データソース

| データ | ソース | 時点 |
|---|---|---|
| 産業別従業者数 | e-Stat 経済センサス活動調査 | 2021年6月 |
| 人口・世帯 | e-Stat 国勢調査 | 2020年10月 |
| 不動産取引価格 | 国土交通省 不動産情報ライブラリ API | 四半期更新 |
| 物件DCF分析 | Proformer不動産投資診断プロ API | リアルタイム |
| AI分析 | Anthropic Claude API | リアルタイム |

## セットアップ

### Streamlit版（検証用）

```bash
pip install -r requirements.txt
cp .env.example .env
# .env を編集してAPIキーを設定
streamlit run app.py
```

### Next.js版（本番用）

```bash
cd ci102-nextjs
npm install
cp ../.env .env.local
npm run dev     # 開発サーバー http://localhost:3000
npm run build   # 本番ビルド
```

### 環境変数 (.env)

```
# 必須
ESTAT_APP_ID=           # e-Stat API (https://www.e-stat.go.jp/api/)
MLIT_API_KEY=           # MLIT不動産情報ライブラリ (https://www.reinfolib.mlit.go.jp/help/apiManual/)

# 任意
ANTHROPIC_API_KEY=      # Claude AI分析 (https://console.anthropic.com/)
PROFORMER_API_KEY=      # Proformer DCF連携 (https://proformer.ai/)
```

## テスト

```bash
# Python (Streamlit版)
python -m pytest tests/ -v          # 61テスト

# TypeScript (Next.js版)
cd ci102-nextjs && npx vitest run   # 69テスト
```

教科書値で検証済み: Orlando MSA / Denver MSA / Baton Rouge / Gwinnett County

## デプロイ (Vercel)

```bash
cd ci102-nextjs
npx vercel          # プレビューデプロイ
npx vercel --prod   # 本番デプロイ
```

Vercel管理画面で環境変数 (ESTAT_APP_ID, MLIT_API_KEY, ANTHROPIC_API_KEY, PROFORMER_API_KEY) を設定。

## ディレクトリ構成

```
CI102_MarketAnalysis/
├── app.py                    # Streamlit本体（8タブ）
├── calculator.py             # CI102数理エンジン（18関数）
├── scorecard.py              # 投資スコアカード集約
├── ai_analysis.py            # Claude AI統合分析
├── cross_analysis.py         # ギャップ×価格クロス分析
├── mueller_cycle.py          # Mueller不動産市場サイクル
├── segmentation.py           # Tapestry風セグメンテーション
├── report_generator.py       # PDFレポート生成
├── config.py                 # 環境変数管理
├── data_sources.py           # API統合 + 3段フォールバック
├── map_data.py               # 都道府県集計
├── map_charts.py             # Plotlyチャート
├── api/
│   ├── estat.py              # e-Stat APIクライアント
│   ├── mlit.py               # MLIT APIクライアント
│   └── proformer.py          # Proformer APIクライアント
├── data/
│   ├── cache/                # CSVキャッシュ（自動DL）
│   ├── geo/                  # 市区町村TopoJSON（47県）
│   └── japan_prefectures.geojson
├── tests/                    # Python 61テスト
├── ci102-nextjs/             # Next.js版（本番用）
│   ├── src/lib/calculator.ts # 18関数移植（69テスト）
│   ├── src/app/api/          # API Routes (e-Stat/MLIT/Proformer)
│   ├── src/components/       # shadcn/ui + MapLibre GL JS
│   └── public/geo/           # GeoJSON/TopoJSON
├── docs/                     # 仕様書・移行ガイド
└── _archive/                 # 廃止ファイル（RESAS API等）
```

## 数理モデル

| モデル | 数式 | 用途 |
|---|---|---|
| LQ | `(e_i/e) / (E_i/E)` | 産業集積度の測定 |
| EBM | `総雇用 / 基盤雇用` | 雇用波及効果の測定 |
| PER | `総人口 / 総雇用` | 人口波及の測定 |
| シフトシェア | `NS + IM + RS = 実変化` | 競争力の3要因分解 |
| ギャップ | `(D-S)/(D+S) × 100` | 漏損/余剰の定量化 |
| 投資スコア | `EBM×20% + 基盤比率×20% + RS×25% + Gap×20% + Scale×15%` | 投資適格性の総合評価 |

## 出典

- CCIM Institute CI102: Market Analysis for Commercial Investment Real Estate
- e-Stat API: https://www.e-stat.go.jp/api/
- 不動産情報ライブラリ API: https://www.reinfolib.mlit.go.jp/
- Proformer不動産投資診断プロ: https://proformer.ai/
