"""EBM算出の数学的構造を実データで分解表示する。

ユーザー疑問: 「各業種のLQが1.6程度でも、その都道府県/都市のEBMが11になる」
→ 数学的に矛盾しないかを実データで検証。

分解式:
  basic_emp_i = local_emp_i × (1 - 1/LQ_i)  ※ LQ_i > 1.0 のみ
  basic_emp_total = Σ basic_emp_i
  basic_ratio = basic_emp_total / total_emp
  EBM = 1 / basic_ratio （恒等式）

ポイント:
  LQ=1.6 の業種でも、その業種の雇用シェアが小さければ基盤雇用への寄与は小さい。
  例: LQ=1.6 で雇用シェア5% → basic寄与 = 0.05 × (1-1/1.6) = 1.875%
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from calculator import lq_table, total_basic_employment
from data.census_cache import (
    DS_EMPLOYMENT_MAJOR,
    DS_EMPLOYMENT_MID,
    load_cached_dataset,
    get_area_employment,
    get_national_employment,
)

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"


def decompose_ebm(local: dict, national: dict, label: str):
    """LQと雇用シェアから基盤雇用への寄与を業種別に分解表示。"""
    total = sum(local.values())
    df = lq_table(local, national)
    df["local_share_pct"] = df["local_emp"] / total * 100
    df["contrib_to_basic_pct"] = df["basic_emp_estimate"] / total * 100

    basic = total_basic_employment(df)
    basic_ratio = basic / total * 100
    ebm = 1 / (basic_ratio / 100) if basic_ratio > 0 else 0

    print(f"\n{'='*100}")
    print(f"=== {label} （{len(local)}業種, 総雇用 {total:,.0f}人）===")
    print(f"{'='*100}")
    print(f"{'業種':30s} {'雇用数':>9s} {'雇用シェア':>9s} {'LQ':>5s} "
          f"{'(1-1/LQ)':>9s} {'基盤雇用':>9s} {'基盤寄与%':>9s}")
    print("-" * 100)

    # LQ降順、上位15件
    for _, r in df.nlargest(15, "lq").iterrows():
        coef = (1 - 1/r["lq"]) if r["lq"] > 1.0 else 0.0
        mark = "★" if r["lq"] > 1.0 else " "
        print(f"{mark}{r['industry'][:28]:29s} {r['local_emp']:>9,.0f} "
              f"{r['local_share_pct']:>8.2f}% {r['lq']:>5.2f} "
              f"{coef:>9.3f} {r['basic_emp_estimate']:>9,.0f} {r['contrib_to_basic_pct']:>8.2f}%")

    print(f"\n  ▶ 基盤雇用合計: {basic:,.0f} 人 ({basic_ratio:.2f}% of total)")
    print(f"  ▶ EBM = 1 / 基盤雇用比率 = 1 / {basic_ratio/100:.4f} = {ebm:.2f}")
    print()
    print(f"  数学的構造の理解:")
    print(f"    LQ>1.0 業種の合計雇用シェア = {df[df['lq']>1.0]['local_share_pct'].sum():.1f}%")
    print(f"    平均 (1-1/LQ) 係数         = "
          f"{df[df['lq']>1.0]['basic_emp_estimate'].sum() / df[df['lq']>1.0]['local_emp'].sum():.3f}"
          if (df['lq']>1.0).any() else "(基盤産業なし)")
    print(f"    → 基盤雇用比率 = LQ>1.0業種シェア × 平均(1-1/LQ)")
    return basic_ratio, ebm


def main():
    df_major = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MAJOR.csv_name)
    df_mid = load_cached_dataset(CACHE_DIR, DS_EMPLOYMENT_MID.csv_name)
    nat_major = get_national_employment(df_major)
    nat_mid = dict(zip(
        df_mid[df_mid["area_code"] == "00000"]["category_name"],
        df_mid[df_mid["area_code"] == "00000"]["employees"],
    ))

    print("=" * 100)
    print("EBM算出の数学的構造の検証")
    print("=" * 100)
    print()
    print("【教科書 LQ計算式】")
    print("  LQ_i = (e_i / e_total) / (E_i / E_total)")
    print("  basic_emp_i = e_i × (1 - 1/LQ_i)  ※ LQ_i > 1.0 のみ、それ以外はゼロ")
    print("  EBM = total_emp / Σ basic_emp_i = 1 / 基盤雇用比率")
    print()
    print("【数値感覚】")
    print("  LQ=1.6 の業種:  (1 - 1/1.6) = 0.375 → 業種雇用の37.5%が基盤と算入される")
    print("  LQ=2.0 の業種:  (1 - 1/2.0) = 0.500 → 業種雇用の50%が基盤")
    print("  LQ=4.0 の業種:  (1 - 1/4.0) = 0.750 → 業種雇用の75%が基盤")
    print("  LQ=1.0 ちょうど: ゼロ（基盤判定なし）")

    # 横浜市（大分類版）
    yokohama = get_area_employment(df_major, "14100")
    decompose_ebm(yokohama, nat_major, "横浜市 大分類17業種版（EBM 11.43）")

    # 横浜市（中分類版）
    yokohama_mid = dict(zip(
        df_mid[df_mid["area_code"] == "14100"]["category_name"],
        df_mid[df_mid["area_code"] == "14100"]["employees"],
    ))
    decompose_ebm(yokohama_mid, nat_mid, "横浜市 中分類95業種版（EBM 7.07）")

    # 教科書 Orlando MSA を再現
    orlando = {
        "Construction": 61_673,
        "Financial Activities": 111_735,
        "Leisure and Hospitality": 171_246,
        "Transportation and Warehousing": 61_349,
        "Professional and Business Services": 201_785,
        "Information": 20_254,
        "Other Services": 54_176,
        "Manufacturing": 38_232,
        "Natural Resources and Mining": 1_262,
        "Retail Trade": 93_527,
        "Wholesale Trade": 28_842,
        "Education and Health Services": 154_672,
        "Government": 51_338,
    }
    # 残り3業種で計1,050,091になるはず
    rest = 1_050_091 - sum(orlando.values())
    orlando["Other (Utilities/Misc)"] = rest

    orlando_national = {
        "Construction": 7_269_400,
        "Financial Activities": 8_723_700,
        "Leisure and Hospitality": 13_326_700,
        "Transportation and Warehousing": 5_555_100,
        "Professional and Business Services": 20_245_700,
        "Information": 2_694_400,
        "Other Services": 6_048_800,
        "Manufacturing": 12_179_100,
        "Natural Resources and Mining": 573_100,
        "Retail Trade": 14_853_100,
        "Wholesale Trade": 5_804_500,
        "Education and Health Services": 23_140_400,
        "Government": 22_226_400,
    }
    rest_n = 142_795_200 - sum(orlando_national.values())
    orlando_national["Other (Utilities/Misc)"] = rest_n

    decompose_ebm(orlando, orlando_national, "教科書 Orlando MSA（EBM 4.94, 基盤率20.2%, 13業種）")

    print()
    print("=" * 100)
    print("【結論：EBM 11が出る理由（数学的に正しい）】")
    print("=" * 100)
    print()
    print("EBM = 1 / 基盤雇用比率 という恒等式があるため、")
    print("基盤雇用比率 9% → EBM 11.1 （機械的に決まる）")
    print()
    print("基盤雇用比率が低くなる理由は2つ:")
    print("  (1) LQ>1.0 業種の雇用シェア合計が小さい")
    print("       例: 横浜市は『情報通信業 LQ=1.84』など強い特化があるが、")
    print("           その業種の雇用シェア自体が地域内で5-10%程度")
    print("           → 基盤雇用への寄与は限定的")
    print("  (2) LQが1.0前後の業種が多い（特化が弱い）")
    print("       一見『LQ 1.6』が出ていても、(1-1/1.6)=0.375 でしか換算されない")
    print("       LQ=1.2 なら 0.167、LQ=1.05 なら 0.048 と急速に減衰")
    print()
    print("→ ユーザーが直感する『1.6の業種があるなら基盤が大きいはず』は")
    print("  その業種の雇用シェアが30%以上ある場合に成立する。")
    print("  日本の大分類17業種では、1業種が30%以上を占めることはほぼなく、")
    print("  最大でも『卸売・小売業』『製造業』が10-20%程度。")
    print()
    print("→ これが日本のEBMが教科書比で高めに出る本質的な理由。")
    print("  中分類95業種にすると、隠れていた高LQ特化業種（情報サービス等）が見え、")
    print("  基盤雇用が増えてEBMが下がる（横浜: 11.43 → 7.07）。")


if __name__ == "__main__":
    main()
