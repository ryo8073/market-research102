/**
 * Claude AI による Decision Hub 分析の自然言語化 API。
 *
 * 4層ガードレール実装 (docs/AI_GUARDRAILS_POLICY.md 参照):
 *   L1: 入力サニタイズ + データ最新性明示
 *   L2: 堅牢な System Prompt + temperature 制御
 *   L3: 出力の危険語句検出
 *   L4: AI生成明示 + 免責事項
 *
 * POST /api/ai-decision
 * Body: DecisionHubInput
 */
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import {
  ECONOMIC_CENSUS_CURRENT,
  ECONOMIC_CENSUS_PREVIOUS,
  POPULATION_CENSUS_CURRENT,
  shiftSharePeriodLabel,
} from "@/lib/data-versions";
import { logEvent } from "@/lib/usage-log";

// ============================================================================
// SYSTEM PROMPT — Layer 2 ガードレール
// ============================================================================

const SYSTEM_PROMPT = `あなたは CCIM CI102（不動産投資のための市場分析）に精通した
不動産市場アナリストです。地域経済データから不動産投資の参考情報を提供します。

## 🚫 絶対禁止事項（違反は宅地建物取引業法・消費者契約法に抵触する可能性）

1. **断定的判断の提供禁止**
   - ❌ 「買うべきです」「売却すべきです」「絶対に投資すべき」
   - ❌ 「確実に値上がりします」「100%儲かります」「保証します」
   - ✅ 「データから見て○○の特性があります」「○○の観点で参考になります」

2. **将来予測の断定禁止**
   - ❌ 「需要が増えます」「人口が回復します」
   - ✅ 「需要拡大の可能性が示唆されます」「現データでは人口減少傾向が継続」

3. **元データにない数値の生成禁止**
   - 与えられたスコア・指標以外の具体的数値を捏造してはならない
   - 不明な場合は「データなし」と明示

4. **過度な楽観・悲観禁止**
   - ❌ 「最高の投資先」「破綻リスク」「危険」（根拠なし）
   - ✅ データに基づく中立的な評価

## ✅ 必須要素

1. **データ出典の明示**
   - 「経済センサス2021」「国勢調査2020」「国土数値情報」など
   - 各数値の元データソースを引用

2. **不確実性の明示**
   - 「データ上は」「現時点の指標では」「推定値ベースでは」
   - 「ただし○○の制約があり実態と乖離する可能性」

3. **CI102 教科書の正しい解釈**
   - EBM = 1 / 基盤雇用比率 (多角化度の逆数、高いほど良い意味ではない)
   - 教科書 Orlando MSA: EBM 4.94 / 基盤率 20.2% が健全大都市圏ベンチマーク
   - 通勤歪み (inflow/outflow) は単独自治体の数値を歪める
   - **Mulligan凸性質 (1995)**: 業種粒度を細かくすると EBM は単調減少。
     大分類17で見た EBM は粒度が粗いため過大評価される。中分類95・細分類で評価し直す価値あり。
   - **L2 EBM の解釈**: 卸売・小売業のみ細分類化済み。製造業特化県では L2 効果限定。
     「L2 が教科書範囲内」は良いサインだが、「L2 がまだ高い」=不健全とは断言しない (細分類化余地)

4. **データ時点の明示**
   - 経済センサス: 2021年6月時点
   - 国勢調査人口: 2015年組替値 (2020年境界)
   - シフトシェア: 2016→2021年の実績

5. **What-If と実績の区別**
   - シミュレーション結果は「仮に〜なら」の形で
   - 実績データ (2016→2021 雇用変化) は確定値

## 📋 出力フォーマット (Markdown、600-900字)

\`\`\`markdown
### 🎯 結論
[最有力候補と参考度を1-2文、断定を避けて]

### 📊 投資判断の根拠
- [根拠1: 数値+データソース+CI102的意味]
- [根拠2: ...]
- [根拠3: ...]

### ⚠️ 留意すべきリスク
- [リスク1+対策案]
- [リスク2+対策案]

### 💡 物件タイプ別の特性比較
[上位3つの物件タイプを「相対的に向く/向かない」で]

### 🚀 推奨される追加調査
- [次のステップ1]
- [次のステップ2]

### 📌 重要な前提
[データ時点・分類粒度・通勤歪み等の重要な制約事項]
\`\`\`

## 文体ルール

- お客様への参考情報として丁寧かつ中立
- 「データから見て」「CI102 の枠組みでは」「現データでは」で根拠を明示
- 専門用語(EBM, LQ等)は補足説明
- 数値は出典付きで
- 最後に「※本分析は AI による自動生成であり、投資判断はお客様の責任において」と明記`;

