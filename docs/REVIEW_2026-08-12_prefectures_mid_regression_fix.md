# レビュー記録: prefectures.json 再インライン化の回帰修正

- 日付: 2026-08-12 (Asia/Tokyo)
- 対象コミット: `4823d87`（`f74376f..4823d87 -> main`）
- 種別: 回帰(先祖返り)修正 + パイプライン恒久化 + リポジトリ整理

---

## 1. 背景 / 発端

空き家率・MLIT成約価格・賃料インデックス統合の作業レビュー中に、
`prefectures.json` が **558KB → 1.47MB（約2.6倍）** に膨張している疑いが報告された。
遅延ロード用に分離したはずの `lq_table_mid` が `precompute_json.py` の再実行で
再インライン化され、軽量化コミットを巻き戻す恐れがある、という懸念。

## 2. 調査で確定した事実（git実測）

| コミット | prefectures.json | 状態 |
|---|---|---|
| 96d9d39 | 1,561KB | mid inline（元） |
| **fa0c88a** | **577KB** | `lq_table_mid` + `shift_share_table_mid` を分離（63%軽量化） |
| **8a17369** | **1,535KB** | ⚠️ 再インライン化（回帰発生点＝空き家率統合の再生成時） |
| f74376f (HEAD前) | 1,535KB | 回帰継続 |

### 根本原因
- 分離処理(fa0c88a)は **`precompute_json.py` に組み込まれておらず**、スクリプト外の
  **手動後処理（一回限りの手編集）** だった。
- スクリプトは常に `all_prefs`（mid込み）を書き出し、`prefectures_detail_mid.json` の
  生成も mid 除去も行わない。
- そのため空き家率統合(8a17369)で `precompute_json.py` を再実行した瞬間、
  mid込みの `prefectures.json` が再生成され、fa0c88a の最適化が静かに巻き戻された。

### 原因コミットの訂正
- 当初「commit 3931d6a を巻き戻す恐れ」と見立てられたが、**3931d6a は無関係**。
  3931d6a は `nlni_lite/`(275ファイル/84MB) を R2 配信化した **ビルド時OOM対策**（地図タイル側）。
- 今回巻き戻ったのは **fa0c88a（prefectures.json 63%軽量化）**。
- 影響レイヤも別: 3931d6a=ビルド時メモリOOM / 今回=初期ロード帯域・実行時。

### 二次リスク
- `prefectures_detail_mid.json`(968KB, 8/10) が残存し、EBMタブが遅延ロード。
  一方 `prefectures.json`(8/12) にも同データがインライン → **二重化**。
- detail 側はパイプラインで再生成されず古いスナップショットのため、将来の
  元データ更新で **EBMタブだけ古い値を表示するドリフト** の恐れ。

## 3. 実施した修正

### (1) `scripts/precompute_json.py` — 分離をパイプライン化
書き出し部に mid 分離ステップをコード化。再実行のたびに
`prefectures.json`（軽量）と `prefectures_detail_mid.json`（遅延）を両方正しく再生成。
手動後処理を廃止し、先祖返りを恒久防止。

```python
MID_DETAIL_KEYS = ("lq_table_mid", "shift_share_table_mid")
detail_mid = {}
for pc, rec in all_prefs.items():
    moved = {k: rec.pop(k) for k in MID_DETAIL_KEYS if k in rec}
    if moved:
        detail_mid[pc] = moved
# detail を先に書き出し → その後 mid を抜いた all_prefs を書き出し
```

### (2) データ再生成（決定的変換）
フルパイプラインは生データ/ネットワーク依存で副作用があるため、修正版スクリプトと
**等価な分離変換**を最新の現行JSONに適用。

| ファイル | Before | After |
|---|---|---|
| prefectures.json | 1,499KB | **531KB**（-65%） |
| prefectures_detail_mid.json | 968KB(8/10・スタール) | 968KB（最新データで再生成、コミット版とバイト一致＝ドリフトなし） |

### (3) `src/app/page.tsx` — シフトシェア中分類の配線修正
`precomputedMid` を本体(`pref.shift_share_table_mid`)直読みから遅延ソースへ変更。

```tsx
precomputedMid={prefDetailMid?.shift_share_table_mid ?? pref.shift_share_table_mid}
```

- 従来は本体直読みのため、分離すると `undefined` → `ShiftShareTab` の `hasMid=false` →
  中分類トグルが「取得中」で恒久無効化される潜在バグ（fa0c88a時点から潜在、
  8a17369のインライン化で偶然動いていた）を修正。
- LQタブ側(`page.tsx:1562`)は元から遅延ソースへ正しく配線済み。

### (4) 孤立ディレクトリ削除
`ci102-nextjs/public/data/municipalities_detail_mid/`（47ファイル・**17.2MB**・git追跡）を削除。
src・scripts・root Python すべてで参照ゼロ（市区町村の実働は `municipalities/{pc}.json` の
mid inline）。放置された旧分離試作でリポジトリ肥大の一因。

## 4. 計画5ステップの検証（いずれも良好）
- MLIT成約価格: `api/mlit/route.ts` で `priceClassification` 01/02 を正しく分岐。
- 空き家率スコア: `api/score/route.ts` で市区町村は個別値、都道府県は世帯数加重平均で集計。
- 賃料インデックス: `rent_index.json`（source/period_range/areas 構造）統合済み。

## 5. 検証結果
- `npx tsc --noEmit` → OK
- `npm run build` → 成功（全20ページ静的生成）
- データ整合スクリプトで確認:
  - prefectures.json に `lq_table_mid`/`shift_share_table_mid` 残存ゼロ
  - detail は旧inlineと完全一致（missing 0 / mismatch 0）
  - 非midキーの欠損・改変ゼロ（47都道府県）
  - スカラmid（`rs_total_mid`,`ebm_mid`,`suitability_score_mid`,`top_lq_industries_mid`）は
    本体に保持（ローダーが本体参照のため正）

## 6. コミット内容（`4823d87`, 50ファイル）
- `scripts/precompute_json.py`（分離ロジック恒久化）
- `ci102-nextjs/public/data/prefectures.json`（531KBへ軽量化）
- `ci102-nextjs/src/app/page.tsx`（シフトシェア配線修正）
- `municipalities_detail_mid/` 47ファイル削除

## 7. 残課題 / フォロー
- Vercel 再デプロイ後に初期ロード軽量化が反映される想定。
- 今後 `precompute_json.py` を再実行すれば軽量版が自動維持される（手動作業不要）。
- 参考: 遅延ロードの参照は `src/lib/use-prefecture-data.ts` の `usePrefDetailMid()`。
