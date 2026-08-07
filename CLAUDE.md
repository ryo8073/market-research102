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
scorecard.py           全指標集約（ScorecardData dataclass + insights生成）
cross_analysis.py      ギャップ×価格クロス分析（4象限散布図）
  ↑
app.py                 Streamlit UI（8タブ: ⓪スコアカード〜⑦クロス分析）
  ↑
map_data.py            都道府県別集計（@st.cache_data付き）
map_charts.py          Plotly choropleth_map 描画
data/japan_prefectures.geojson  47都道府県境界GeoJSON
data/industry_property_map.py  産業→物件用途マッピング（テナント戦略）
  ↑
ai_analysis.py         Claude API統合（プロンプト構築+API呼出）
api/proformer.py       Proformer DCF分析 API クライアント
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

変更後は `pytest tests/test_calculator.py -v` で 61 テスト全合格を確認すること。

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
| 建築着工 住宅着工 年報 | `0003114613` | `18`(戸数)/`13`(床面積) | cdCat01=`14`(共同住宅), cdCat02=`12`(新築) | EBMシミュレーション開発パラメータ |
| 建築着工 建築物着工 月報 | `0003114393` | `12`(建築物の数) | cdCat01=`11`(計), cdCat03=`12`(A居住専用住宅) | 階数分布（3F以上で集合住宅平均階数を算出） |

スキップすべき集約カテゴリ: `AS`, `AR`, `AB`, `CR`（2021年）/ `00010`, `00020`, `00800`（2016年）

**2016年テーブルの注意点**:
- 軸構成が2021年と異なる: cat01=経営組織、**cat02=産業分類**（2021年は逆）
- 産業名は先頭にJSICコード付き（例: `D建設業`）→ 正規化が必要
- G1/G2, O1/O2, Q1/Q2, R1/R2 の細分があり、親カテゴリに集約する
- **全国コード `00000` が存在しない** → 47都道府県合計で算出する

### e-Stat API の注意事項

- `getStatsData` はフィルタなしだと **165万レコード** 返す場合がある。必ず `cdTab`, `cdCat` で絞り込むこと（タイムアウト防止）
- 国勢調査(2025速報)の人口キー名は `人口`。世帯・増減は `世帯数`/`5年間の人口増減率` 等（`data/data_versions.py` の `POPULATION_CENSUS_CURRENT.pop_key` と `map_data._POP_KEY` が正）。パターンマッチせず**キー名をハードコード**で指定する

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

### 人口データの時点に注意（2025年速報に更新済み）

**2026-05-29 更新**: 令和7年（2025年）国勢調査 人口速報集計を統合済み。
人口・世帯は2025年10月時点の実測値を使用（旧: 2015年組替値は廃止）。

- 人口テーブル: `0004050397`（男女別人口・総数） + `0004050417`（世帯数・5年間増減・人口密度）
- マージCSV: `data/cache/census_population_2025.csv`（`scripts/download_population_2025.py` で再取得可）
- 主要キー: `人口` / `世帯数` / `5年間の人口増減率` / `5年間の世帯増減率` / `人口密度` / `2020年（令和2年）の人口（組替）`
- PER・小売ギャップ需要推計は2025年人口を使用。
- **人口モメンタム**（2020→2025実測増減率）を需要側の先行指標として新規追加
  （`scorecard.classify_population_momentum`, JSON の `census2025` ブロック, `PopulationMomentumCard`）。
  CI102の100点スコア（供給側）は不変で、需要側の別軸指標として並置する。

人口キー名は `data/data_versions.py`（`POPULATION_CENSUS_CURRENT.pop_key`）と
`map_data._POP_KEY` にハードコードされている。変更時は両方を更新すること
（`tests/test_data_versions.py::test_population_pop_key_is_consistent` が同期を検証）。

確定値（年齢別・就業状態別を含む）は2027年頃公表見込み。公表後に差し替えを検討。

## データの鮮度

| データ | 調査時点 | 更新頻度 | 次回予定 |
|--------|---------|---------|---------|
| 経済センサス活動調査 | 2021年6月 | 5年ごと | 2026年 |
| 国勢調査（人口速報集計） | 2025年10月 | 5年ごと | 2025年確定値（2027年頃）→次回2030年 |
| MLIT取引価格 | 四半期更新 | 3ヶ月ごと | 随時 |

## NLNI（国土数値情報）データ管理

### git で追跡するもの / しないもの

