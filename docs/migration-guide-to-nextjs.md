# CI102 移行指示書: Streamlit → Next.js (React)

## 1. 技術スタック選定

| 項目 | 現行 (Streamlit) | 移行先 (Next.js) |
|------|-----------------|-----------------|
| フレームワーク | Streamlit (Python) | Next.js 14+ (App Router) |
| 言語 | Python 3.11 | TypeScript |
| チャート | Plotly (Python) | Plotly.js (`react-plotly.js`) |
| 地図 | Plotly choropleth | Plotly.js choropleth (同一API) |
| CSS | Streamlit組み込み | Tailwind CSS + shadcn/ui |
| API通信 | requests (Python) | fetch / Next.js Route Handlers |
| データ操作 | pandas DataFrame | 配列操作 or `danfojs` |
| テスト | pytest | Vitest |
| デプロイ | ローカル実行 | Vercel |

### 選定理由
- Plotly.js は Python版 Plotly とほぼ同一の JSON仕様 → チャート定義をそのまま流用可能
- Next.js API Routes で e-Stat/MLIT の APIキーをサーバーサイドに隠蔽できる
- 投資計算ツール(proformer.ai風)と同一フレームワークで統合しやすい

---

## 2. プロジェクト構成（移行後）

```
ci102-web/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # 共通レイアウト
│   │   ├── page.tsx                # ランディング / ダッシュボード
│   │   ├── analysis/
│   │   │   ├── page.tsx            # 分析メインページ（6タブ統合）
│   │   │   └── components/
│   │   │       ├── TabLQ.tsx           # ① LQ・経済基盤
│   │   │       ├── TabEBM.tsx          # ② EBM・PER・予測
│   │   │       ├── TabShiftShare.tsx   # ③ シフトシェア
│   │   │       ├── TabRetailGap.tsx    # ④ 小売ギャップ
│   │   │       ├── TabRealEstate.tsx   # ⑤ 不動産取引価格
│   │   │       └── TabMap.tsx          # ⑥ 地図分析
│   │   └── api/                    # Route Handlers (Backend)
│   │       ├── estat/route.ts          # e-Stat API プロキシ
│   │       ├── mlit/route.ts           # MLIT API プロキシ
│   │       └── census/route.ts         # キャッシュ済みCSVデータ提供
│   │
│   ├── lib/
│   │   ├── calculator.ts           # ← calculator.py の1:1移植
│   │   ├── types.ts                # 型定義（ShiftShareResult等）
│   │   ├── codes.ts                # ← data/codes.py
│   │   ├── industry-map.ts         # ← data/industry_map.py
│   │   ├── transforms.ts           # ← data/transforms.py
│   │   └── geo-utils.ts            # ← data/geo_utils.py
│   │
│   ├── components/
│   │   ├── charts/
│   │   │   ├── LQBarChart.tsx          # Plotly 横棒グラフ
│   │   │   ├── ShiftShareChart.tsx     # 積み上げ棒+折れ線
│   │   │   ├── RetailGapChart.tsx      # 漏損/余剰棒グラフ
│   │   │   ├── ChoroplethMap.tsx       # コロプレスマップ共通
│   │   │   ├── RadarChart.tsx          # レーダーチャート
│   │   │   └── PlotlyWrapper.tsx       # react-plotly.js 共通ラッパー
│   │   ├── PrefectureSelector.tsx      # 都道府県セレクタ
│   │   └── CitySelector.tsx            # 市区町村セレクタ
│   │
│   └── data/
│       └── japan_prefectures.geojson   # そのまま流用
│
├── public/
│   └── geo/                        # 市区町村TopoJSON（そのまま流用）
│
├── tests/
│   ├── calculator.test.ts          # ← test_calculator.py の移植
│   └── transforms.test.ts
│
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. 移行手順（フェーズ別）

### Phase 0: プロジェクト初期化（所要: 1日）

```bash
npx create-next-app@latest ci102-web --typescript --tailwind --app --src-dir
cd ci102-web
npm install react-plotly.js plotly.js
npm install -D @types/react-plotly.js vitest
npx shadcn@latest init
npx shadcn@latest add tabs card select input badge table
```

### Phase 1: calculator.ts — 数理エンジン移植（所要: 1〜2日）

**最優先。テスト駆動で移植する。**

移植対象: `calculator.py` (282行) → `src/lib/calculator.ts`

```typescript
// 例: location_quotient の移植
export function locationQuotient(
  localIndustryEmp: number,
  localTotalEmp: number,
  nationalIndustryEmp: number,
  nationalTotalEmp: number
): number {
  if (localTotalEmp === 0 || nationalTotalEmp === 0 || nationalIndustryEmp === 0) {
    return 0;
  }
  return (localIndustryEmp / localTotalEmp) / (nationalIndustryEmp / nationalTotalEmp);
}
```

**移植する関数一覧（全12関数 + 1クラス）:**

| Python関数 | TypeScript関数 | 備考 |
|-----------|---------------|------|
| `location_quotient()` | `locationQuotient()` | 純粋関数 |
| `lq_table()` | `lqTable()` | Mapping → Record<string,number> |
| `total_basic_employment()` | `totalBasicEmployment()` | DataFrame → 配列 |
| `economic_base_multiplier()` | `economicBaseMultiplier()` | 純粋関数 |
| `forecast_total_employment_change()` | `forecastTotalEmploymentChange()` | 純粋関数 |
| `population_employment_ratio()` | `populationEmploymentRatio()` | 純粋関数 |
| `forecast_population_change()` | `forecastPopulationChange()` | 純粋関数 |
| `forecast_housing_units()` | `forecastHousingUnits()` | 純粋関数 |
| `shift_share()` | `shiftShare()` | dataclass → interface |
| `shift_share_table()` | `shiftShareTable()` | DataFrame → 配列 |
| `leakage_surplus_factor()` | `leakageSurplusFactor()` | 純粋関数 |
| `gap_analysis_table()` | `gapAnalysisTable()` | DataFrame → 配列 |
| `ShiftShareResult` | `ShiftShareResult` (interface) | @dataclass → interface |

**テスト移植:** `tests/test_calculator.py` (55テスト) → `tests/calculator.test.ts`
- CI102教科書の数値はそのまま期待値として使用
- `pytest.approx(x, rel=1e-4)` → `expect(x).toBeCloseTo(expected, 4)`

### Phase 2: API Route Handlers — バックエンド（所要: 2〜3日）

APIキーをサーバーサイドに隠蔽するため、Next.js Route Handlers を使う。

#### 2-1. e-Stat API プロキシ (`src/app/api/estat/route.ts`)

```typescript
// Python の api/estat.py + data_sources.py の統合
import { NextRequest, NextResponse } from 'next/server';

