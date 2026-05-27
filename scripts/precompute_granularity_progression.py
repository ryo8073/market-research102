"""粒度進行 (Mulligan凸性質) の事前計算 — Phase 6.6。

各都道府県について、業種粒度を細かくしていくと EBM がどう減少するかを
3段階で計算し、JSON 化する。

段階 (level):
  L0: 大分類17業種 (現行 prefectures.json の ebm)
  L1: 中分類95業種 (現行 prefectures.json の ebm_mid)
  L2: 中分類94業種 + 卸売・小売業を細分類156業種に展開 (合計~250業種)
      ※ G (卸売・小売業) 大分類部分のみ細分類化 — 他は中分類維持

理論 (Mulligan & Murphy 1995):
  粒度を細かくすると LQ>1 で検出される業種が増え、基盤雇用が単調増加。
  EBM = 総雇用 / 基盤雇用 は単調減少。教科書 Orlando MSA EBM 4.94 に近づく。

教育的目的:
  「粒度が粗いと EBM が過大評価される」事実を視覚的に示し、
  受講生に CI102 の真の解釈方法を伝える。

Output: ci102-nextjs/public/data/granularity_progression.json
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

import pandas as pd

from calculator import lq_table, total_basic_employment
from data.codes import PREFECTURES

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PREF_JSON = PROJECT_ROOT / "ci102-nextjs" / "public" / "data" / "prefectures.json"
MINOR_RETAIL_CSV = PROJECT_ROOT / "data" / "cache" / "census_retail_minor_2021.csv"
MID_CSV = PROJECT_ROOT / "data" / "cache" / "census_employment_mid_2021.csv"
OUTPUT_JSON = PROJECT_ROOT / "ci102-nextjs" / "public" / "data" / "granularity_progression.json"

# 卸売・小売業 (G 大分類) に該当する中分類コード
# JSIC Rev 13: 50-60番台
WHOLESALE_RETAIL_MID_CODES = {
    "50", "51", "52", "53", "54", "55",  # 卸売業
    "56", "57", "58", "59", "60", "61",  # 小売業
}


def compute_ebm_from_emp(emp_dict: dict[str, float], national_dict: dict[str, float]) -> tuple[float, float, float, int, list[dict]]:
    """雇用辞書から EBM・基盤雇用・基盤率・基盤業種一覧を計算。

    Returns: (ebm, basic_emp, basic_ratio_pct, n_basic_industries, basic_industries_list)
      basic_industries_list = [{"name": ..., "lq": ..., "basic_emp": ...}, ...]
    """
    if not emp_dict or not national_dict:
        return 0.0, 0.0, 0.0, 0, []

    df_lq = lq_table(emp_dict, national_dict)
    basic = total_basic_employment(df_lq)
    total = float(df_lq["local_emp"].sum())
    if total <= 0:
        return 0.0, 0.0, 0.0, 0, []

    ebm = total / basic if basic > 0 else 0.0
    basic_ratio_pct = (basic / total * 100) if total > 0 else 0.0
    n_basic = int((df_lq["lq"] > 1.0).sum())

    # LQ>1 の基盤業種を basic_emp_estimate 順に取得
    basic_industries = (
        df_lq[df_lq["lq"] > 1.0]
        .nlargest(50, "basic_emp_estimate")
        [["industry", "lq", "basic_emp_estimate"]]
        .to_dict("records")
    )
    return ebm, basic, basic_ratio_pct, n_basic, basic_industries


def main():
    if not PREF_JSON.exists():
        print(f"入力なし: {PREF_JSON}")
        return
    if not MID_CSV.exists():
        print(f"中分類キャッシュなし: {MID_CSV}")
        return
    if not MINOR_RETAIL_CSV.exists():
        print(f"細分類キャッシュなし: {MINOR_RETAIL_CSV}")
        return

    # 中分類データ読込
    mid_df = pd.read_csv(MID_CSV, dtype={"area_code": str, "category_code": str})
    # 全国中分類雇用
    nat_mid = mid_df[mid_df["area_code"] == "00000"]
    national_mid = dict(zip(nat_mid["category_name"], nat_mid["employees"]))

    # 細分類データ読込 (卸売・小売業 156業種)
    minor_df = pd.read_csv(MINOR_RETAIL_CSV, dtype={"area_code": str, "category_code": str})
    nat_minor = minor_df[minor_df["area_code"] == "00000"]
    # 細分類は area_code が prefcode+000 形式
    national_minor = dict(zip(nat_minor["category_code"], nat_minor["employees"]))
    # 細分類コード → 業種名のマッピング (newly_added 表示用)
    minor_code_to_name = dict(zip(nat_minor["category_code"], nat_minor["category_name"]))

    # 大分類は prefectures.json から既に計算済みの値を使用
    with open(PREF_JSON, encoding="utf-8") as f:
        pref_data = json.load(f)

    output = {}
    print(f"{'都道府県':10}{'L0(17)':>10}{'L1(95)':>10}{'L2(~250)':>12}{'Orlando教科書':>14}")
    print("-" * 60)

    for pref_code in range(1, 48):
        d = pref_data.get(str(pref_code))
        if not d:
            continue

        # L0: 大分類17 (prefectures.json から取得済み)
        l0_ebm = d.get("ebm", 0.0)
        l0_basic_emp = d.get("basic_emp", 0.0)
        l0_basic_ratio = d.get("basic_ratio", 0.0)
        # 大分類の基盤業種数 (lq_table から数える)
        lq_table_records = d.get("lq_table", [])
        l0_n_basic = sum(1 for r in lq_table_records if r.get("lq", 0) > 1.0)

        # L1: 中分類95
        l1_ebm = d.get("ebm_mid", 0.0)
        l1_basic_ratio = d.get("basic_ratio_mid", 0.0)
        l1_n_basic = d.get("n_basic_industries_mid", 0)

        # L2: 中分類 + 卸売小売細分類
        area_code = f"{pref_code:02d}000"

        # 県内の中分類雇用を取得
        pref_mid = mid_df[mid_df["area_code"] == area_code]
        if pref_mid.empty:
            continue
        local_emp_mid = dict(zip(pref_mid["category_name"], pref_mid["employees"]))

        # 卸売・小売業 (G 大分類) の中分類業種を識別し、削除
        # 中分類コードで 50-61 を G 大分類とみなす
        pref_mid_codes = dict(zip(pref_mid["category_code"], pref_mid["category_name"]))
        wholesale_retail_names = {
            name for code, name in pref_mid_codes.items()
            if code in WHOLESALE_RETAIL_MID_CODES
        }

        # 中分類辞書から卸売・小売業を除外
        local_emp_l2 = {k: v for k, v in local_emp_mid.items() if k not in wholesale_retail_names}
        national_l2 = {k: v for k, v in national_mid.items() if k not in wholesale_retail_names}

        # 細分類の県データを追加
        pref_minor = minor_df[minor_df["area_code"] == area_code]
        if not pref_minor.empty:
            # 細分類は code を直接キーとする (重複回避のため "minor_XXXX" prefix)
            for _, row in pref_minor.iterrows():
                key = f"minor_{row['category_code']}"
                local_emp_l2[key] = float(row["employees"])
                national_l2[key] = float(national_minor.get(row["category_code"], 0))

        l2_ebm, l2_basic, l2_basic_ratio, l2_n_basic, l2_basics = compute_ebm_from_emp(local_emp_l2, national_l2)

        # minor_XXXX 形式のコードを実際の業種名に解決 (細分類は読みやすい名前で表示)
        def resolve_minor_name(raw: str) -> str:
            if raw.startswith("minor_"):
                code = raw[6:]
                return minor_code_to_name.get(code, raw)
            return raw
        for r in l2_basics:
            r["industry"] = resolve_minor_name(r.get("industry", ""))

        # L1 (中分類) の基盤業種一覧を取得 (prefectures.json の top_lq_industries_mid を再利用)
        l1_basics = d.get("top_lq_industries_mid") or []

        # L0 大分類の基盤業種は lq_table から
        l0_basics = [
            {"industry": r["industry"], "lq": r["lq"], "basic_emp_estimate": r["basic_emp_estimate"]}
            for r in lq_table_records if r.get("lq", 0) > 1.0
        ]

        # 新規追加された基盤業種を計算 (L1 で L0 になかったもの、L2 で L1 になかったもの)
        l0_names = {r.get("industry") for r in l0_basics}
        l1_names = {r.get("industry") for r in l1_basics}
        l2_names = {r.get("industry") for r in l2_basics}

        newly_l1 = [r for r in l1_basics if r.get("industry") not in l0_names][:10]
        newly_l2 = [r for r in l2_basics if r.get("industry") not in l1_names][:10]

        pref_name = PREFECTURES.get(pref_code, "")
        # 圧縮率: L2 が L0 の何%に圧縮されたか (低いほど粒度効果が大きい)
        compression_pct = (l2_ebm / l0_ebm * 100) if l0_ebm > 0 else 0
        output[str(pref_code)] = {
            "pref_name": pref_name,
            "compression_pct": round(compression_pct, 1),
            "ebm_reduction": round(l0_ebm - l2_ebm, 2),
            "in_textbook_range": l2_ebm <= 5.5,  # Orlando 4.94 ± 0.56
            "levels": [
                {
                    "label": "大分類17業種",
                    "n_industries": 17,
                    "ebm": round(l0_ebm, 2),
                    "basic_ratio_pct": round(l0_basic_ratio, 2),
                    "n_basic": l0_n_basic,
                    "basic_industries": [
                        {"name": r.get("industry", ""), "lq": round(r.get("lq", 0), 2)}
                        for r in l0_basics[:10]
                    ],
                },
                {
                    "label": "中分類95業種",
                    "n_industries": 95,
                    "ebm": round(l1_ebm, 2),
                    "basic_ratio_pct": round(l1_basic_ratio, 2),
                    "n_basic": l1_n_basic,
                    "basic_industries": [
                        {"name": r.get("industry", ""), "lq": round(r.get("lq", 0), 2)}
                        for r in l1_basics[:10]
                    ],
                    "newly_added": [
                        {"name": r.get("industry", ""), "lq": round(r.get("lq", 0), 2)}
                        for r in newly_l1
                    ],
                },
                {
                    "label": "中分類94 + 卸売小売細分類156",
                    "n_industries": len(local_emp_l2),
                    "ebm": round(l2_ebm, 2),
                    "basic_ratio_pct": round(l2_basic_ratio, 2),
                    "n_basic": l2_n_basic,
                    "newly_added": [
                        {"name": r.get("industry", ""), "lq": round(r.get("lq", 0), 2)}
                        for r in newly_l2
                    ],
                },
            ],
            "orlando_benchmark": {
                "ebm": 4.94,
                "basic_ratio_pct": 20.2,
                "n_basic": 7,
            },
        }

        # サンプル表示 (主要県のみ)
        if pref_code in (1, 13, 14, 23, 27, 40, 47):
            print(f"{pref_name:10}{l0_ebm:>10.2f}{l1_ebm:>10.2f}{l2_ebm:>12.2f}{'4.94':>14}")

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    print()
    print(f"保存: {OUTPUT_JSON} ({OUTPUT_JSON.stat().st_size / 1024:.1f} KB, {len(output)} 都道府県)")


if __name__ == "__main__":
    main()