```
data/nlni/
├── __init__.py          ← git追跡 ✓
├── downloader.py        ← git追跡 ✓
├── spatial.py           ← git追跡 ✓
├── processors/*.py      ← git追跡 ✓
├── raw/                 ← .gitignore（Shapefileは再ダウンロード可能）
└── cache/               ← .gitignore（CSVは再生成可能）
```

- `raw/` と `cache/` は合計13,000+ファイル。git addすると数十分ハングする
- ソースコード（.py）のみ追跡し、データは `scripts/download_nlni.py` で再取得

### 事前計算アーキテクチャ

```
[1回だけ] scripts/download_nlni.py     → raw Shapefile取得
[1回だけ] scripts/compute_driving_distances.py → OSRM経由で到達時間算出 (~31分)
[1回だけ] scripts/precompute_json.py   → 静的JSON生成 (~2分)
[毎回]   ユーザーがページを開く       → 静的JSONを読むだけ（即時表示）
```

事前計算の所要時間はユーザーの表示速度に一切影響しない。

### git コマンドをバックグラウンドにしない

大量ファイルの `git add` はバックグラウンド実行禁止。index.lock を保持し続け、後続のgit操作が全て失敗する。
フォアグラウンド + timeout=60000 で実行すること。

## Windows 環境固有ルール（Python スクリプト）

### stdout のエンコーディング対策

```python
import io, sys
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
```

**理由**: Windows PowerShell/cmd は cp932。日本語・em-dash・矢印記号を print すると UnicodeEncodeError で即死。
新しいスクリプトを作成する際は冒頭に必ず追加。

### pd.read_csv の空ファイル対策

```python
try:
    df = pd.read_csv(path)
except (pd.errors.EmptyDataError, pd.errors.ParserError):
    df = pd.DataFrame()  # 前回クラッシュで0バイトCSVが残っている場合
```

## シミュレーションと実績の区別（絶対ルール）

EBM×PERカスケード（基盤雇用N人増→総雇用→人口→住宅需要）は**What-Ifシミュレーション**であり、予測・見通しではない。

- UIでは「シミュレーション: 基盤雇用 +N人の場合」と明記すること
- AIプロンプトに渡す際は `simulation.is_prediction: false` を含めること
- AI出力で「需要成長が見込まれる」「人口増加が予測される」と書かせてはならない
- 正しい表現: 「仮に基盤雇用が+100人増加した場合、…への波及が想定される」
- 実績データ（`actual_employment_change_2016_2021`）と必ず並置し、実績が減少なら明記

## Streamlit UI の expanderルール

- `st.expander` は操作コントロール（selectbox/radio等）の**間**に配置しない
- コントロール群をまとめて上部に、expanderは地図/テーブル/チャートの**下**に配置
- ラベルに `ℹ️` アイコンを付けてドロップダウンと視覚区別する
- `expanded=True` をデフォルトとする（補足情報は基本開いた状態）

## 外部API統合のパターン

### 認証キーの管理方針

| API | 認証キー管理 | UI入力 |
|-----|------------|--------|
| e-Stat | `.env` 固定 | なし |
| MLIT | `.env` 固定 | なし |
| Anthropic Claude | `.env` 固定 | なし |
| Proformer | `.env` 固定（開発者用） | 物件データID（external_id）のみ |

- 開発者（単一ユーザー）用途では全APIキーを `.env` に集約
- マルチユーザー化時はユーザーDB + 認証でAPIキーを個別管理（Next.js移行時）
- Proformer APIキーは物件ごとではなくユーザーごと。external_idが物件識別子

### Proformer API

- Endpoint: `https://api.proformer.ai/api/v1/exports/{external_id}`
- Auth: `Authorization: Bearer {api_key}`
- レスポンス: property, income, noi_annual, financing (DSCR/LTV), investment_performance (cap_rate/IRR/NPV)
- クライアント: `api/proformer.py`
- AI統合分析時は地域経済データ（CI102）+ 物件収益データ（Proformer）を1つのプロンプトに含める

### AI分析（Claude API）

- クライアント: `ai_analysis.py`（`anthropic` パッケージ使用）
- CLAUDE.md準拠: APIクライアントは `call_claude_api()` 内で生成（モジュールレベル禁止）
- プロンプトには `SYSTEM_PROMPT`（アナリスト役割+出力フォーマット+データ制約）と `user_message`（ScorecardData JSON）を分離
- Proformerデータがある場合はプロンプトを拡張し「マクロ×ミクロ統合評価」セクションを追加

