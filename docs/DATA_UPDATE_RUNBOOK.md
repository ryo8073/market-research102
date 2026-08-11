# データ更新ランブック

## 誰でも実行できるデータ更新手順

### 前提条件
- Python 3.13+
- `.env` に `ESTAT_APP_ID` と `MLIT_API_KEY` が設定済み
- Node.js 20+（ci102-nextjs のビルド用）

---

## 1. 不動産成約データ（四半期ごと）

**更新頻度**: 四半期（1月/4月/7月/10月に新データ公表）

```bash
cd C:\dev3\CI102_MarketAnalysis
python scripts/update_mlit_data.py
```

→ `data/cache/mlit_XX_all_YYYY_qQ.csv` が生成される

**prefectures.json の価格更新**:
```bash
python -c "
import json, csv, os
# ... (scripts/update_mlit_data.py 実行後に自動で更新される)
"
```

---

## 2. 国勢調査（5年ごと — 次回2030年）

### 2a. 人口速報集計（公表時）

```bash
python scripts/download_population_2025.py
python scripts/download_population_timeseries.py
python scripts/enrich_json_timeseries.py
python scripts/enrich_json_population_2025.py
```

### 2b. 確報（年齢別・世帯構成 — 2027年頃公表見込み）

1. `data/data_versions.py` の `POPULATION_CENSUS_CURRENT` を更新
2. テーブルIDを新しい確報のIDに変更
3. ダウンロードスクリプトを再実行

### 2c. 住宅所有関係（借家比率）

```bash
python scripts/download_housing_tenure.py
# → JSONのenrich は download_housing_tenure.py 内で実施済み
```

---

## 3. 経済センサス（5年ごと — 次回2026年実施→2028年頃公表）

**これが最も大きな更新**

1. `data/data_versions.py` を更新:
   - `ECONOMIC_CENSUS_CURRENT` → 新テーブルID
   - 旧版を `ECONOMIC_CENSUS_PREVIOUS` に移動

2. キャッシュCSV再取得:
```bash
python scripts/download_census.py        # 大分類
python scripts/rebuild_mid_class_cache.py # 中分類
```

3. JSON再生成（30-60分）:
```bash
python scripts/precompute_json.py
```

4. 中分類マトリクス再生成:
```bash
python scripts/generate_muni_industry_matrix.py      # 大分類
python scripts/generate_muni_industry_matrix_mid.py   # 中分類
```

5. 通勤OD行列更新（次回国勢調査時のみ）:
```bash
python scripts/download_commute_od.py  # 全47県（10分程度）
python scripts/build_commute_zones.py  # UEA再構築
python scripts/build_louvain_zones.py  # Louvain再計算
```

6. テスト:
```bash
python -m pytest tests/ -q
cd ci102-nextjs && npx tsc --noEmit && npm run build
```

7. デプロイ:
```bash
git add -A && git commit -m "data: 経済センサス20XX更新" && git push
```

---

## 4. data_versions.py の変更ルール

`data/data_versions.py` はデータの一元管理レジストリ。

**変更手順**:
1. 新テーブルIDをe-Statで確認
2. `CURRENT` を `PREVIOUS` にコピー
3. `CURRENT` のフィールドを新データに更新
4. `census_data_vintage_label()` が正しいラベルを返すことを確認
5. フロントエンドの `ci102-nextjs/src/lib/data-versions.ts` も同期更新

---

## 5. 障害時のフォールバック

### e-Stat APIがダウンした場合
- キャッシュCSV（`data/cache/`）が存在する限り動作する
- 新規データ取得のみ影響。既存の分析は正常

### MLIT APIがダウンした場合
- 不動産取引タブのリアルタイム取得が停止
- prefectures.json の中央値は静的データのため影響なし

### Vercelがダウンした場合
- 全面停止。代替策なし
- Vercel Status: https://vercel-status.com/

---

## 6. ヘルスチェック

```bash
curl https://ci102-market-analysis.vercel.app/api/health
```

返り値:
- `status: "ok"` — 全チェック正常
- `status: "warn"` — 一部データに注意
- `status: "fail"` — 即座に対応が必要

日次でcronから叩いて異常検知:
```bash
# 例: Vercel Cron or GitHub Actions
curl -sf https://ci102-market-analysis.vercel.app/api/health | jq -e '.status == "ok"'
```
