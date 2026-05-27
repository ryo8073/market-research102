"""e-Stat 0004003257 (卸売業・小売業 細分類 都道府県別) の取得。

Mulligan & Murphy (1995) の LQ 凸性質を、卸売・小売業セクターで
4桁細分類まで拡張する。

データ範囲:
  - 約100業種 (卸売31 + 小売73 + 集約コード除外)
  - 都道府県47 + 全国 + 主要政令市
  - 民営事業所のみ

教育的価値:
  「百貨店」「コンビニ」「ドラッグストア」「家電量販店」「自動車販売」など
  具体的な小売業態の地域特化が見える。商業不動産のテナント想定に直結。

Output: data/cache/census_retail_minor_2021.csv
Columns: area_code, area_name, category_code (4digit), category_name, employees
"""
from __future__ import annotations

import io
import logging
import re
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

import pandas as pd

from api.estat import create_estat_client
from config import get_settings
from data.census_cache import _fetch_all_values, _fetch_meta_names

TABLE_ID = "0004003257"
OUTPUT_CSV = "census_retail_minor_2021.csv"

TAB_EMP_TOTAL = "723-2021"   # 従業者数_合計
CAT02_TOTAL = "0"            # 従業者規模: 合計

# 4桁の細分類コードのみを残す (50, 51 などの2桁=大分類、501,512 などの3桁=中分類、
# I, I1, I2 などのアルファベット集約コードはすべてスキップ)
MINOR_CODE_PATTERN = re.compile(r"^\d{4}$")


def main():
    settings = get_settings()
    if not settings.has_estat_key:
        print("ESTAT_APP_ID 未設定")
        return

    cache_path = settings.cache_dir / OUTPUT_CSV
    if cache_path.exists():
        print(f"既存キャッシュ検出: {cache_path}")
        print("削除して再実行してください")
        return

    client = create_estat_client(app_id=settings.estat_app_id, cache_dir=settings.cache_dir)

    print(f"=== 卸売・小売業 細分類 都道府県別 (テーブル {TABLE_ID}) ===")
    print(f"フィルタ: tab={TAB_EMP_TOTAL} (従業者数合計), cat02={CAT02_TOTAL} (従業者規模合計)")
    print()

    params = {
        "lang": "J",
        "statsDataId": TABLE_ID,
        "cdTab": TAB_EMP_TOTAL,
        "cdCat02": CAT02_TOTAL,
    }
    all_values = _fetch_all_values(client, params)
    if not all_values:
        print("データ取得失敗")
        return

    area_names = _fetch_meta_names(client, TABLE_ID, "area")
    cat_names = _fetch_meta_names(client, TABLE_ID, "cat01")

    rows = []
    skipped_agg = 0
    for v in all_values:
        code = v.get("@cat01", "")
        if not MINOR_CODE_PATTERN.match(code):
            skipped_agg += 1
            continue
        name = cat_names.get(code, code)
        # 「(従業者が常時100人以上のもの)」等の従業者規模注記がついた業種は除外
        # 既にcat02でフィルタしているはずだが念のため
        if "従業者が常時" in name or "(従業者" in name:
            continue

        val_str = str(v.get("$", ""))
        if val_str in ("-", "", "…", "x", "***", "X"):
            continue
        try:
            value = float(val_str.replace(",", ""))
        except ValueError:
            continue

        area_code = v.get("@area", "")
        rows.append({
            "area_code": area_code,
            "area_name": area_names.get(area_code, area_code),
            "category_code": code,
            "category_name": name,
            "employees": value,
        })

    df = pd.DataFrame(rows)
    n_categories = df["category_code"].nunique()
    n_areas = df["area_code"].nunique()
    print(f"パース完了: {len(df)} 行 ({n_areas} 地域 × {n_categories} 業種)")
    print(f"集約コードスキップ: {skipped_agg} レコード")

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(cache_path, index=False, encoding="utf-8-sig")
    print(f"保存: {cache_path} ({cache_path.stat().st_size / 1024:.1f} KB)")

    # 検証
    nat = df[df["area_code"] == "00000"]
    print()
    print(f"=== 全国検証 ===")
    print(f"全国業種数: {len(nat)}")
    print(f"全国合計従業者数: {nat['employees'].sum():,.0f} 人")
    print()
    print("上位10業種:")
    print(nat.nlargest(10, "employees")[["category_code", "category_name", "employees"]].to_string(index=False))


if __name__ == "__main__":
    main()
