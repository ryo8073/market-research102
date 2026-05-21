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
simulationセクションは仮定に基づくWhat-Ifであり、予測ではない。
actual_emp_changeは2016→2021年の実測値。実績が減少なら明記すること。

## 出力フォーマット（日本語）
### 総合評価（1-2文）
### 実績トレンド（2016→2021）
### 機会（3つ以内）
### リスク（3つ以内）
### 推奨アクション（2-3個）

## データの制約（必ず言及）
- 経済センサス: 2021年6月、国勢調査: 2020年10月（人口は2015年組替値）
- すべて過去のスナップショット

簡潔に、投資家が行動に移せる具体性で回答してください。`;

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
