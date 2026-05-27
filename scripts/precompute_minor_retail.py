"""卸売・小売業 細分類 LQ を都道府県レベルで事前計算し JSON 化。

Output: ci102-nextjs/public/data/minor_retail_lq.json
形式:
{
  "13": {  // pref_code (string key)
    "pref_name": "東京都",
    "top_lq": [
      { "code": "5891", "name": "コンビニエンスストア", "lq": 1.45, "local_emp": 12345, "national_emp": 368072 },
      ...
    ]
  },
  ...
}
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

from data.codes import PREFECTURES

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CACHE_CSV = PROJECT_ROOT / "data" / "cache" / "census_retail_minor_2021.csv"
OUTPUT_JSON = PROJECT_ROOT / "ci102-nextjs" / "public" / "data" / "minor_retail_lq.json"


def compute_lq(local: dict[str, float], national: dict[str, float],
               local_total: float, national_total: float) -> dict[str, dict]:
    """各業種の LQ を計算。

    LQ = (local_i / local_total) / (national_i / national_total)
    """
    result = {}
    if national_total <= 0 or local_total <= 0:
        return result
    for code, l_emp in local.items():
        n_emp = national.get(code, 0)
        if n_emp <= 0 or l_emp <= 0:
            continue
        local_share = l_emp / local_total
        national_share = n_emp / national_total
        lq = local_share / national_share if national_share > 0 else 0
        result[code] = {
            "lq": lq,
            "local_emp": l_emp,
            "national_emp": n_emp,
        }
    return result


def main():
    if not CACHE_CSV.exists():
        print(f"キャッシュなし: {CACHE_CSV}")
        print("先に scripts/download_minor_retail.py を実行してください")
        return

    print(f"読込: {CACHE_CSV}")
    df = pd.read_csv(CACHE_CSV, dtype={"area_code": str, "category_code": str})
    print(f"  {len(df)} 行 × {df['category_code'].nunique()} 業種 × {df['area_code'].nunique()} 地域")

    # コード→名称のマッピング (全国データから)
    nat_df = df[df["area_code"] == "00000"]
    code_to_name = dict(zip(nat_df["category_code"], nat_df["category_name"]))
    national_emp = dict(zip(nat_df["category_code"], nat_df["employees"]))
    national_total = nat_df["employees"].sum()

    output = {}
    for pref_code in range(1, 48):
        area = f"{pref_code:02d}000"
        pref_df = df[df["area_code"] == area]
        if pref_df.empty:
            continue
        local_emp = dict(zip(pref_df["category_code"], pref_df["employees"]))
        local_total = pref_df["employees"].sum()
        lq_dict = compute_lq(local_emp, national_emp, local_total, national_total)

        # Top 20 by LQ (基盤雇用比率: local_emp が一定以上ないとノイズ)
        ranked = sorted(lq_dict.items(), key=lambda x: x[1]["lq"], reverse=True)
        # 雇用50人未満は除外 (極端な LQ の発生源)
        top_lq = [
            {
                "code": code,
                "name": code_to_name.get(code, code),
                "lq": round(info["lq"], 2),
                "local_emp": int(info["local_emp"]),
                "national_emp": int(info["national_emp"]),
            }
            for code, info in ranked
            if info["local_emp"] >= 50
        ][:20]

        output[str(pref_code)] = {
            "pref_name": PREFECTURES.get(pref_code, ""),
            "pref_total_emp": int(local_total),
            "top_lq": top_lq,
        }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = OUTPUT_JSON.stat().st_size / 1024
    print(f"\n保存: {OUTPUT_JSON} ({size_kb:.1f} KB, {len(output)} 都道府県)")

    # サンプル表示
    print("\n=== サンプル: 東京都 (13) の Top 5 ===")
    for entry in output.get("13", {}).get("top_lq", [])[:5]:
        print(f"  LQ {entry['lq']:5.2f}: {entry['name'][:30]} ({entry['local_emp']:,}人)")

    print("\n=== サンプル: 沖縄県 (47) の Top 5 ===")
    for entry in output.get("47", {}).get("top_lq", [])[:5]:
        print(f"  LQ {entry['lq']:5.2f}: {entry['name'][:30]} ({entry['local_emp']:,}人)")


if __name__ == "__main__":
    main()
