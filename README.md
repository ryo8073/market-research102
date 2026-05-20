# CI102 Market Analysis — 日本版

CCIM CI102（市場分析）の数理モデルを日本の公的オープンデータで再現する不動産投資判断ツール。

## 概要

- **LQ**（特化係数）、**EBM**（経済基盤乗数）、**PER**（人口雇用比率）、**シフトシェア分析**、**小売ギャップ分析**を実装
- Streamlit ベースの対話的ダッシュボード（Phase 1 MVP）
- RESAS API / e-Stat API / 不動産情報ライブラリ API への接続インターフェース完備
- PoC 対象都市: **香川県高松市**（サンプルデータで即時動作）

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `app.py` | Streamlit ダッシュボード本体 |
| `calculator.py` | CI102 数理モデル（純粋関数） |
| `data_sources.py` | RESAS / e-Stat / MLIT API クライアント + フォールバック |
| `sample_data.py` | 高松市 PoC 用近似データ |
| `tests/test_calculator.py` | 23ケースの回帰テスト |

## セットアップ

```powershell
pip install -r requirements.txt

# APIキー設定（任意・未設定でもサンプルデータで動作）
cp .env.example .env
# .env を編集して RESAS_API_KEY / ESTAT_APP_ID / MLIT_API_KEY を設定
```

## 起動

```powershell
streamlit run app.py
```

ブラウザで `http://localhost:8501` を開く。

## テスト実行

```powershell
python -m pytest tests/ -v
```

ロードマップ記載の既知例（Gwinnett County EBM≈4.97、Apparel surplus -24.0 等）で検証済み。

## 数理モデル

### LQ（特化係数）
```
LQ = (e_i / e) / (E_i / E)
```
LQ > 1.0 の超過分から基盤雇用を算出: `basic = e_i × (1 - 1/LQ)`

### EBM（経済基盤乗数）
```
EBM = 総雇用 / 基盤雇用
```

### PER（人口雇用比率）
```
PER = 総人口 / 総雇用
```

### シフトシェア分析
雇用変動を3要因に分解:
- **NS**（国家成長）= e_i,t0 × g_national
- **IM**（産業ミックス）= e_i,t0 × (g_industry - g_national)
- **RS**（地域シフト）= e_i,t0 × (g_local - g_industry)

恒等式: `NS + IM + RS = 実雇用変化`

### ギャップ分析（Leakage/Surplus Factor）
```
Factor = (Demand - Supply) / (Demand + Supply) × 100
```
- `+100`: 完全漏出（出店余地大）
- `0`: 均衡
- `-100`: 完全余剰（飽和市場）

## ロードマップ進捗

- ✅ **Phase 1（Month 1-4）**: コア数理エンジン + データソース層 + MVP UI
- ⏳ **Phase 2（Month 5-8）**: 地図UI（MapLibre GL）、商圏ポリゴン、空間ジョイン
- ⏳ **Phase 3（Month 9-12）**: 不動産価格連携、予測AI、PDFレポート出力

## 次のステップ

1. RESAS API キーを取得して `data_sources.ResasClient.industry_specialization` 経由で実データ取得を有効化
2. e-Stat 経済センサスの最新年データで `lq_table` を最新化（ナウキャスト補完）
3. 不動産情報ライブラリ API の取引価格データを EBM/RS 時系列にオーバーレイ
4. MapLibre GL JS でフロントエンドを置き換え、任意ポリゴン商圏分析を実装

## 出典

- CCIM Institute CI102: Market Analysis for Commercial Investment Real Estate
- 地域経済分析システム（RESAS）API: https://opendata.resas-portal.go.jp/
- e-Stat API: https://www.e-stat.go.jp/api/
- 不動産情報ライブラリ API: https://www.reinfolib.mlit.go.jp/