const ESTAT_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const statsDataId = searchParams.get('statsDataId');
  const cdArea = searchParams.get('cdArea');
  // ... パラメータ検証

  const params = new URLSearchParams({
    appId: process.env.ESTAT_APP_ID!,
    statsDataId: statsDataId!,
    cdArea: cdArea ?? '',
    // cdTab, cdCat01, cdCat02 等
  });

  const res = await fetch(`${ESTAT_BASE}/getStatsData?${params}`);
  const data = await res.json();
  return NextResponse.json(data);
}
```

#### 2-2. MLIT API プロキシ (`src/app/api/mlit/route.ts`)

同様のパターン。`Ocp-Apim-Subscription-Key` ヘッダをサーバーで付与。

#### 2-3. キャッシュ戦略

| 現行 (Python) | 移行先 |
|--------------|-------|
| ディスクJSONキャッシュ (api/base.py) | Next.js `fetch` の `revalidate` オプション or Redis |
| CSVキャッシュ (census_cache.py) | `public/data/` に静的CSVとして配置 or Supabase |
| レート制限 (200ms間隔) | Route Handler内で `setTimeout` or キューイング |

**推奨:** 全国CSVキャッシュ（10.5MB）は Supabase Storage or Vercel Blob に格納し、
`/api/census` Route Handler 経由で提供する。

### Phase 3: データ変換レイヤー（所要: 2日）

`data/transforms.py` (289行) の移植。pandas依存を除去する。

**pandas → TypeScript 変換パターン:**

| pandas操作 | TypeScript代替 |
|-----------|---------------|
| `df[df['lq'] > 1.0]` | `arr.filter(r => r.lq > 1.0)` |
| `df.groupby('industry').sum()` | `Object.groupBy()` + reduce |
| `df.sort_values('lq', ascending=False)` | `arr.sort((a,b) => b.lq - a.lq)` |
| `df.to_dict('records')` | そのまま配列 |
| `pd.DataFrame(records)` | そのまま配列 |
| `df['col'].map(func)` | `arr.map(r => ({ ...r, col: func(r.col) }))` |

**型定義 (`src/lib/types.ts`):**

```typescript
export interface IndustryRecord {
  industry: string;
  localEmp: number;
  nationalEmp: number;
  lq: number;
  basicEmp: number;
}

export interface ShiftShareResult {
  industry: string;
  actualChange: number;
  nationalGrowth: number;
  industryMix: number;
  regionalShift: number;
  totalShare: number; // computed
}

export interface RetailGapRecord {
  sector: string;
  demand: number;
  supply: number;
  gap: number;
  factor: number;
  verdict: 'leakage' | 'surplus' | 'balanced';
}
```

### Phase 4: UIコンポーネント（所要: 3〜5日）

#### 4-1. チャートコンポーネント

`react-plotly.js` を使い、Python側の Plotly 定義をほぼそのまま流用する。

```tsx
// src/components/charts/PlotlyWrapper.tsx
'use client';
import dynamic from 'next/dynamic';
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

export default function PlotlyWrapper(props: {
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
}) {
  return <Plot data={props.data} layout={props.layout} useResizeHandler style={{ width: '100%' }} />;
}
```

**Python Plotly → React Plotly.js の変換ルール:**

```python
# Python (app.py 181-191行)
fig = px.bar(lq_df, x="lq", y="industry", orientation="h",
             color="lq", color_continuous_scale=["grey","orange","red"])
