# 再開用メモ — 2025国勢調査統合 ＆ 意思決定支援UI/UX

最終更新: 2026-08-06 / 状態: **ビルド可能（Python 118テスト合格 / Next.js `tsc --noEmit` エラーなし）**

## 目的（ユーザー要望の要約）
- 新公表データ（令和7年=2025年 国勢調査 人口速報集計, 2026-05-29公表）を収集し内容をブラッシュアップ。
- 「データが揃う」ではなく、投資家が理解し **不動産の購入・売却・立地選定を"決断"できる** 市場分析ツールにする。
- CI102の内容を**網羅**する（ハザードマップは今回対象外）。
- 需要・供給・**このエリアの強み**・将来性を分析して提示。既存のデータ分析(物件別スコアの根拠/リスク)の良い所も継承。

## 「新データ」の実体
- 令和7年国勢調査 人口速報集計。e-Statテーブル:
  - `0004050397` 男女別人口(総数) → 2025年人口
  - `0004050417` 世帯数・5年間人口/世帯増減率・人口密度・面積・2020組替人口 等
- 全国: 人口 123,049,524（2020比 -2.45%）。

## 完了済み（データ層・計算層）
- `scripts/download_population_2025.py` … 上記2表をマージ → `data/cache/census_population_2025.csv`（再取得可・要ネット）。
- `data/data_versions.py` … `POPULATION_CENSUS_CURRENT`=2025、`POPULATION_CENSUS_2020/PREVIOUS` 追加、pop_key="人口"。
- `data/census_cache.py` … `DS_POPULATION`=2025CSVへ、`DS_POPULATION_2020`保持、`get_area_population_momentum()` 追加。ALL_DATASETSからDS_POPULATION除外。
- `data_sources.py` … PER・小売ギャップ・city_basics・metro_basics を2025人口へ。city/metroに pop_change_pct/hh_change_pct 追加。
- `map_data.py` … `_POP_KEY="人口"` 他、compute_prefecture_comparison に pop_change_pct。
- `scorecard.py` … 人口モメンタム(2020→2025)を需要側先行指標として統合。`classify_population_momentum()`、ScorecardData拡張、自動インサイト。※CI102の100点スコア(教科書)は不変。
- `ai_analysis.py` … プロンプトに人口モメンタム＋2025人口。出力に「人口モメンタム」節。
- `app.py` … 総人口/世帯メトリクスにΔ、出典表記を2025へ。
- `scripts/precompute_json.py` … 市区町村の人口キー修正、pref/muni レコードに `census2025` ブロック生成。
- `scripts/enrich_json_population_2025.py` … 既存本番JSONを全再生成せず差分更新（pref: 人口/世帯/PER更新+census2025、muni: census2025付与）。**実行済み**（prefectures.json + municipalities/*.json は更新済み）。
- テスト: `tests/test_data_versions.py` 更新、`tests/test_population_momentum.py` 新規(5件)。**Python 118件合格**。
- ドキュメント: `CLAUDE.md`（人口の時点・鮮度表・キー注記）/ `README.md` 更新。

## 完了済み（UI/UX：Next.js 本番）
- `src/lib/data-versions.ts` … 国勢調査 現行版=2025、PREVIOUS追加。
- `src/lib/use-prefecture-data.ts` … `census2025` 型追加。
- `src/components/ui/population-momentum-card.tsx`（新規） … **意思決定支援版**。需要×供給マトリクス（supplyScore時）／需要ベンチマークスケール、購入スタンス、立地選定ヒント、次のアクション、世帯乖離示唆。
- `src/components/ui/area-diagnosis-panel.tsx`（新規） … **CI102 エリア総合診断**。総合スコア＋需要/供給/将来性サブスコア、総合スタンス、4本柱(需要/供給/強み/将来性)、**🏭経済基盤分析ブロック(基盤/非基盤バー・EBM波及カスケード・基盤産業チップ・中分類95業種を主表示/大分類は参考)**、✓根拠×⚠リスク(出典付・既存パターン継承)。
- `src/components/tabs/decision-hub-tab.tsx` … 先頭に `AreaDiagnosisPanel`、続いて `PopulationMomentumCard`(supplyScore=best.totalScore) を配置。
- `src/components/tabs/demographics-tab.tsx` … 先頭に `PopulationMomentumCard`(供給スコア無し=需要中心表示)。
- プレビュー(実データ, ブラウザで確認可):
  - `ci102-nextjs/public/ui-preview-momentum.html`（生成: `scripts/gen_ui_preview.py`）
  - `ci102-nextjs/public/ui-preview-diagnosis.html`（生成: `scripts/gen_ui_diagnosis.py`）

## 直近の重要な修正（ユーザー指摘「なぜ基盤分析が表現されていない？」への対応）
- 原因: 診断が大分類17業種の歪んだEBM(例 福岡=18.55/基盤比5.4%)を一文に埋めるだけで、CI102中核の基盤分析を可視化していなかった。中分類95業種(福岡=EBM12.2/基盤比8.2%)も未表示。
- 対応: `area-diagnosis-panel.tsx` に **経済基盤分析ブロックを独立表示**（中分類を主・大分類は参考）。供給ピラーの文言も中分類ベースへ。**適用済み・tsc OK**。

## 未了 / 次の再開ステップ
1. **プレビュー整合**: `scripts/gen_ui_diagnosis.py` に経済基盤分析ブロックを未反映（Reactが先行）。追随させると確認が容易。
2. **Streamlit(app.py)側の診断パリティ**: 需要×供給診断・経済基盤分析の同等表示は未反映（Next.jsのみ）。必要なら scorecard の値で追加。
3. **将来性スコアの正規化検討**: future は RS絶対値依存で大規模県が高く出やすい（大阪95/沖縄98）。雇用規模で正規化する案。
4. **文言(コピー)最終調整**: 各スタンス/ヒントの表現をユーザーレビュー反映。
5. **本番反映**: `cd ci102-nextjs; npm run build` → `git add -A; git commit; git push`（Vercel自動デプロイ）。※未コミット・未デプロイ。
6. （任意）`python scripts/precompute_json.py` 全再生成で census2025 を正規パイプラインからも生成（30-60分・NLNIデータ前提。未実行でも enrich 済みなので本番JSONは最新）。

## 環境メモ（重要）
- **apply_patch はワークスペース `C:\dev3\claudecode` 外に書けない**。プロジェクトは `C:\dev3\CI102_MarketAnalysis`。→ 編集は「patchスクリプトをワークスペースに作成→昇格実行(厳密文字列置換+件数アサート)」or PowerShellヒアストリングで実施してきた。
- **node_repl MCP がセッション中に応答不能(`unsupported call`)** → Playwrightでの画像化不可。プレビューHTMLは `Start-Process` でブラウザ表示して確認。
- git は dubious ownership 警告あり（`safe.directory` 追記は権限で失敗）。コミット時は `-c safe.directory=...` を併用。
- e-Stat取得はネット必要→昇格実行。APIキーは `.env`(ESTAT_APP_ID)。
- CI102の教科書100点スコア(`suitability_score`)は不変ルール。人口モメンタム/診断は別軸として並置。

## 検証コマンド
```
# Python
cd C:\dev3\CI102_MarketAnalysis
python -m pytest tests/test_calculator.py tests/test_data_versions.py tests/test_population_momentum.py -q -p no:cacheprovider
# Next.js 型
cd ci102-nextjs; npx tsc --noEmit
# プレビュー再生成
python scripts/gen_ui_diagnosis.py ; python scripts/gen_ui_preview.py
```
