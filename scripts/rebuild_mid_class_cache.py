"""中分類従業者数キャッシュを正しいテーブル（0004005684）で再構築する。

旧版（0004005686）は『国及び地方公共団体』限定のため民営事業所が
含まれず、製造業・卸売・小売等の値がほぼゼロになる重大バグがあった。
"""
from __future__ import annotations

import io
import logging
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

from api.estat import create_estat_client
from config import get_settings
from data.census_cache import DS_EMPLOYMENT_MID, download_dataset


def main():
    settings = get_settings()
    if not settings.has_estat_key:
        print("ESTAT_APP_ID が未設定。.env に設定してください。")
        return
    client = create_estat_client(app_id=settings.estat_app_id, cache_dir=settings.cache_dir)
    print(f"対象テーブル: {DS_EMPLOYMENT_MID.table_id}")
    print(f"出力ファイル: {settings.cache_dir / DS_EMPLOYMENT_MID.csv_name}")
    print(f"目標件数: 約560万件（ページング100,000件 × 約56ページ）")
    print(f"推定所要時間: 3〜10分")
    print()
    df = download_dataset(client, DS_EMPLOYMENT_MID, settings.cache_dir)
    if df.empty:
        print("ダウンロード失敗。")
        return

    # 検証: 全国合計と業種数
    nat = df[df["area_code"] == "00000"]
    total = nat["employees"].sum()
    print()
    print(f"=== 検証 ===")
    print(f"全国業種数: {len(nat)}")
    print(f"全国合計: {total:,.0f} 人")
    print(f"参考: 大分類版全国合計 = 61,476,143 人")
    print(f"  → 中分類は公務(S)を含まないため少なめになる（民営事業所のみ）")
    print()
    print(f"=== 上位10業種 ===")
    print(nat.nlargest(10, "employees")[["category_code", "category_name", "employees"]].to_string(index=False))


if __name__ == "__main__":
    main()
