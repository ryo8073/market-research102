"""卸売・小売業 細分類 都道府県別テーブル (0004003257) を調査。"""
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


TABLE_ID = "0004003257"


def main():
    settings = get_settings()
    client = create_estat_client(app_id=settings.estat_app_id, cache_dir=settings.cache_dir)

    print(f"=== テーブル {TABLE_ID} メタ情報 ===\n")
    resp = client.get("app/json/getMetaInfo", {"statsDataId": TABLE_ID, "lang": "J"})
    meta = resp.get("GET_META_INFO", {}).get("METADATA_INF", {})
    title = meta.get("TABLE_INF", {}).get("TITLE_SPEC", {})
    print(f"統計名: {title.get('TABLE_NAME', '')}")
    print()

    class_objs = meta.get("CLASS_INF", {}).get("CLASS_OBJ", [])
    if isinstance(class_objs, dict):
        class_objs = [class_objs]

    for obj in class_objs:
        cid = obj.get("@id", "")
        cname = obj.get("@name", "")
        classes = obj.get("CLASS", [])
        if isinstance(classes, dict):
            classes = [classes]
        print(f"--- {cid}: {cname} ({len(classes)} items) ---")
        for c in classes[:20]:
            print(f"  {c.get('@code', '')}: {c.get('@name', '')[:60]}")
        if len(classes) > 20:
            print(f"  ... ({len(classes) - 20} more)")
        print()

    # サンプル取得
    print("=== サンプルレコード (limit=5) ===")
    sample = client.get("app/json/getStatsData", {
        "statsDataId": TABLE_ID,
        "lang": "J",
        "limit": 5,
    })
    try:
        values = sample["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
        if isinstance(values, dict):
            values = [values]
        for v in values:
            print(json.dumps(v, ensure_ascii=False))
    except (KeyError, TypeError) as e:
        print(f"取得失敗: {e}")


if __name__ == "__main__":
    main()
