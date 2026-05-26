# 経済センサス 2026年版 差替手順書

## 対象

| 統計 | 現行 | 次回 |
|---|---|---|
| **経済センサス活動調査** | 2021年6月 (2023年公表) | **2026年6月実施 → 2028年頃公表見込み** |
| **国勢調査** | 2020年10月 (人口は2015年組替値) | **2025年10月実施 → 2027年頃確定値公表見込み** |

公表時期は e-Stat 公式情報を確認すること:
- 経済センサス: https://www.e-stat.go.jp/stat-search?page=1&toukei=00200553
- 国勢調査: https://www.e-stat.go.jp/stat-search?page=1&toukei=00200521

---

## 差替の全体フロー

```
[1] e-Stat で新テーブル ID 確認 (5分)
       ↓
[2] data/data_versions.py を更新 (10分)
       ↓
[3] ci102-nextjs/src/lib/data-versions.ts も更新 (5分)
       ↓
[4] data/census_cache.py の DatasetConfig を更新 (20分)
       ↓
[5] 旧キャッシュ削除 + 新キャッシュダウンロード (30-60分)
       ↓
[6] 教科書テスト再実行 — Orlando MSA で再現確認 (5分)
       ↓
[7] precompute_json.py 全体再生成 (30-60分)
       ↓
[8] Next.js build + Vercel デプロイ (10分)
```

**所要時間目安: 2-3時間** (ダウンロード時間を除けば実作業30分)

---

## ステップ詳細

### [1] e-Stat で新テーブル ID 確認

#### 1.1 経済センサス活動調査

e-Stat の検索画面で以下のキーワードを入力して新テーブルを特定:

| 用途 | 検索キーワード | 確認項目 |
|---|---|---|
| 産業大分類×市区町村 従業者数 | `経済センサス 2026 産業大分類 従業者数 市区町村` | tab フィルタ ID, cat02 (経営組織) コード |
| 産業中分類×市区町村 民営事業所 従業者数 | `経済センサス 2026 産業中分類 民営事業所 従業者数` | tab フィルタ ID |
| 小売業 年間商品販売額 | `経済センサス 2026 小売業 年間商品販売額 中分類` | tab フィルタ ID |

**重要**: 軸定義 (cat01/cat02) は調査年で逆転する可能性がある。
2016年テーブルは cat01=経営組織・cat02=産業分類だったが、2021年は cat01=産業分類・cat02=経営組織。
2026年版を取る前に `scripts/probe_mid_2016_table.py` を参考に新テーブルでメタ情報を確認すること。

#### 1.2 国勢調査

同様に検索:
- `国勢調査 2025 人口 世帯 都道府県 市区町村`
- 人口キー名は『2020年（令和2年）の人口』のような形式になるはず (組替値ではなく確定値)

---

### [2] data/data_versions.py を更新

```python
# 旧: ECONOMIC_CENSUS_CURRENT を ECONOMIC_CENSUS_PREVIOUS にコピー
# 新: ECONOMIC_CENSUS_CURRENT に2026年情報を入れる

ECONOMIC_CENSUS_CURRENT = CensusVersion(
    survey_year=2026,
    survey_month=6,
    publication_year=2028,  # 実際の公表年に修正
    label_short="2026年",
    label_full="経済センサス活動調査 2026年6月",
    csv_suffix="2026",
    table_major_emp="XXXXXXXXXX",   # e-Stat で確認
    table_mid_emp="XXXXXXXXXX",
    table_retail_sales="XXXXXXXXXX",
    table_establishments="XXXXXXXXXX",
)

ECONOMIC_CENSUS_PREVIOUS = CensusVersion(  # 旧 CURRENT
    survey_year=2021,
    survey_month=6,
    publication_year=2023,
    label_short="2021年",
    label_full="経済センサス活動調査 2021年6月",
    csv_suffix="2021",
    table_major_emp="0003449718",
    table_mid_emp="0004005684",
    table_retail_sales="0004003263",
    table_establishments="0003449718",
)

# HISTORICAL_VERSIONS に旧 PREVIOUS (2016) と新 PREVIOUS (2021) を残す
HISTORICAL_VERSIONS = [
    ECONOMIC_CENSUS_PREVIOUS,
    CensusVersion(survey_year=2016, ...),  # 2016版を保持
]

# 次回計画は2031年版に
ECONOMIC_CENSUS_NEXT_PLAN = {
    "survey_year": 2031,
    "publication_year_estimate": 2033,
    ...
}
```

### [3] ci102-nextjs/src/lib/data-versions.ts も同様に更新

Python と TS を二重管理しているのは Next.js 側で型安全に使うため。
両方を同時に更新しないと UI 表示と AI プロンプトに不整合が出る。

---

### [4] data/census_cache.py の DatasetConfig 更新

`DS_EMPLOYMENT_MAJOR` などの定数で参照しているテーブル ID とフィルタを更新。

```python
DS_EMPLOYMENT_MAJOR = DatasetConfig(
    table_id="XXXXXXXXXX",  # 2026年版テーブル ID
    csv_name="census_employment_major_2026.csv",  # CSV名を更新
    description="産業大分類別従業者数 2026年（LQ・EBM計算用）",
    tab_filter="113-2026",  # フィルタ ID も年と紐づく可能性あり
    ...
)
```