// ============================================================================
// Layer 3: 出力検証 — 危険語句検出
// ============================================================================

interface GuardrailWarning {
  level: "high" | "medium" | "low";
  pattern: string;
  category: string;
  context: string;
}

function detectGuardrailViolations(text: string): GuardrailWarning[] {
  const warnings: GuardrailWarning[] = [];

  const patterns: Array<{ regex: RegExp; level: "high" | "medium" | "low"; category: string }> = [
    // High: 断定的助言
    { regex: /買うべき|売るべき|投資すべき|やめるべき|避けるべき/, level: "high", category: "断定的助言" },
    { regex: /絶対に|必ず|確実に|100[%％]/, level: "high", category: "断定的表現" },
    { regex: /保証[しま][すれ]|断言[しま][すれ]/, level: "high", category: "保証的表現" },
    // Medium: 過度な楽観・悲観
    { regex: /最高の|ベストな|ナンバーワン/, level: "medium", category: "過度な楽観" },
    { regex: /最悪の|危険な|破綻/, level: "medium", category: "過度な悲観" },
    { regex: /値上がりし[まで]|値下がりし[まで]/, level: "medium", category: "価格予測の断定" },
    // Low: 注意すべき表現
    { regex: /\b儲か[るり]|\bもうか[るり]/, level: "low", category: "金融助言的表現" },
  ];

  for (const p of patterns) {
    const matches = text.match(p.regex);
    if (matches) {
      // 該当部分の前後20文字を context として
      const idx = text.indexOf(matches[0]);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + matches[0].length + 20);
      warnings.push({
        level: p.level,
        pattern: matches[0],
        category: p.category,
        context: text.substring(start, end),
      });
    }
  }

  return warnings;
}

// ============================================================================
// Layer 1: 入力サニタイズ
// ============================================================================

interface Factor {
  label: string;
  score: number;
  weight: number;
  interpretation: string;
}
interface AllScore {
  label: string;
  score: number;
  verdict: string;
  factors: Factor[];
}
interface ShiftShareInsight {
  topIndustry: string;
  topValue: number;
  rsTotal: number;
}

interface GranularityInsight {
  ebmL0: number;       // 大分類17
  ebmL1: number;       // 中分類95
  ebmL2: number;       // 中分類94 + 卸売小売細分類156
  inTextbookRange: boolean;  // L2 ≤ 5.5
  compressionPct: number;    // L2/L0 × 100
}

interface DecisionHubInput {
  target: string;
  bestType: string;
  bestScore: number;
  bestVerdict: string;
  rationale?: string[];
  risks?: string[];
  allScores?: AllScore[];
  commuteDistortion?: string;
  segment?: string;
  shiftShareMajor?: ShiftShareInsight | null;
  shiftShareMid?: ShiftShareInsight | null;
  granularity?: GranularityInsight | null;
}

