"""e-Stat 0003218646 (H28経済センサス 中分類 民営事業所 従業者数) を取得し
2021年中分類テーブル(0004005684)と整合した CSV を生成する。

シフトシェア中分類版 (2016→2021) の t0 データとして使用。

H28 cat01 コードは 5桁 (例: "00040") だが、業種名に 2桁 JSIC 中分類コード
を含む (例: "01農業")。これを抽出して R3 と同じ 2桁コードに正規化する。

集約カテゴリ (A~R全産業、A~B農林漁業、A農業，林業 等) は業種名の
先頭が 2桁数字でないことで識別してスキップする。

両テーブルとも民営事業所のみ → 公務 (S) は含まない → 直接比較可能。
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

TABLE_ID = "0003218646"
OUTPUT_CSV = "census_employment_mid_2016.csv"
TAB_EMP_TOTAL = "005"   # 従業者数 総数

# 業種名先頭の 2桁数字を JSIC 中分類コードとして抽出
MID_CODE_PATTERN = re.compile(r"^(\d{2})")


def main():
    settings = get_settings()
    if not settings.has_estat_key:
        print("ESTAT_APP_ID が未設定。.env に設定してください。")
        return

    cache_path = settings.cache_dir / OUTPUT_CSV
    if cache_path.exists():
        print(f"既存キャッシュ検出: {cache_path}")
        print("既存ファイルを削除してから再実行してください。")
        return

    client = create_estat_client(app_id=settings.estat_app_id, cache_dir=settings.cache_dir)

    print(f"=== 2016年中分類従業者数 (テーブル {TABLE_ID}) ===")
    print(f"フィルタ: tab={TAB_EMP_TOTAL} (従業者数 総数)")
    print(f"推定件数: 95業種 × 1900地域 ≒ 18万レコード")
    print()

    params = {
        "lang": "J",
        "statsDataId": TABLE_ID,
        "cdTab": TAB_EMP_TOTAL,
    }

    all_values = _fetch_all_values(client, params)
    if not all_values:
        print("データ取得失敗")
        return

    area_names = _fetch_meta_names(client, TABLE_ID, "area")
    cat_names = _fetch_meta_names(client, TABLE_ID, "cat01")

    rows = []
    skipped_aggregate = 0
    for v in all_values:
        h28_code = v.get("@cat01", "")
        name = cat_names.get(h28_code, "")
        m = MID_CODE_PATTERN.match(name)
        if not m:
            # 集約カテゴリ (00010 "A~R全産業", 00030 "A農業，林業" 等)
            skipped_aggregate += 1
            continue
        mid_code = m.group(1)
        # 業種名から先頭の 2桁を除去 (R3 と同じ表記に揃える)
        clean_name = name[2:]

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
            "category_code": mid_code,
            "category_name": clean_name,
            "employees": value,
        })

    df = pd.DataFrame(rows)
    print(f"パース完了: {len(df)} 行 ({df['area_code'].nunique()} 地域 × {df['category_code'].nunique()} 業種)")
    print(f"集約カテゴリスキップ: {skipped_aggregate} レコード")

    # 全国は area_code "00000" が含まれていない可能性 → 47都道府県合計で算出
    if "00000" not in df["area_code"].values:
        pref_codes = [f"{i:02d}000" for i in range(1, 48)]
        pref_df = df[df["area_code"].isin(pref_codes)]
        national = (
            pref_df.groupby(["category_code", "category_name"], as_index=False)["employees"]
            .sum()
        )
        national["area_code"] = "00000"
        national["area_name"] = "全国"
        national = national[["area_code", "area_name", "category_code", "category_name", "employees"]]
        df = pd.concat([national, df], ignore_index=True)
        print(f"全国合計を 47都道府県集計で追加: {len(national)} 業種")

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(cache_path, index=False, encoding="utf-8-sig")
    print(f"保存: {cache_path} ({cache_path.stat().st_size / 1024:.1f} KB)")

    # 検証
    nat = df[df["area_code"] == "00000"]
    print()
    print("=== 検証 ===")
    print(f"全国業種数: {len(nat)}")
    print(f"全国合計: {nat['employees'].sum():,.0f} 人")
    print(f"参考: 2021年中分類版 = 57,936,229 人")
    print()
    print("=== 上位10業種 ===")
    print(nat.nlargest(10, "employees")[["category_code", "category_name", "employees"]].to_string(index=False))


if __name__ == "__main__":
    main()
