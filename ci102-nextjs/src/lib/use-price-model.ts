"use client";

/**
 * 都道府県地価予測モデル — Phase 6.5。
 *
 * scripts/train_price_model.py で訓練した線形回帰モデルを JSON で配信。
 * TS 側は単純な内積 (sum of feature × coef + intercept) で予測再現。
 *
 * 教育: マクロ経済データから地価の何%が説明できるか?
 * 残差 (実 - 予測) で「経済データで説明できない地域固有要因」を可視化。
 */
import { useState, useEffect } from "react";

export interface PriceFeature {
  key: string;
  description: string;
  coefficient: number;  // z-score 空間の係数
  mean: number;         // 訓練時の平均
  std: number;          // 訓練時の標準偏差
}

export interface PriceModel {
  model: string;
  trained_on: string;
  target: string;
  r_squared: number;
  features: PriceFeature[];
  intercept: number;
  predictions: Array<{
    pref_name: string;
    actual: number;
    predicted: number;
    residual: number;
  }>;
}

let _cache: PriceModel | null = null;

export function usePriceModel() {
  const [model, setModel] = useState<PriceModel | null>(_cache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) return;
    setLoading(true);
    fetch("/data/price_model.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: PriceModel) => {
        _cache = json;
        setModel(json);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  return { model, loading, error };
}

/**
 * 物件・地域の特徴量から地価予測値を計算。
 *
 * features: 訓練時と同じキーで指定 (population, ebm, basic_ratio 等)
 */
export function predictPrice(model: PriceModel, features: Record<string, number>): number {
  let sum = model.intercept;
  for (const f of model.features) {
    const raw = features[f.key] ?? 0;
    const normalized = (raw - f.mean) / (f.std || 1);
    sum += normalized * f.coefficient;
  }
  return Math.max(0, sum);
}

/**
 * 各特徴量の寄与度を計算 (Shapley風)。
 * 「どの要因がこの予測値を最も押し上げ/下げているか」を返す。
 */
export function explainContributions(
  model: PriceModel,
  features: Record<string, number>,
): Array<{ key: string; description: string; contribution: number }> {
  const contributions: Array<{ key: string; description: string; contribution: number }> = [];
  for (const f of model.features) {
    const raw = features[f.key] ?? 0;
    const normalized = (raw - f.mean) / (f.std || 1);
    contributions.push({
      key: f.key,
      description: f.description,
      contribution: normalized * f.coefficient,
    });
  }
  return contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}
