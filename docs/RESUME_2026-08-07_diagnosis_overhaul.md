# 再開用メモ — 投資判断ハブ「エリア総合診断」刷新 ＆ 新データの実判断接続

最終更新: 2026-08-07 / 状態: **デプロイ済み（main push 済 / Vercel自動デプロイ）。tsc・next build・pytecト green**

## このセッションでやったこと（要約）
ユーザー要望: 新データ(2025国勢)投入前後のUI/UX比較(Pros/Cons)、世界最高水準化、CI102(経済基盤分析)で「投資に活かす／将来予測」、細かいエリアのニーズを投資家に分かりやすく。加えて「LQ/EBM/PER等の計算フロー表示」「以前→最新の変化」「RSの変化」「地域選択」「批評→全修正」。

### 中核: `ci102-nextjs/src/components/ui/area-diagnosis-panel.tsx`（全面刷新）
`AreaDiagnosisPanel({ area, pref, city })` — 投資判断ハブ(decision_hubタブ)先頭。
- **需要×供給×将来性**の3スコア＋**エリア投資スタンス**（買/売の断定）。
- **🧮 指標の計算フロー(CI102)**: LQ→基盤雇用→EBM→PER→予測カスケード を式・実数・解釈で表示（What-if: 基盤+1,000人→総雇用→人口→住宅◯戸）。→ `<details>`で既定折りたたみ。
- **🏭 経済基盤分析**: 基盤/非基盤バー＋特化産業(LQ>1)チップ。中分類95業種で算出、大分類は参考。
- **🔮 将来需要予測**: 社人研2025→2035を世帯増減＝住宅純需要(戸)へ換算。
- **🎯 このエリアで狙うべきニーズ**: セグメント×世帯化×高齢化×小売ギャップから用途別に理由付きで提示。
- **🔁 データ更新の変化**: 人口/世帯 2020→2025(実測)の増減・全国比。
- **📊 雇用の変化とRS**: 実測変化＝全国+産業構成+RS(競争力) のシフトシェア分解、大分類/中分類・牽引業種。→ `<details>`で既定折りたたみ。
- **✓根拠 / ⚠リスク**（出典付）。
- **細分エリア対応**: 市区町村選択時は census2025・経済基盤・ニーズを市区町村レベルで算出（例 福岡市 EBM5.05/基盤比率19.8%/人口+3.19%）。
- **将来性スコアの規模正規化**: RSを雇用比に変換（大阪95→58, 福岡71→55, 東京88, 沖縄74, 秋田24）。

### 批評→5点修正（すべて実装済み）
1. **新データを実判断に接続**: `decision-hub-tab.tsx` の物件スコア(人口動態/高齢化/成長)に2025実測をブレンド(実測0.5+推計0.5、成長にRS加味)。→ 最有力候補・verdict・DCF macroScore・AI入力が新データで変化。
2. **モメンタム矛盾解消**: `PopulationMomentumCard` に `momentumC = selectedCity?.census2025 ?? pref.census2025` を渡し画面内一致。
3. **総合スコア名称分離**: 診断=「エリア総合スコア/エリア投資スタンス」、物件=「物件適格スコア」。
4. **導線**: `page.tsx` の `VALID_TABS` に decision_hub 等 全タブ追加 → `?tab=decision_hub` 共有可。
5. **密度低減**: 計算フロー・RS を `<details>` 既定折りたたみ。

### 型/データ
- `use-municipality-data.ts` に `census2025` 型を追加（市区町村JSONに実在）。
- `use-prefecture-data.ts` は既存 census2025 型を使用。
- 新規: `population-momentum-card.tsx`（需要×供給マトリクス/購入スタンス）。

### プレビュー（実データ・都道府県レベル・目視用）
- 生成: `scripts/gen_ui_diagnosis.py`（ワークスペース側 `write_diag_preview.py` が本体を出力）→ `ci102-nextjs/public/ui-preview-diagnosis.html`。
- 計算フロー/将来需要/ニーズ/変化/RS を反映済み。

## コミット（origin/main, pushed）
- `f74efd2` feat: 投資判断ハブの診断を刷新（計算フロー/将来需要/ニーズ/変化/RS＋市区町村＋正規化）
- `d17c761` fix: 新データを実判断に接続＋整合性改善（#1〜#5）

## データの次回更新（重要・投資判断に効く順）
- **国勢調査 確報（年齢・世帯構成）**: 2026年9月頃（人口等基本集計）。→ 高齢化率・世帯構成で需要側を精緻化可能。
- **経済センサス‐活動調査2026**: 2026-06-01実施 → 速報 令和9(2027)年5月末 / 確報 2027年9月頃〜。→ LQ/EBM/RSを更新し、**2016→2021→2026の複数期間RS推移**が初めて可能（現状は2016→2021の1期間が最新）。

## 未了 / 次の再開ステップ
1. #1ブレンド係数（実測0.5/推計0.5・閾値）は暫定 → 感度調整UI or 係数見直し。
2. AIレポートroute(`app/api/ai-decision`)のプロンプトに2025実測を明示注入（現状はスコア/根拠経由で間接反映）。
3. Streamlit(app.py)側の診断パリティ（現状Next.jsのみ）。
4. 将来需要予測の市区町村別戸数（現状は都道府県推計を明示表示）。muniのpop_2030/2050活用 or 確報取込後に対応。
5. 2026-09 国勢確報の取込（`scripts/download_population_2025.py` を確報テーブルへ向け直し年齢・世帯構成を追加）。
6. 2027 経済センサスでRS更新＋多期間トレンド。

## 環境メモ（重要・再掲）
- **apply_patch はワークスペース `C:\dev3\claudecode` 外に書けない**。CI102は `C:\dev3\CI102_MarketAnalysis`。→ 編集は「patchスクリプトをワークスペースに作成→昇格実行(厳密文字列置換+件数アサート)」。今回使用: `write_area_diag.py`(初版パネル), `write_diag_preview.py`(プレビュー本体), `patch_area_diag_change.py`(変化), `patch_area_diag_rs.py`(RS), `patch_all_fixes.py`(5点修正)。
- **area-diagnosis-panel.tsx を再生成する場合、write_area_diag.py は変化/RS/5点修正を含まない初版**なので上書き厳禁。現行ファイルへの追記は patch_* を使う。
- git: dubious ownership のため `git -c safe.directory=C:/dev3/CI102_MarketAnalysis ...`。`.git`はサンドボックス読取専用 → add/commit/pushは昇格実行。
- `tsc`/`build` は tsbuildinfo/.next 書込のため昇格実行。dev(next dev)は `.cmd` 直起動不可 → pwsh 経由でバックグラウンド起動、`.next`競合回避のためbuild前に停止。
- node_repl のPlaywrightはchromium未インストールで画像化不可。プレビューは `Start-Process` でブラウザ表示。

## 検証コマンド
```
cd C:\dev3\CI102_MarketAnalysis
python -m pytest tests/test_calculator.py tests/test_data_versions.py tests/test_population_momentum.py -q -p no:cacheprovider
cd ci102-nextjs; npx tsc --noEmit ; npm run build
# プレビュー: python scripts/gen_ui_diagnosis.py → public/ui-preview-diagnosis.html
# 実機: cd ci102-nextjs; npm run dev → http://localhost:3000/?pref=40 → 緑「投資判断ハブ」タブ
```