## Next.js版 UIルール

### 親のstateは必ず子コンポーネントにpropsで渡す

```tsx
// ❌ NG: page.tsx で cityCode/selectedCity を管理するが、タブに渡さない
<LqTab prefData={pref} allData={allData} />

// ✅ OK: 選択状態を全タブに渡す
<LqTab prefData={pref} allData={allData} selectedCity={selectedCity} />
```

**理由**: React の state は暗黙に子に伝わらない。ドロップダウンで市区町村を選択しても、propsで渡さなければタブ側は反応しない。

### データフックのfetch失敗を握りつぶさない

```tsx
// ❌ NG: エラーの原因が不明
.catch(() => setData([]))

// ✅ OK: エラーを可視化
.catch((err) => {
  console.error(`fetch failed:`, err);
  setError(err.message);
  setData([]);
})
```

UIにはエラーバナー（赤背景）を表示し、ユーザーが問題を認識できるようにする。

## Next.js版 技術選定

### チャートライブラリ: Recharts（Plotlyではない）

```tsx
// ❌ NG: Plotly.js（3.5MB、SSR非対応）
import Plot from "react-plotly.js";

// ✅ OK: Recharts（軽量、SSR対応、ResponsiveContainer統一）
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
```

**理由**: Plotly.jsは約3.5MBでバンドル肥大化、SSR非対応。Rechartsは軽量でReact統合が自然。2026-05-22に全タブ移行完了。

### Recharts の formatter/callback に明示的な型注釈を書かない

```tsx
// ❌ NG: RenderableText is not assignable to string でビルド失敗
<LabelList formatter={(v: string) => v} />
<Tooltip formatter={(value: number, name: string) => [value, name]} />

// ✅ OK: 型推論に任せるか unknown で受ける
<LabelList formatter={(v: unknown) => String(v ?? "")} />
<Tooltip formatter={(value, name) => [Number(value).toFixed(1), String(name)]} />
```

**理由**: Recharts の型定義は `LabelFormatter = (label: RenderableText) => ...`、`Formatter<ValueType, NameType>` で `ValueType | undefined` を受ける。`string` や `number` を明示すると型が狭すぎて `is not assignable` エラーになる。

### 共有UIコンポーネント

チャート説明・教育コンテンツ用のコンポーネントは `components/ui/` に集約済み:

| コンポーネント | ファイル | 用途 |
|--------------|---------|------|
| `CaseStudy` | `callouts.tsx` | 緑枠。具体的な地域の分析例 |
| `ClientTip` | `callouts.tsx` | 黄枠。お客様への説明文テンプレ |
| `RiskAlert` | `callouts.tsx` | 赤枠。リスク警告 |
| `InfoBox` | `callouts.tsx` | 青枠。参考情報 |
| `InterpTable` | `callouts.tsx` | 閾値×意味の解釈テーブル |
| `ReadingGuide` | `reading-guide.tsx` | 3ステップのチャート読み方ガイド |

新しいタブや画面にこれらが必要な場合、ローカル定義せず上記からインポートすること。

### 半円スコアゲージは CSS conic-gradient 方式（現行実装を維持）

```tsx
// ❌ NG: <circle> + stroke-dasharray — offsetの計算が非直感的
// ❌ NG: <path> + 三角関数 — 過去3回バグ修正を繰り返した

// ✅ OK: CSS conic-gradient + overflow:hidden（現在のpage.tsx実装）
const scoreDeg = (pct / 100) * 180;
// borderRadius + overflow:hidden で半円��クリップ
// conic-gradient(from 270deg, color 0deg Xdeg, #e5e7eb Xdeg 180deg, transparent 180deg)
```

**理由**: SVG `<path>`方式は3回以上バグ修正を繰り返し、conic-gradient方式で安定稼働を確認済���（localhostで検証完了）。**この実装は変更しないこと。**

### チャートの4象限・背景色は ReferenceArea で描く

散布図で象限を分ける場合（クロス分析、Muellerサイクル等）、ラベルだけでなくチャート内に `<ReferenceArea>` で薄い背景色を入れる。ラベルだけではクライアントが象限の意味を読み取れない。

### 桁違いデータを1つのバーチャートに入れない

人数（100〜800）と面積（27,000m²）を同一Y軸のバーチャートに入れると、小さい値が潰れてインパクトがない。代替:
- **ステップフロー図**: カード+矢印+乗数で段階を表現
- **倍率バー**: 基準値=1.0とした相対比較

