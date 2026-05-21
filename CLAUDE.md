# CI102 不動産市場分析 — プロジェクトルール

## アーキテクチャ

```
calculator.py          純粋計算（データソース非依存）テスト最優先
  ↑
data/transforms.py     API応答 → calculator入力形式への変換
  ↑
data/census_cache.py   全国CSVキャッシュ（10.5MB/5データセット）
  ↑
api/estat.py           e-Stat API クライアント（主データソース）
api/mlit.py            MLIT 不動産情報ライブラリ API
  ↑
data_sources.py        キャッシュ→API→sample_data の3段フォールバック
  ↑
app.py                 Streamlit UI（6タブ）
  ↑
map_data.py            都道府県別集計（@st.cache_data付き）
map_charts.py          Plotly choropleth_map 描画
data/japan_prefectures.geojson  47都道府県境界GeoJSON
```

## 絶対に守ること

### RESAS API は使わない

RESAS API は **2025年3月24日にサービス終了済み**。コードに `api/resas.py` が残っているが、`data_sources.py` は e-Stat を優先するよう切替済み。新機能で RESAS に依存するコードを書かないこと。

代替:
- 産業別従業者数・LQ → **e-Stat 経済センサス活動調査** (statsDataId: `0003449718`)
- 人口・世帯 → **e-Stat 国勢調査** (statsDataId: `0003433220`)
- 都道府県・市区町村コード → `data/codes.py` の静的データ

### calculator.py を変更したら教科書テストを必ず通す

`tests/test_calculator.py` には CI102 教科書の正確な数値が格納されている:
- Orlando MSA Activity 4-1〜4-5 (LQ/Basic Emp/EBM/PER/Forecast)
- Denver MSA Self-Assessment 1b
- Baton Rouge Shift-Share (NS/IM/RS 恒等式検証)

変更後は `pytest tests/test_calculator.py -v` で 55 テスト全合格を確認すること。

### e-Stat 経済センサスのテーブル構造

LQ計算の核心データ。以下が確立済みのパラメータ:

| テーブル | statsDataId | cdTab | cdCat | 用途 |
|---------|------------|-------|-------|------|
| 産業大分類 従業者数 2021 | `0003449718` | `113-2021` | cdCat02=`0` | LQ・EBM |
| 産業大分類 従業者数 2016 | `0003218721` | `812` | cdCat01=`000` | シフトシェア t0 |
| 産業中分類 従業者数 | `0004005686` | `113-2021` | cdCat02=`0` | 詳細LQ |
| 人口・世帯 | `0003433220` | (全項目) | — | PER |
| 小売販売額 | `0004003263` | `703-2021` | — | Gap Supply |
| 事業所数 | `0003449718` | `102-2021` | cdCat02=`0` | 集積密度 |

スキップすべき集約カテゴリ: `AS`, `AR`, `AB`, `CR`（2021年）/ `00010`, `00020`, `00800`（2016年）

**2016年テーブルの注意点**:
- 軸構成が2021年と異なる: cat01=経営組織、**cat02=産業分類**（2021年は逆）
- 産業名は先頭にJSICコード付き（例: `D建設業`）→ 正規化が必要
- G1/G2, O1/O2, Q1/Q2, R1/R2 の細分があり、親カテゴリに集約する
- **全国コード `00000` が存在しない** → 47都道府県合計で算出する

### e-Stat API の注意事項

- `getStatsData` はフィルタなしだと **165万レコード** 返す場合がある。必ず `cdTab`, `cdCat` で絞り込むこと（タイムアウト防止）
- 国勢調査の人口キー名は `2015年（平成27年）の人口（組替）` のような長い文字列。パターンマッチで抽出せず、**キー名をハードコードで指定**する（「2015」を除外フィルタに含めると人口データごと消える）

### CSVキャッシュのカラム名規約

`data/census_cache.py` の新規データセットは `category_code`, `category_name` を使う。
旧形式(`industry_code`, `industry_name`)との互換は `get_area_employment()` 内で吸収済み。
新しいアクセス関数を追加する際は `category_name` カラムを前提とすること。

## 用語規約

| 英語 | 日本語（本アプリ） | 備考 |
|------|-------------------|------|
| Leakage | **漏損** | CI102日本語テキスト準拠。「漏出」も同義として使用可。UIには注記を表示。 |
| Surplus | 余剰 | |
| Basic Employment | 基盤雇用 | |
| Non-basic Employment | 非基盤雇用 | |
| Economic Base Multiplier | 経済基盤乗数 | |
| Location Quotient | 特化係数 | |
| Shift-Share Analysis | シフトシェア分析 | |
| Regional Shift | 地域シフト（競争要因） | |

## Streamlit UI の注意（プロジェクト固有）

`app.py` のサイドバーで `census_cities`（キャッシュ）と `cities`（sample_data）の2パスがある。
地域名の解決ロジックは**両パスを通った後**に、共通変数で行うこと。
片方のパスでしか定義されないローカル変数を後続で参照すると NameError になる。

## PDF読み取り

Windows環境では `pdftoppm` が使えない。PDF読み取りには **PyMuPDF (`fitz`)** を使用:

```python
import fitz
doc = fitz.open(r'path/to/file.pdf')
text = doc[page_index].get_text()
```

### 人口データの時点に注意

国勢調査2020テーブル（`0003433220`）の `「2015年（平成27年）の人口（組替）」` は、
**2020年の市区町村境界に組替えた2015年時点の人口**であり、2020年時点の人口ではない。
このテーブルには2020年人口そのものは含まれていない。

PER・小売ギャップ需要推計はすべてこの2015年人口を使用している。
次回国勢調査（2025年）結果の公表後に差し替えを検討すること。

人口キー名は `map_data._POP_KEY` と `data_sources.py` 内にハードコードされている。
変更時は両方を更新すること。

## データの鮮度

| データ | 調査時点 | 更新頻度 | 次回予定 |
|--------|---------|---------|---------|
| 経済センサス活動調査 | 2021年6月 | 5年ごと | 2026年 |
| 国勢調査 | 2020年10月 | 5年ごと | 2025年（結果公表2026〜2027年） |
| MLIT取引価格 | 四半期更新 | 3ヶ月ごと | 随時 |
