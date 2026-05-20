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
app.py                 Streamlit UI（5タブ）
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

| テーブル | statsDataId | cdTab | cdCat02 | 用途 |
|---------|------------|-------|---------|------|
| 産業大分類 従業者数 | `0003449718` | `113-2021` | `0` | LQ・EBM |
| 産業中分類 従業者数 | `0004005686` | `113-2021` | `0` | 詳細LQ |
| 人口・世帯 | `0003433220` | (全項目) | — | PER |
| 小売販売額 | `0004003263` | `703-2021` | — | Gap Supply |
| 事業所数 | `0003449718` | `102-2021` | `0` | 集積密度 |

スキップすべき集約カテゴリ: `AS`, `AR`, `AB`, `CR`

### CSVキャッシュのカラム名規約

`data/census_cache.py` の新規データセットは `category_code`, `category_name` を使う。
旧形式(`industry_code`, `industry_name`)との互換は `get_area_employment()` 内で吸収済み。
新しいアクセス関数を追加する際は `category_name` カラムを前提とすること。

## PDF読み取り

Windows環境では `pdftoppm` が使えない。PDF読み取りには **PyMuPDF (`fitz`)** を使用:

```python
import fitz
doc = fitz.open(r'path/to/file.pdf')
text = doc[page_index].get_text()
```

## データの鮮度

| データ | 調査時点 | 更新頻度 | 次回予定 |
|--------|---------|---------|---------|
| 経済センサス活動調査 | 2021年6月 | 5年ごと | 2026年 |
| 国勢調査 | 2020年10月 | 5年ごと | 2025年（結果公表2026〜2027年） |
| MLIT取引価格 | 四半期更新 | 3ヶ月ごと | 随時 |
