"""
プレビューHTML生成スクリプト — 廃止済み

2026-08-07: プレビューHTMLは本番Vercel (ci102-market-analysis.vercel.app) に
一本化されたため、このスクリプトは不要です。

プレビューHTMLファイル (ci102-nextjs/public/ui-preview-diagnosis.html) は
本番URLへのリダイレクトページに差し替え済みです。

確認方法:
  本番: https://ci102-market-analysis.vercel.app/?tab=decision_hub
  ローカル: cd ci102-nextjs && npm run dev → http://localhost:3000/?tab=decision_hub
"""
print("このスクリプトは廃止されました。本番URLで確認してください:")
print("  https://ci102-market-analysis.vercel.app/?tab=decision_hub")
print("  ローカル: cd ci102-nextjs && npm run dev → http://localhost:3000/?tab=decision_hub")
