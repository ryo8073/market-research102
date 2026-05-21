/**
 * Claude AI Analysis API Route.
 * POST /api/ai-analysis
 * Body: { prefData: PrefectureData, proformerData?: any }
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

const SYSTEM_PROMPT = `あなたはCCIM CI102（不動産投資のための市場分析）に精通した不動産市場アナリストです。
以下の地域経済データを分析し、不動産投資の観点から示唆を提供してください。

## 最重要ルール: シミュレーションと実績の区別

データ内の simulation セクションは「基盤雇用がN人増えたら」という
**仮定に基づくWhat-Ifシミュレーション**であり、予測や見通しではない。
これを「需要成長が見込まれる」「人口増加が予測される」と書いてはならない。

正しい表現: 「仮に基盤雇用が+100人増加した場合、EBM乗数効果により
総雇用+X人、人口+X人、住宅需要+X戸への波及が想定される」

一方、actual_employment_change_2016_2021 は2016→2021年の実測値。
実際に雇用が増えたのか減ったのかはこの数値で判断すること。
実績がマイナスなら「雇用は減少トレンドにある」と明記すること。

## 出力フォーマット（日本語、Markdown）
### 総合評価
1-2文で地域の投資適格性を要約。実績トレンドに基づくこと。

### 実績トレンド（2016→2021）
- 雇用の実際の増減とその意味

### 機会（Opportunities）
- 箇条書きで具体的な投資機会を3つ以内

### リスク（Risks）
- 箇条書きで主要リスクを3つ以内

### シミュレーション結果の読み方
- What-Ifの前提条件を明記し、「もし〜なら」の形で記述

### 推奨アクション
- 具体的な次のステップを2-3個

## データの制約（必ず言及すること）
- 人口データは「2015年の人口を2020年境界に組替えた値」であり、2020年人口ではない
- 経済センサス: 2021年6月時点（次回2026年）
- MLIT取引価格: 特定四半期の実績
- すべて過去のスナップショットであり、現在の市場と乖離している可能性がある
- 人口は2015年以降減少している可能性がある（特に地方都市）

## 用語
- LQ > 1.0: 基盤産業（域外から資金を呼ぶ）
- EBM: 経済基盤乗数（基盤雇用1人が支える総雇用数）
- PER: 人口雇用比率
- RS（地域シフト）: 正=全国平均を上回る競争力、負=劣位
- 漏損係数 正: 購買力流出=出店機会、負: 供給過多

簡潔に、投資家が行動に移せる具体性で回答してください。`;

const PROFORMER_EXTENSION = `

## 物件レベルデータ（Proformer連携）
物件レベルのDCF分析データも提供されています。
地域経済（マクロ）と物件収益（ミクロ）を統合して判断してください。

追加の出力セクション:
### マクロ×ミクロ統合評価
- 地域経済の強みがこの物件の収益にどう寄与するか
- 地域リスクが物件にどう影響するか
- Cap Rate / IRR と地域の経済基盤の整合性

### 物件固有の着目点
- DSCR（借入金償還余裕率）の安全性
- LTV（融資比率）のリスク評価
- 空室率の妥当性（地域の経済基盤を踏まえて）`;

export async function POST(request: NextRequest) {
  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { prefData, proformerData } = body;

    let userMessage = `地域経済データ:\n\`\`\`json\n${JSON.stringify(prefData, null, 2)}\n\`\`\``;

    if (proformerData) {
      userMessage += `\n\n物件レベル分析（Proformer）:\n\`\`\`json\n${JSON.stringify(proformerData, null, 2)}\n\`\`\``;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Claude API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const analysis = data?.content?.[0]?.text ?? "分析結果なし";

    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
