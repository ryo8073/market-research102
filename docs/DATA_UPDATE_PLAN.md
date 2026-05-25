# CI102 データ更新計画

## 全データソース一覧と更新スケジュール

### e-Stat / 公的統計（既存）

| データ | 調査時点 | 更新頻度 | 次回予定 | 更新コマンド |
|--------|---------|---------|---------|------------|
| 経済センサス活動調査（産業別従業者数） | 2021年6月 | 5年ごと | **2026年** | `/download-census` |
| 国勢調査（人口・世帯） | 2020年10月 | 5年ごと | 2025年実施→**結果公表2026〜2027年** | `/download-census` |
| 小売業年間商品販売額 | 2021年 | 5年ごと | **2026年** | `/download-census` |
| 事業所数 | 2021年 | 5年ごと | **2026年** | `/download-census` |

### MLIT 不動産情報ライブラリ（既存）

| データ | 調査時点 | 更新頻度 | 次回予定 | 更新方法 |
|--------|---------|---------|---------|---------|
| 不動産取引価格情報 | 2024Q3 | **四半期** | 毎1/4/7/10月 | API自動取得（リアルタイム） |

### 国土数値情報（新規追加分）

| # | データ | ID | 最新年度 | 更新頻度 | 次回予定 | 更新コマンド |
|---|--------|-----|---------|---------|---------|------------|
| 1 | メッシュ別将来推計人口 | mesh_pop | H30推計 | 5年ごと | **R7推計（2025年国勢調査ベース、2027-2028年公表見込み）** | `python scripts/download_nlni.py -d mesh_pop` |
| 2 | 鉄道 | N02 | R4(2022) | **毎年** | R5版（2024年公表） | `python scripts/download_nlni.py -d railways` |
| 3 | 駅別乗降客数 | S12 | R2(2020) | **毎年** | R3版以降 | `python scripts/download_nlni.py -d ridership` |
| 4 | 地価公示 | L01 | R6(2024) | **毎年（1月基準）** | R7版（2025年3月公表） | `python scripts/download_nlni.py -d land_prices` |
| 5 | 用途地域 | A29 | R1(2019) | **不定期** | 次回未定 | `python scripts/download_nlni.py -d zoning` |
| 6 | 洪水浸水想定区域 | A31 | H24(2012) | **不定期**（河川追加時） | 随時 | `python scripts/download_nlni.py -d flood` |
| 7 | バス停留所 | P11 | H22(2010) | **不定期** | 次回未定 | `python scripts/download_nlni.py -d bus_stops` |
| 8 | バス路線 | N07 | H23(2011) | **不定期** | 次回未定 | `python scripts/download_nlni.py -d bus_routes` |
| 9 | 医療施設 | P04 | R2(2020) | **2-3年** | R5版以降 | `python scripts/download_nlni.py -d medical` |
| 10 | 商業施設 | P09 | H26(2014) | **不定期** | 次回未定 | `python scripts/download_nlni.py -d commercial` |
| 11 | 人口集中地区(DID) | A16 | H27(2015) | 5年ごと | **2025年国勢調査ベース（2027年公表見込み）** | `python scripts/download_nlni.py -d did` |
| 12 | 立地適正化計画 | A35 | R4(2022) | **毎年**（策定自治体追加時） | R5版以降 | `python scripts/download_nlni.py -d location_opt` |
| 13 | 道路 | N01 | H19(2007) | **不定期** | 次回未定 | `python scripts/download_nlni.py -d roads` |

---

## 年次更新フロー

### 毎年（1月 or 4月）

1. **地価公示 (L01)**: 3月に前年1月基準の新データが公表
   ```bash
   python scripts/download_nlni.py -d land_prices
   # download_nlni.py の URL テンプレート内の年度を更新
   ```

2. **鉄道 (N02)**: 年度末更新
   ```bash
   python scripts/download_nlni.py -d railways
   ```

3. **立地適正化計画 (A35)**: 策定自治体が毎年増加
   ```bash
   python scripts/download_nlni.py -d location_opt
   ```

4. **JSON再生成**
   ```bash
   python scripts/precompute_json.py
   python scripts/generate_overlays.py
   ```

### 5年ごと（2026-2027年 — 大型更新年）

**2026年**: 2026年経済センサス実施 → 2027年結果公表
- 産業別従業者数の更新
- LQ/EBM/Shift-Share が全面更新
- `data/census_cache.py` の `table_id` を新テーブルに差し替え

**2025年国勢調査 → 2026-2027年結果公表**:
- 人口・世帯数の更新（現在の2015年人口→2025年人口に）
- PER/住宅需要推計が改善
- DID (A16) も新データ
- メッシュ別将来推計人口 (mesh_pop) も次回推計でベース更新

### 更新時の作業手順

```bash
# 1. データダウンロード（変更があったデータセットのみ）
python scripts/download_nlni.py -d land_prices railways location_opt

# 2. プロセッサ実行（キャッシュ削除→再処理）
rm data/nlni/cache/land_prices.csv
rm data/nlni/cache/railways_stations.csv
rm data/nlni/cache/location_optimization.csv
# → precompute_json.py が自動的にプロセッサを再実行

# 3. JSON再生成
python scripts/precompute_json.py

# 4. オーバーレイ再生成
python scripts/generate_overlays.py

# 5. テスト
python -m pytest tests/test_calculator.py -v
cd ci102-nextjs && npx next build

# 6. デプロイ
git add -A && git commit -m "data: update L01/N02/A35 to FY2025"
git push  # → Vercel自動デプロイ
```

---

## URL テンプレート更新ルール

`scripts/download_nlni.py` 内の URL テンプレートは、年度が埋め込まれている。
新年度データが公開されたら、対応するテンプレートの年度部分を更新する。

例: L01（地価公示）R6→R7 への更新
```python
# Before
url_template=f"{BASE}/L01/L01-24/L01-24_{{pref_code:02d}}_GML.zip"
# After
url_template=f"{BASE}/L01/L01-25/L01-25_{{pref_code:02d}}_GML.zip"
```

---

## データ鮮度アラート

UIの各タブに出典と調査時点を表示する（既存の遅行指標注記に準拠）:
- 「データ出典: 国土数値情報 ○○（調査時点: YYYY年）」
- 調査時点が3年以上前のデータには「古いデータの可能性あり」注記を追加

---

## 監視すべきURLs

新データ公開の確認先:

| データ種別 | 確認URL |
|-----------|--------|
| 国土数値情報 全般 | https://nlftp.mlit.go.jp/ksj/index.html |
| 地価公示 | https://www.land.mlit.go.jp/landPrice/AriaServlet?MOD=2 |
| e-Stat 経済センサス | https://www.e-stat.go.jp/stat-search?page=1&toukei=00200553 |
| e-Stat 国勢調査 | https://www.e-stat.go.jp/stat-search?page=1&toukei=00200521 |
| 立地適正化計画 策定状況 | https://www.mlit.go.jp/toshi/city_plan/toshi_city_plan_fr_000051.html |
