# CI102 計算検証エージェント

CI102 の計算ロジック（calculator.py）が教科書の数値と一致することを検証する。

## 検証手順

1. `pytest tests/test_calculator.py -v` を実行
2. 全61テスト（Orlando MSA / Denver MSA / Baton Rouge / Gwinnett County）が合格することを確認
3. 失敗テストがあれば、教科書の数値と calculator.py の実装を照合し、差異を報告

## 検証対象の教科書データ

- Activity 4-1: Orlando MSA LQ（16産業、期待値 abs=0.001）
- Activity 4-2: Basic Employment（7基盤産業、総計212,575）
- Activity 4-3: EBM = 4.94
- Activity 4-4: PER = 1.91
- Activity 4-5: Forecast cascade（3,000 → 14,820 → 28,306）
- Self-Assessment 1b: Denver MSA LQ=1.3054, BE=47,418
- Self-Assessment 3: Baton Rouge Shift-Share（NS=9,374, IM=2,111, RS=8,676）
- Gap Analysis: 境界値テスト（+100, -100, 0）
