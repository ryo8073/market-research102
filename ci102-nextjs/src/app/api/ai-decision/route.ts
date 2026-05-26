/**
 * Claude AI による Decision Hub 分析の自然言語化 API。
 * POST /api/ai-decision
 * Body: {
 *   target: string,                  // 例: "神奈川県 横浜市"
 *   bestType: string,                // 最有力候補（例: "🏘️ 住居系"）
 *   bestScore: number,
 *   bestVerdict: string,
 *   rationale: string[],             // 自動抽出されたプラス要因
 *   risks: string[],                 // 自動抽出されたマイナス要因
 *   allScores: Array<{               // 全5物件タイプのスコア
 *     label: string;
 *     score: number;
 *     verdict: string;
 *     factors: Array<{ label: string; score: number; weight: number; interpretation: string }>;
 *   }>,
 *   commuteDistortion?: string,
 *   segment?: string,
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

const SYSTEM_PROMPT = `あなたはCCIM CI102（不動産投資のための市場分析）に精通した不動産市場アナリストです。
与えられた「投資判断ハブ」のスコア結果から、不動産投資家・お客様への説明文を自然な日本語で作成してください。

## 最重要ルール

1. **EBMの正しい解釈**: EBMは「経済の強さ」ではなく「多角化度の逆数」。
   EBM 3-6 が教科書MSA健全レンジ。EBM>8 は基盤雇用が薄い兆候であり「経済が強い」を意味しない。

2. **What-Ifと実績の区別**: 「需要成長が見込まれる」「人口増加が予測される」と断定しない。
   人口推計や経済予測は前提条件付きの推定値。実績データと推定値を明確に区別。

3. **分類粒度の限界**: スコアは大分類17業種ベース。中分類で見ると異なる可能性を必要に応じ言及。

4. **通勤歪み**: inflow（流入）= 通勤者で雇用過大、outflow（流出）= ベッドタウンで基盤過小。
   いずれも単独自治体では教科書 MSA との整合性が崩れることを留意。

## 出力フォーマット (Markdown 日本語、500-800字)

### 🎯 結論
最有力候補と推奨度を1-2文で。

### 📊 投資判断の根拠
- 最も評価の高い要因2-3個を具体的に
- 数値とそのCI102/不動産投資的意味を併記
- 「なぜこの物件タイプが向くか」を論理的に

### ⚠️ 留意すべきリスク
- マイナス要因2-3個
- 各リスクへの対策案を簡潔に

### 💡 物件タイプ別の比較
- 上位3つの物件タイプを「向き不向き」で短評
- なぜ順位がこの順になるか

### 🚀 推奨アクション
- 次のステップを2-3個（物件選定基準、追加調査項目、補足分析）

## 文体
- お客様への説明として丁寧で、専門用語は補足説明
- 過度な確信は避け、「データから見て」「CI102の枠組みでは」のように根拠を明示
- 投資判断はあくまでも参考、最終決定はお客様の判断であることを示唆`;

export async function POST(request: NextRequest) {
  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const {
      target, bestType, bestScore, bestVerdict,
      rationale, risks, allScores, commuteDistortion, segment,
    } = body;

    const userMessage = `## 対象エリア
${target}

## 最有力候補
${bestType} (スコア ${bestScore.toFixed(0)}/100, 判定: ${bestVerdict})

## 自動抽出されたプラス要因
${(rationale ?? []).map((r: string) => `- ${r}`).join("\n") || "(なし)"}

## 自動抽出されたマイナス要因
${(risks ?? []).map((r: string) => `- ${r}`).join("\n") || "(なし)"}

## 全5物件タイプのスコア
${(allScores ?? []).map((s: any) =>
  `### ${s.label} — ${s.score.toFixed(0)}点 (${s.verdict})\n` +
  s.factors.map((f: any) => `  - ${f.label}: ${f.score.toFixed(0)}点 × ${(f.weight * 100).toFixed(0)}% [${f.interpretation}]`).join("\n")
).join("\n\n")}

## 補足
${commuteDistortion ? `- 通勤歪み: ${commuteDistortion}` : ""}
${segment ? `- 市区町村セグメント: ${segment}` : ""}

上記の自動評価結果を、不動産投資家・お客様向けの自然な投資判断レポートに整理してください。`;

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
      return NextResponse.json({ error: `Claude API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const analysis = data?.content?.[0]?.text ?? "分析結果なし";

    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
