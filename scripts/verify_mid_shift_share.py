"""中分類シフトシェアの動作検証。

東京・横浜・大阪・地方都市の代表サンプルで:
  - 大分類版と中分類版のRS合計を比較
  - top RS industry の違いを確認
  - 中分類の方が業種解像度が高いため、より精緻な競争要因が見えるはず
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calculator import shift_share_table
from data_sources import MarketDataAccessor


def main():
    accessor = MarketDataAccessor()
    cases = [
        (13, 0, "東京都"),
        (14, 14100, "横浜市"),
        (27, 27100, "大阪市（大阪府）"),
        (40, 40130, "福岡市"),
        (37, 37201, "高松市"),
        (47, 47201, "那覇市"),
        (1, 1100, "札幌市"),
    ]

    print(f"{'地域':12}{'粒度':6}{'業種数':6}{'RS合計':>14}{'実雇用変化':>14}{'Top業種':25}{'Top RS値':>12}")
    print("-" * 100)

    for pref, city, name in cases:
        # 大分類
        l0, l1, n0, n1, _ = accessor.shift_share_inputs(pref, city)
        if l0 and l1:
            df_major = shift_share_table(l0, l1, n0, n1)
            rs_major = df_major["regional_shift"].sum()
            chg_major = df_major["actual_change"].sum()
            top_major = df_major.loc[df_major["regional_shift"].idxmax()]
            print(f"{name:12}{'大分類':6}{len(df_major):6d}{rs_major:14,.0f}{chg_major:14,.0f}  {str(top_major['industry'])[:22]:25}{top_major['regional_shift']:12,.0f}")

        # 中分類
        l0m, l1m, n0m, n1m, _ = accessor.shift_share_inputs_mid(pref, city)
        if l0m and l1m:
            df_mid = shift_share_table(l0m, l1m, n0m, n1m)
            rs_mid = df_mid["regional_shift"].sum()
            chg_mid = df_mid["actual_change"].sum()
            top_mid = df_mid.loc[df_mid["regional_shift"].idxmax()]
            print(f"{name:12}{'中分類':6}{len(df_mid):6d}{rs_mid:14,.0f}{chg_mid:14,.0f}  {str(top_mid['industry'])[:22]:25}{top_mid['regional_shift']:12,.0f}")
        else:
            print(f"{name:12}{'中分類':6}  データなし")
        print()


if __name__ == "__main__":
    main()
