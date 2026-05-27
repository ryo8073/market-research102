"""都道府県別 地価予測モデル訓練 — Phase 6.5。

目的 (教育): 経済データだけで地価の何%が説明できるかを示し、
「マクロ経済 → 不動産価格」の関係を定量化。

データ:
- 入力: ci102-nextjs/public/data/prefectures.json (各種マクロ指標)
- ターゲット: median_unit_price (MLIT 取引価格 中央値、円/m²)

モデル: 多重線形回帰 (sklearn LinearRegression)
- 特徴量を z-score 正規化
- 47都道府県の小サンプルなので線形モデルが妥当 (過学習防止)
- 係数を JSON 化して TS 側で同じ予測を再現

出力: ci102-nextjs/public/data/price_model.json
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_JSON = PROJECT_ROOT / "ci102-nextjs" / "public" / "data" / "prefectures.json"
OUTPUT_JSON = PROJECT_ROOT / "ci102-nextjs" / "public" / "data" / "price_model.json"


# 特徴量定義: prefectures.json のキーと、教育的に意味のある説明
FEATURES = [
    ("population", "人口 (規模効果)"),
    ("ebm", "経済基盤乗数 (健全性)"),
    ("basic_ratio", "基盤雇用比率 (%)"),
    ("rs_total", "シフトシェアRS (競争力)"),
    ("aggregate_gap_factor", "小売ギャップ係数"),
    ("pop_change_pct", "人口20年変化率 (%)"),
    ("flood_risk_avg_pct", "洪水リスク (%)"),
    ("total_daily_riders", "鉄道乗降客数 (アクセス性)"),
    ("did_total_population", "DID人口 (都市性)"),
    ("num_medical", "医療施設数"),
]


def load_features() -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    """prefectures.json から (X, y, feature_names, pref_names) を構築。"""
    with open(INPUT_JSON, encoding="utf-8") as f:
        data = json.load(f)

    rows_X: list[list[float]] = []
    rows_y: list[float] = []
    pref_names: list[str] = []
    feature_names = [f for f, _ in FEATURES]

    for pref_code in range(1, 48):
        d = data.get(str(pref_code))
        if not d:
            continue
        price = d.get("median_unit_price")
        if price is None or price <= 0:
            continue
        # 特徴量抽出 (欠損は 0 埋め)
        row = []
        valid = True
        for key, _ in FEATURES:
            v = d.get(key)
            if v is None:
                v = 0  # 0埋め
            try:
                row.append(float(v))
            except (TypeError, ValueError):
                valid = False
                break
        if not valid:
            continue
        rows_X.append(row)
        rows_y.append(float(price))
        pref_names.append(d.get("pref_name", str(pref_code)))

    X = np.array(rows_X)
    y = np.array(rows_y)
    return X, y, feature_names, pref_names


def fit_linear(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float, np.ndarray, np.ndarray, float]:
    """z-score 正規化 + 最小二乗法。

    Returns:
        coefficients (z-score 空間)
        intercept (z-score 空間)
        mu (各特徴量の平均、TS側で正規化に使う)
        sigma (各特徴量の標準偏差、TS側で正規化に使う)
        r_squared
    """
    # 正規化パラメータ
    mu = X.mean(axis=0)
    sigma = X.std(axis=0)
    sigma_safe = np.where(sigma == 0, 1.0, sigma)  # 0除算回避
    X_norm = (X - mu) / sigma_safe

    # 最小二乗法: y = X_norm @ w + b
    X_aug = np.hstack([X_norm, np.ones((X_norm.shape[0], 1))])  # bias列追加
    coef_with_b, *_ = np.linalg.lstsq(X_aug, y, rcond=None)
    coef = coef_with_b[:-1]
    intercept = coef_with_b[-1]

    # R² 評価
    y_pred = X_norm @ coef + intercept
    ss_res = ((y - y_pred) ** 2).sum()
    ss_tot = ((y - y.mean()) ** 2).sum()
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

    return coef, intercept, mu, sigma_safe, r_squared


def main():
    if not INPUT_JSON.exists():
        print(f"入力なし: {INPUT_JSON}")
        return

    X, y, feature_names, pref_names = load_features()
    print(f"学習データ: {len(y)} 都道府県 × {X.shape[1]} 特徴量")
    if len(y) < 10:
        print("⚠ サンプル不足。precompute_json を先に実行してください")
        return

    coef, intercept, mu, sigma, r_squared = fit_linear(X, y)
    print(f"R² = {r_squared:.4f}  (1.0 = 完璧、0.0 = 平均値以下)")
    print()
    print("=== 特徴量の重要度 (z-score 空間の係数の絶対値) ===")
    importance_sorted = sorted(
        zip(feature_names, [f for _, f in FEATURES], coef),
        key=lambda x: abs(x[2]),
        reverse=True,
    )
    for fname, desc, c in importance_sorted:
        sign = "+" if c >= 0 else "-"
        print(f"  {sign} {abs(c):>10.1f}  {fname:<28} ({desc})")
    print(f"  intercept: {intercept:.1f}")

    # 予測 vs 実績
    y_pred = (X - mu) / sigma @ coef + intercept
    residuals = y - y_pred
    print()
    print("=== 残差 (実価格 - 予測価格) 上位5 ===")
    for idx in np.argsort(-residuals)[:5]:
        print(f"  {pref_names[idx]:<10}  実 ¥{y[idx]:>8,.0f}  予測 ¥{y_pred[idx]:>8,.0f}  残差 +{residuals[idx]:>7,.0f}")
    print()
    print("=== 残差 下位5 (予測が過大評価) ===")
    for idx in np.argsort(residuals)[:5]:
        print(f"  {pref_names[idx]:<10}  実 ¥{y[idx]:>8,.0f}  予測 ¥{y_pred[idx]:>8,.0f}  残差 {residuals[idx]:>7,.0f}")

    # JSON 出力 (TS 側で同じ予測を再現するためのパラメータ)
    output = {
        "model": "linear_regression",
        "trained_on": f"prefectures.json (n={len(y)})",
        "target": "median_unit_price",
        "r_squared": round(r_squared, 4),
        "features": [
            {
                "key": fname,
                "description": desc,
                "coefficient": float(c),
                "mean": float(m),
                "std": float(s),
            }
            for (fname, desc), c, m, s in zip(FEATURES, coef, mu, sigma)
        ],
        "intercept": float(intercept),
        "predictions": [
            {
                "pref_name": pref_names[i],
                "actual": float(y[i]),
                "predicted": float(y_pred[i]),
                "residual": float(residuals[i]),
            }
            for i in range(len(y))
        ],
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    print()
    print(f"保存: {OUTPUT_JSON} ({OUTPUT_JSON.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