シフトシェアの t0 用 (`DS_EMPLOYMENT_MAJOR_2016`) は **そのまま残す**。
2021→2026 のシフトシェアになるため、t0 は2021年データ (=旧 CURRENT) を使う。
`DS_EMPLOYMENT_MAJOR_2021` を新規追加する必要がある。

---

### [5] キャッシュ削除 + 新キャッシュダウンロード

```powershell
# 旧キャッシュをアーカイブ (削除前にバックアップ)
mkdir data/cache/archive_2021
move data/cache/census_employment_major_2021.csv data/cache/archive_2021/
move data/cache/census_employment_mid_2021.csv data/cache/archive_2021/
move data/cache/census_retail_sales_2021.csv data/cache/archive_2021/
move data/cache/census_establishments_2021.csv data/cache/archive_2021/

# 新キャッシュをダウンロード
python scripts/download_census.py        # 経済センサス2026年版
python scripts/download_mid_2026.py       # 中分類民営事業所2026年版 (要作成)
```

`scripts/download_mid_2016.py` をテンプレートに `scripts/download_mid_2026.py` を作成。
業種コード抽出ロジック (先頭2桁の数字) は JSIC 第14次改定 (2024年予定) に応じて要更新の可能性あり。

---

### [6] 教科書テスト再実行

```bash
pytest tests/test_calculator.py -v
```

**全61テストが合格すること**。
これは Orlando MSA の教科書例 (Activity 4-1〜4-5, Self-Assessment 1b 等) を
ハードコードした値で検証するテスト。データ変更とは無関係なため、必ず全合格する。

データ更新後の sanity check:
```bash
python scripts/verify_basic_employment.py    # 主要都市のEBM が現実的な範囲か
python scripts/compare_major_vs_mid_ebm.py   # 中分類EBM が大分類より低いか
```

---

### [7] precompute_json.py 全体再生成

```bash
python scripts/precompute_json.py
```

47都道府県 + 1,901市区町村 + 7都市圏 の JSON が再生成される。
所要時間: 約30-60分 (NLNI enrichment 含む)。

差替後の sanity check:
- 東京都の EBM が 2-4 程度の範囲か
- 全国の中央値 EBM が 4.5-5.5 程度の範囲か (Orlando 教科書値 4.94 に近い)
- 那覇市の宿泊業 LQ が高いか

---

### [8] Next.js ビルド + デプロイ

```bash
cd ci102-nextjs
npm run build
```

ビルド成功を確認後:
```bash
git add data/data_versions.py ci102-nextjs/src/lib/data-versions.ts \
        data/census_cache.py scripts/download_mid_2026.py \
        ci102-nextjs/public/data/prefectures.json \
        ci102-nextjs/public/data/metro_summary.json \
        ci102-nextjs/public/data/municipalities/

git commit -m "data: 経済センサス2026年版に差替 (2021→2026)"
git push origin main
```

Vercel auto-deploy がトリガー → 数分でデプロイ完了。

---

## 想定される問題と対処

### 問題1: JSIC 改定によりテーブル軸構造が変わる

**症状**: 2026年版で大分類が18業種に増えた / 中分類が96業種に増えた
**対処**:
1. `data/industry_map.py` の `JSIC_MAJOR_DIVISIONS` を更新
2. 教科書テストの期待値が変わる可能性 → 改定対応テストを追加

### 問題2: 業種名が変わった (例「情報通信業」→「情報・通信業」)

**症状**: LQ 計算で「業種が見つからない」エラー
**対処**:
- `data_sources._normalize_2016_industry_name()` のような正規化関数を追加
- 旧名/新名 マッピングテーブルを作成

### 問題3: 2026年テーブル ID が公開されない (公表延期)

**対処**: 旧データを引き続き使用。`data-versions.ts` の `dataFreshnessStatus()` が "stale" を返し、UI に警告バナーが出る。

### 問題4: 人口データの境界組替方式が変わる

**症状**: 国勢調査2025の人口キーが従来と異なる形式
**対処**:
- `POPULATION_CENSUS_CURRENT.pop_key` を新キー名に更新
- `map_data._POP_KEY` も同期更新が必要 (CLAUDE.md 参照)

---

## チェックリスト

差替作業時にこのチェックリストを順次消化:

- [ ] e-Stat で 2026年版テーブル ID 4種類を確認
- [ ] `data/data_versions.py` の `ECONOMIC_CENSUS_CURRENT` を更新
- [ ] `ci102-nextjs/src/lib/data-versions.ts` も更新
- [ ] `data/census_cache.py` の `DS_EMPLOYMENT_*` を更新
- [ ] 旧キャッシュをアーカイブ
- [ ] 新キャッシュをダウンロード (`scripts/download_census.py`)
- [ ] 中分類2026年用ダウンローダー `scripts/download_mid_2026.py` を作成
- [ ] `pytest tests/test_calculator.py -v` で61テスト全合格
- [ ] `scripts/verify_basic_employment.py` で主要都市のEBM確認
- [ ] `scripts/precompute_json.py` で JSON 再生成
- [ ] `cd ci102-nextjs && npm run build` でビルド成功
- [ ] Next.js UI で 「データ時点: 経済センサス 2026年」表示確認
- [ ] AI レポート生成テスト (`/api/ai-decision`) でデータ時点が更新されているか
- [ ] commit + push → Vercel デプロイ完了
- [ ] 本番URL で東京都・大阪府・地方都市の3点で動作確認

---

## バージョン履歴

| 版 | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-05-27 | 初版作成 (2021版→2026版の差替手順) |