```

↓ 変換

```tsx
// React
<PlotlyWrapper
  data={[{
    type: 'bar', orientation: 'h',
    x: lqData.map(r => r.lq),
    y: lqData.map(r => r.industry),
    marker: { color: lqData.map(r => r.lq), colorscale: [['grey','orange','red']] }
  }]}
  layout={{ yaxis: { autorange: 'reversed' } }}
/>
```

#### 4-2. タブ構成

shadcn/ui の `<Tabs>` で6タブを構成。各タブは独立コンポーネント。

```tsx
// src/app/analysis/page.tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TabLQ from './components/TabLQ';
// ...

export default function AnalysisPage() {
  const [prefCode, setPrefCode] = useState(13); // 東京都
  const [cityCode, setCityCode] = useState(0);

  return (
    <div className="flex">
      <aside className="w-64 p-4">
        <PrefectureSelector value={prefCode} onChange={setPrefCode} />
        <CitySelector prefCode={prefCode} value={cityCode} onChange={setCityCode} />
      </aside>
      <main className="flex-1 p-4">
        <Tabs defaultValue="lq">
          <TabsList>
            <TabsTrigger value="lq">① LQ・経済基盤</TabsTrigger>
            <TabsTrigger value="ebm">② EBM・PER</TabsTrigger>
            <TabsTrigger value="shift">③ シフトシェア</TabsTrigger>
            <TabsTrigger value="gap">④ 小売ギャップ</TabsTrigger>
            <TabsTrigger value="estate">⑤ 不動産取引</TabsTrigger>
            <TabsTrigger value="map">⑥ 地図分析</TabsTrigger>
          </TabsList>
          <TabsContent value="lq"><TabLQ prefCode={prefCode} cityCode={cityCode} /></TabsContent>
          {/* ... */}
        </Tabs>
      </main>
    </div>
  );
}
```

#### 4-3. 地図コンポーネント

GeoJSON/TopoJSONファイルはそのまま流用。Plotly.js の `choropleth_mapbox` or `choroplethmapbox` で描画。

```tsx
// ChoroplethMap.tsx
<PlotlyWrapper
  data={[{
    type: 'choroplethmapbox',
    geojson: japanGeoJson,
    locations: data.map(d => d.prefCode),
    z: data.map(d => d.value),
    featureidkey: 'properties.code',
    colorscale: 'YlOrRd',
  }]}
  layout={{
    mapbox: { style: 'carto-positron', center: { lat: 36.5, lon: 138 }, zoom: 4 },
  }}
/>
```

### Phase 5: テスト・統合（所要: 2日）

1. `vitest` で calculator.test.ts の55テスト全合格を確認
2. 各タブの手動動作確認（東京都・大阪府で検証）
3. e-Stat API の実データとStreamlit版の数値を突合
4. Vercel にデプロイして動作確認

---

## 4. 移行対象外（削除してよいもの）

| ファイル | 理由 |
|---------|------|
| `api/resas.py` | サービス終了済み |
| `sample_data.py` | PoC用。本番では不要 |
| `config.py` | Next.js の `.env.local` に置換 |
| `data/census_cache.py` のダウンロード機能 | ビルド時 or 別スクリプトで実行 |

---

## 5. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| pandas → JS変換で数値誤差 | 計算結果が教科書値と乖離 | calculator.test.ts を最初に移植し、全55テスト合格で担保 |
| Plotly.js SSR非対応 | ビルドエラー | `dynamic(() => import('react-plotly.js'), { ssr: false })` で回避 |
| e-Stat API レート制限 | 429エラー | Route Handler にキューイング + revalidate キャッシュ |
| GeoJSON 3.3MB が重い | 初回表示遅延 | TopoJSON (軽量) のまま使い、クライアントで変換 |
| CSVキャッシュ 10.5MB | Vercel サーバレス制限 | Supabase Storage or Vercel Blob に外部化 |

---

## 6. 工数見積

| フェーズ | 内容 | 目安 |
|---------|------|------|
| Phase 0 | プロジェクト初期化 | 1日 |
| Phase 1 | calculator.ts + テスト | 1〜2日 |
| Phase 2 | API Route Handlers | 2〜3日 |
| Phase 3 | データ変換レイヤー | 2日 |
| Phase 4 | UIコンポーネント（6タブ） | 3〜5日 |
| Phase 5 | テスト・統合・デプロイ | 2日 |
| **合計** | | **11〜15日** |

---

## 7. 投資ツールとの統合時の考慮

proformer.ai 風の投資計算ツールと CI102 を同一 Next.js アプリに統合する場合:

```
ci102-web/
├── src/app/
│   ├── analysis/        # CI102 市場分析（本指示書の範囲）
│   ├── investment/      # 投資シミュレーション（IRR・売却手取金）
│   └── api/
│       ├── estat/       # CI102 用
│       ├── mlit/        # CI102 用
│       └── stock/       # 投資ツール用（株価API等）
```

- `src/lib/calculator.ts` に IRR 計算関数を追加可能
- 市場分析の結果（EBM・PER等）を投資判断の入力として連携できる
- 同一の shadcn/ui + Tailwind で統一されたUI