### 重いコンポーネントはdynamic importで遅延読み込み

```tsx
const LqTab = dynamic(() => import("@/components/tabs/lq-tab"), {
  loading: () => <TabSkeleton />,
});
```

タブコンポーネント・MapLibre等は `next/dynamic` で分割。

### dynamic() はモジュールスコープでのみ使う

```tsx
// ❌ NG: コンポーネント関数内でdynamic() → state変更のたびに再マウント
function Parent() {
  const Child = dynamic(() => import("./child"), { ssr: false });
  return <Child />;  // Parentのre-renderでChildが毎回作り直される
}

// ✅ OK: モジュールスコープで1回だけ定義
const Child = dynamic(() => import("./child"), { ssr: false });
function Parent() {
  return <Child />;  // Childは安定したコンポーネント参照
}
```

**理由**: 地図タブでレイヤーON/OFFのたびにMapLibreが再マウントされ、ズーム・パン位置がリセットされるバグが発生した。

### スコア表示は「寄与点/配点」形式で統一する

```tsx
// ❌ NG: サブスコア0-100と重み%が混在 → 「100点/20点満点?」と誤読される
`EBM: 100.0 (20%)`

// ✅ OK: 加重寄与点/配点形式
`EBM: 20.0/20点`  // = raw_score(100.0) × weight(0.20) = 20.0
```

**理由**: ユーザーから「100点/20点満点と表示される。意味が分からない」と指摘。calculator.tsの重み定義が正（EBM=20%, 基盤比率=20%, RS=25%, ギャップ=20%, 規模=15%）。UI側の重みは必ずcalculator.tsに合わせること。

### 地図にはかならず凡例を付ける

- コロプレス（グラデーション）: 最小値→最大値のカラーバーと数値ラベル
- カテゴリ（セグメント色分け）: 各カテゴリの色見本+名称
- NLNIオーバーレイ: アクティブなレイヤーの色見本をコントロール横に表示

### ポリゴンオーバーレイの不透明度は0.3以上

```tsx
// ❌ NG: 0.2ではベースマップに埋もれて視認不能
paint={{ "fill-opacity": 0.2 }}

// ✅ OK: 0.3〜0.5 + 境界線を追加
paint={{ "fill-opacity": 0.45 }}
// 境界線レイヤーも追加
<Layer type="line" paint={{ "line-color": "#B8941F", "line-width": 0.5 }} />
```

### ポイントレイヤーはホバーで属性を表示する

地価公示・鉄道駅などのポイントレイヤーを地図に表示するだけでは「ただの点」で意味がない。

- `interactiveLayerIds` にレイヤーIDを追加
- `onMouseMove` でレイヤーIDを判定し、属性をPopupで表示
- 地価公示: 価格（円/m²）、用途、エリア名
- 鉄道駅: 駅名、乗降客数

### データなしは明示的にメッセージ表示する

```tsx
// ❌ NG: データがないと何も表示されず、バグに見える

// ✅ OK: 0件の場合に明示的な説明を出す
{activeLayers.has("location_opt") && featureCount === 0 && (
  <p className="text-amber-600">策定済み区域データがありません。</p>
)}
```

**理由**: 千葉県で立地適正化計画をONにしても何も起きず、データ不具合を疑われた。

### 投資適格スコアと空間補正は別軸で並置する

```
投資適格スコア: 53.3点（CI102経済分析 — 第1-6章）
  空間補正:
    洪水リスク:   -3.2点
    交通アクセス: +1.5点
    人口動態:     -4.8点
  補正後:       46.8点
```

- `suitability_score`（経済5要素100点）は**CI102教科書の答え**。変更しない
- `enhanced_score`（空間補正済み）は**実務の参考情報**として別セクションに表示
- 理由: 空間データ（洪水・交通・人口）はCI102教科書の範囲外。統合するとCI102の教育的価値が損なわれる

## Vercelデプロイ情報

- プロジェクト名: `ci102-market-analysis`
- 本番URL: https://ci102-market-analysis.vercel.app
- 学習ページ: https://ci102-market-analysis.vercel.app/learn
- Root Directory: `ci102-nextjs`（Build and Deployment設定）
- GitHub連携: `ryo8073/market-research102` → push自動デプロイ
- 環境変数: ESTAT_APP_ID, MLIT_API_KEY, ANTHROPIC_API_KEY, PROFORMER_API_KEY
- 同一リポジトリに複数Vercelプロジェクトを接続しないこと（app.py検出エラーの原因）
