"""e-Stat 2016年中分類雇用テーブル(0003218646)のメタ情報を調査する。

H28 経済センサス活動調査 中分類×市区町村別 従業者数の構造を確認し、
2021年テーブル(0004005684)とのコードマッピングに必要な情報を抽出する。
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


TABLE_ID = "0003218646"


def main():
    settings = get_settings()
    if not settings.has_estat_key:
        print("ESTAT_APP_ID が未設定。")
        return

    client = create_estat_client(app_id=settings.estat_app_id, cache_dir=settings.cache_dir)

    # メタ情報取得
    print(f"=== テーブル {TABLE_ID} メタ情報 ===")
    resp = client.get("app/json/getMetaInfo", {"statsDataId": TABLE_ID, "lang": "J"})

    meta = resp.get("GET_META_INFO", {}).get("METADATA_INF", {})
    title = meta.get("TABLE_INF", {})
    print(f"統計名: {title.get('TITLE_SPEC', {}).get('TABLE_NAME', '')}")
    print(f"調査年: {title.get('SURVEY_DATE', '')}")
    print(f"主たる項目: {title.get('MAIN_CATEGORY', {}).get('@name', '')}")
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
        for c in classes[:30]:
            print(f"  {c.get('@code', '')}: {c.get('@name', '')}")
        if len(classes) > 30:
            print(f"  ... ({len(classes) - 30} more)")
        print()

    # サンプル取得（1件だけ）
    print("=== サンプルレコード取得 (limit=5) ===")
    sample = client.get("app/json/getStatsData", {
        "lang": "J",
        "statsDataId": TABLE_ID,
        "limit": 5,
    })
    try:
        values = sample["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
        if isinstance(values, dict):
            values = [values]
        for v in values:
            print(json.dumps(v, ensure_ascii=False, indent=2))
    except (KeyError, TypeError) as e:
        print(f"サンプル取得失敗: {e}")


if __name__ == "__main__":
    main()
