"""都市圏 EBM の現値を検証 — Tokyo/Osaka が本当に 11.41/28.98 なのか。

ユーザー指摘: 「再計算したら東京5台/大阪20台になったはず」
→ 実際の現データで再計算して確認。
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calculator import lq_table, total_basic_employment, economic_base_multiplier
from data.codes import METROPOLITAN_AREAS
from data_sources import MarketDataAccessor


def main():
    accessor = MarketDataAccessor()

    print(f"{'圏域':16}{'都道府県':24}{'総雇用':>14}{'基盤雇用':>12}{'基盤率':>8}{'EBM':>8}{'基盤業種数':>10}")
    print("-" * 95)

    for key, info in METROPOLITAN_AREAS.items():
        prefs = info["prefectures"]
        pref_names = " ".join([f"P{p:02d}" for p in prefs])

        # 1. メトロ合算 (都市圏)
        try:
            local_emp, national_emp, _ = accessor.metro_industry_employment(prefs)
            df = lq_table(local_emp, national_emp)
            basic = total_basic_employment(df)
            total = float(df["local_emp"].sum())
            ebm = economic_base_multiplier(total, basic)
            n_basic = int((df["lq"] > 1.0).sum())
            print(f"{info['name']:16}{pref_names:24}{total:>14,.0f}{basic:>12,.0f}{basic/total*100:>7.1f}%{ebm:>8.2f}{n_basic:>10}")
        except Exception as e:
            print(f"  {info['name']} ERROR: {e}")

    # 都道府県単独 (Tokyo/Osaka) も比較表示
    print()
    print(f"{'(参考) 都道府県単独':40}")
    print("-" * 95)
    for pc, name in [(13, "東京都"), (27, "大阪府"), (14, "神奈川"), (40, "福岡県")]:
        local_emp, national_emp, _ = accessor.industry_employment(pc, 0)
        df = lq_table(local_emp, national_emp)
        basic = total_basic_employment(df)
        total = float(df["local_emp"].sum())
        ebm = economic_base_multiplier(total, basic)
        n_basic = int((df["lq"] > 1.0).sum())
        print(f"{name:16}{'(単独)':24}{total:>14,.0f}{basic:>12,.0f}{basic/total*100:>7.1f}%{ebm:>8.2f}{n_basic:>10}")


if __name__ == "__main__":
    main()
