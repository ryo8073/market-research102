"""経済センサス活動調査 細分類 (4桁JSIC、約1,400業種) のテーブル ID を調査。

都道府県レベルで細分類別従業者数が取れるテーブルを探す。
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

from api.estat import create_estat_client
from config import get_settings


def main():
    settings = get_settings()
    if not settings.has_estat_key:
        print("ESTAT_APP_ID 未設定")
        return

    client = create_estat_client(app_id=settings.estat_app_id, cache_dir=settings.cache_dir)

    # 検索: 経済センサス 細分類 民営事業所
    print("=== 経済センサス活動調査 細分類別テーブル検索 ===\n")
    for keyword in [
        "経済センサス活動調査 産業細分類",
        "経済センサス 細分類別事業所数",
        "産業細分類別 民営事業所",
    ]:
        print(f"\n--- 検索: '{keyword}' ---")
        try:
            results = client.search_stats(keyword, survey_years="202106", limit=10)
            for r in results:
                name = r.get("TITLE_SPEC", {}).get("TABLE_NAME", "")
                stats_id = r.get("@id", "")
                gov = r.get("STATISTICS_NAME", "")
                print(f"  {stats_id}: {name[:80]}")
                if gov and "活動調査" in gov:
                    print(f"     -> {gov[:80]}")
        except Exception as e:
            print(f"  ERROR: {e}")


if __name__ == "__main__":
    main()