function sanitizeInput(body: unknown): DecisionHubInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  // 必須フィールドの型チェック
  if (typeof b.target !== "string" || b.target.length === 0 || b.target.length > 200) return null;
  if (typeof b.bestType !== "string") return null;
  if (typeof b.bestScore !== "number" || !isFinite(b.bestScore) || b.bestScore < 0 || b.bestScore > 100) return null;
  if (typeof b.bestVerdict !== "string") return null;

  // 配列の検証
  const rationale = Array.isArray(b.rationale) ? b.rationale.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  const risks = Array.isArray(b.risks) ? b.risks.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  const allScores = Array.isArray(b.allScores) ? b.allScores.slice(0, 10) : [];

  // Shift-share insight サニタイズ
  const parseShiftShare = (v: unknown): ShiftShareInsight | null => {
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.topIndustry !== "string" || o.topIndustry.length === 0) return null;
    if (typeof o.topValue !== "number" || !isFinite(o.topValue)) return null;
    if (typeof o.rsTotal !== "number" || !isFinite(o.rsTotal)) return null;
    return {
      topIndustry: o.topIndustry.substring(0, 100),
      topValue: o.topValue,
      rsTotal: o.rsTotal,
    };
  };

  // Granularity insight サニタイズ
  const parseGranularity = (v: unknown): GranularityInsight | null => {
    if (typeof v !== "object" || v === null) return null;
    const o = v as Record<string, unknown>;
    const nums = ["ebmL0", "ebmL1", "ebmL2", "compressionPct"];
    for (const k of nums) {
      if (typeof o[k] !== "number" || !isFinite(o[k] as number)) return null;
    }
    return {
      ebmL0: o.ebmL0 as number,
      ebmL1: o.ebmL1 as number,
      ebmL2: o.ebmL2 as number,
      inTextbookRange: Boolean(o.inTextbookRange),
      compressionPct: o.compressionPct as number,
    };
  };

  return {
    target: b.target.substring(0, 200),
    bestType: (b.bestType as string).substring(0, 100),
    bestScore: b.bestScore,
    bestVerdict: (b.bestVerdict as string).substring(0, 50),
    rationale,
    risks,
    allScores: allScores as AllScore[],
    commuteDistortion: typeof b.commuteDistortion === "string" ? b.commuteDistortion : undefined,
    segment: typeof b.segment === "string" ? b.segment : undefined,
    shiftShareMajor: parseShiftShare(b.shiftShareMajor),
    shiftShareMid: parseShiftShare(b.shiftShareMid),
    granularity: parseGranularity(b.granularity),
  };
}

// ============================================================================
// POST handler
// ============================================================================

export async function POST(request: NextRequest) {
  const sid = request.headers.get("x-session-id") ?? undefined;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;

  const apiKey = getEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await logEvent({ action: "ai_decision", sid, status: 503, meta: { reason: "no_api_key" } }, ip);
    return NextResponse.json({ error: "ANTHROPIC_API_KEY 未設定" }, { status: 503 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディの解析失敗" }, { status: 400 });
  }

  // Layer 1: 入力サニタイズ
  const input = sanitizeInput(rawBody);
  if (!input) {
    await logEvent({ action: "ai_decision", sid, status: 400, meta: { reason: "invalid_input" } }, ip);
    return NextResponse.json({ error: "入力データが不正です（型・範囲を確認してください）" }, { status: 400 });
  }

  // ユーザーメッセージ構築（System prompt と完全分離）
  const userMessage = buildUserMessage(input);

  try {
    const startTime = Date.now();
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
        // Layer 2: temperature 制御 — 創造性を抑制
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      await logEvent({
        action: "ai_decision",
        sid,
        status: res.status,
        ms: Date.now() - startTime,
        meta: { reason: "claude_api_error", target: input.target },
      }, ip);
      return NextResponse.json({
        error: `Claude API error: ${res.status}`,
        detail: errText.substring(0, 500),
      }, { status: 502 });
    }

    const data = await res.json();
    const analysis: string = data?.content?.[0]?.text ?? "";

    if (!analysis) {
      await logEvent({ action: "ai_decision", sid, status: 502, ms: Date.now() - startTime, meta: { reason: "empty" } }, ip);
      return NextResponse.json({ error: "分析結果が空です" }, { status: 502 });
    }

    // Layer 3: 出力検証
    const warnings = detectGuardrailViolations(analysis);

    // メタ情報
    const meta = {
      model: "claude-sonnet-4-20250514",
      generated_at: new Date().toISOString(),
      latency_ms: Date.now() - startTime,
      temperature: 0.3,
      warnings_count: warnings.length,
      high_warnings: warnings.filter((w) => w.level === "high").length,
    };

    // 成功ログ
    await logEvent({
      action: "ai_decision",
      sid,
      status: 200,
      ms: meta.latency_ms,
      meta: {
        target: input.target,
        bestType: input.bestType,
        warnings_high: meta.high_warnings,
        warnings_total: meta.warnings_count,
        chars: analysis.length,
      },
    }, ip);

    return NextResponse.json({
      analysis,
      warnings,
      meta,
      disclaimer: "本レポートは AI (Claude) による自動分析です。投資判断はお客様の責任において行ってください。本ツールは投資助言ではなく分析情報の提供のみを目的としています。",
    });
  } catch (error) {
    return NextResponse.json({ error: String(error).substring(0, 500) }, { status: 500 });
  }
}

function buildUserMessage(input: DecisionHubInput): string {
  return `# 対象エリア
${input.target}

# 最有力候補
${input.bestType} (スコア ${input.bestScore.toFixed(0)}/100, 判定: ${input.bestVerdict})

# 自動抽出されたプラス要因
${(input.rationale ?? []).map((r) => `- ${r}`).join("\n") || "(なし)"}

# 自動抽出されたマイナス要因
${(input.risks ?? []).map((r) => `- ${r}`).join("\n") || "(なし)"}

# 全5物件タイプのスコア
${(input.allScores ?? []).map((s) =>
  `## ${s.label} — ${s.score.toFixed(0)}点 (${s.verdict})\n` +
  s.factors.map((f) => `  - ${f.label}: ${f.score.toFixed(0)}点 × 重み${(f.weight * 100).toFixed(0)}% [${f.interpretation}]`).join("\n")
).join("\n\n")}

${input.granularity ? `# Mulligan凸性質 — 業種粒度による EBM 進行
- L0 大分類17業種: EBM ${input.granularity.ebmL0.toFixed(2)}
- L1 中分類95業種: EBM ${input.granularity.ebmL1.toFixed(2)}
- L2 中分類94 + 卸売・小売業細分類156: EBM ${input.granularity.ebmL2.toFixed(2)}
- 教科書 Orlando MSA EBM 4.94 との関係: ${input.granularity.inTextbookRange ? "✓ L2 が教科書範囲内 (5.5以下) = 米国健全大都市圏と同等以上の多角化" : "L2 が教科書範囲外 (5.5超) = まだ高い"}
- L2/L0 圧縮率: ${input.granularity.compressionPct.toFixed(1)}% (低いほど粒度効果が大きい)
- ⚠ **重要な制約**: L2 は **卸売・小売業のみ細分類化** (156業種、e-Stat 0004003257)。
  製造業・サービス業・医療等は中分類のままなので、製造業特化県 (愛知・静岡等) では L2 効果が限定的。
  「L2 EBM が低いから多角化されている」と単純比較するのは慎重に。

` : ""}# シフトシェア分析の競争力 (${shiftSharePeriodLabel()} 実績)
${input.shiftShareMajor ? `- 大分類17業種: RS合計 ${input.shiftShareMajor.rsTotal.toLocaleString()} 人 / 最強RS産業「${input.shiftShareMajor.topIndustry}」(RS ${input.shiftShareMajor.topValue.toLocaleString()} 人)` : ""}
${input.shiftShareMid ? `- 中分類95業種: RS合計 ${input.shiftShareMid.rsTotal.toLocaleString()} 人 / 最強RS産業「${input.shiftShareMid.topIndustry}」(RS ${input.shiftShareMid.topValue.toLocaleString()} 人) ※民営事業所のみ` : ""}
${input.shiftShareMajor && input.shiftShareMid && input.shiftShareMajor.topIndustry !== input.shiftShareMid.topIndustry
  ? `  ↑ 大分類と中分類で異なる場合、中分類の方が具体的な「テナント候補」を示唆`
  : ""}

# 補足情報
${input.commuteDistortion ? `- 通勤歪み: ${input.commuteDistortion}` : ""}
${input.segment ? `- 市区町村セグメント: ${input.segment}` : ""}

# データ時点
- 経済センサス活動調査: ${ECONOMIC_CENSUS_CURRENT.labelFull}
- 国勢調査人口: ${POPULATION_CENSUS_CURRENT.labelFull}
- シフトシェア: ${ECONOMIC_CENSUS_PREVIOUS.surveyYear}→${ECONOMIC_CENSUS_CURRENT.surveyYear}年実測
- NLNI 国土数値情報: 各データセットの調査年（地価公示2024年・洪水想定2020-2023年等）
- OSRM 走行距離: 2026年5月計算

上記の自動評価結果を、CCIM CI102 の枠組みに沿った不動産市場分析の参考情報として整理してください。
システムプロンプトの『絶対禁止事項』と『必須要素』を厳格に守ってください。`;
}
