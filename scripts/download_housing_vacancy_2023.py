"""令和5年(2023年) 住宅・土地統計調査 — 住宅数＋空き家数を市区町村別に取得しCSVキャッシュする。

テーブル:
  0004021628: 住宅の所有の関係(2区分)別住宅数 — 市区町村
    tab=01-2023, cat01: 0=総数, 1=持ち家, 2=借家
  0004021631: 空き家の種類(4区分)別空き家数 — 市区町村
    tab=03-2023, cat04: 0=総数, 2=賃貸用, 3=売却用, 4=二次的住宅
    (cat01=0, cat02=0, cat03=0 で腐朽有無・建て方・構造は総数に固定)

出力: data/cache/census_housing_vacancy_2023.csv
  area_code, area_name, total_dwellings, owned, rental,
  owned_pct, rental_pct,
  vacancy_total, vacancy_rental, vacancy_sales, vacancy_secondary, vacancy_other,
  vacancy_rate_pct, rental_vacancy_rate_pct

使い方: python scripts/download_housing_vacancy_2023.py
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "ci102-nextjs" / ".env.local")

APP_ID = os.environ.get("ESTAT_APP_ID", "")
BASE = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
CACHE_DIR = ROOT / "data" / "cache"
OUT_CSV = CACHE_DIR / "census_housing_vacancy_2023.csv"

# テーブル1: 住宅数(持ち家/借家)
TABLE_DWELLINGS = "0004021628"
# テーブル2: 空き家数(種類別)
TABLE_VACANCY = "0004021631"

TIME_CODE = "2023000000"


def _fetch(params: dict, table_id: str) -> list[dict]:
    """ページネーション付きでe-Stat APIからデータ取得。"""
    all_values: list[dict] = []
    start = 1
    while True:
        p = {**params, "appId": APP_ID, "lang": "J", "limit": 100000, "startPosition": start}
        url = BASE + "?" + urllib.parse.urlencode(p)
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                d = json.load(r)
        except Exception as e:
            print(f"  ERROR: {e}")
            break
        try:
            values = d["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
        except (KeyError, TypeError):
            values = []
        if isinstance(values, dict):
            values = [values]
        all_values.extend(values)
        print(f"  取得済み: {len(all_values)} レコード")
        if len(values) < 100000:
            break
        start += 100000
        time.sleep(0.5)
    return all_values


def _fetch_area_names(table_id: str) -> dict[str, str]:
    """地域コード→名称マッピングを取得。"""
    url = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?" + urllib.parse.urlencode(
        {"appId": APP_ID, "lang": "J", "statsDataId": table_id}
    )
    with urllib.request.urlopen(url, timeout=60) as r:
        d = json.load(r)
    objs = d["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
    for o in objs:
        if o.get("@id") == "area":
            cl = o.get("CLASS", [])
            if isinstance(cl, dict):
                cl = [cl]
            return {c["@code"]: c["@name"] for c in cl}
    return {}


def _num(s: str) -> float | None:
    s = str(s).strip()
    if s in ("-", "", "...", "x", "***", "X", "*", "N/A", "..."):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def main():
    if not APP_ID:
        raise SystemExit("ESTAT_APP_ID が .env または ci102-nextjs/.env.local に設定されていません")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if OUT_CSV.exists():
        print(f"キャッシュ済み: {OUT_CSV}")
        print("再取得するには削除してから実行してください。")
        return

    import pandas as pd

    print("地域名を取得中...")
    area_names = _fetch_area_names(TABLE_DWELLINGS)
    print(f"  {len(area_names)} 地域")

    records: dict[str, dict] = {}

    # ---- テーブル1: 住宅数（持ち家/借家） ----
    DWELLING_CATS = {
        "0": "total_dwellings",  # 総数
        "1": "owned",            # 持ち家
        "2": "rental",           # 借家
    }
    for cat_code, field_name in DWELLING_CATS.items():
        print(f"\n--- 住宅数: {field_name} (cat01={cat_code}) ---")
        values = _fetch({
            "statsDataId": TABLE_DWELLINGS,
            "cdTab": "01-2023",
            "cdCat01": cat_code,
            "cdTime": TIME_CODE,
        }, TABLE_DWELLINGS)
        count = 0
        for v in values:
            val = _num(v.get("$", ""))
            if val is None:
                continue
            ac = v.get("@area", "").strip()
            if not ac.isdigit():
                continue
            ac = ac.zfill(5)
            an = area_names.get(v.get("@area", ""), ac)
            if ac not in records:
                records[ac] = {"area_code": ac, "area_name": an}
            records[ac][field_name] = int(val)
            count += 1
        print(f"  → {count} 件")
        time.sleep(0.5)

    # ---- テーブル2: 空き家数（種類別） ----
    # cat01=0(腐朽有無:総数), cat02=0(建て方:総数), cat03=0(構造:総数) で固定
    # cat04 で空き家種類を切替
    VACANCY_CATS = {
        "0": "vacancy_total",      # 空き家総数
        "2": "vacancy_rental",     # 賃貸用の空き家
        "3": "vacancy_sales",      # 売却用の空き家
        "4": "vacancy_secondary",  # 二次的住宅
        "1": "vacancy_other",      # 賃貸・売却用及び二次的住宅を除く空き家
    }
    for cat_code, field_name in VACANCY_CATS.items():
        print(f"\n--- 空き家: {field_name} (cat04={cat_code}) ---")
        values = _fetch({
            "statsDataId": TABLE_VACANCY,
            "cdTab": "03-2023",
            "cdCat01": "0",  # 腐朽有無: 総数
            "cdCat02": "0",  # 建て方: 総数
            "cdCat03": "0",  # 構造: 総数
            "cdCat04": cat_code,
            "cdTime": TIME_CODE,
        }, TABLE_VACANCY)
        count = 0
        for v in values:
            val = _num(v.get("$", ""))
            if val is None:
                continue
            ac = v.get("@area", "").strip()
            if not ac.isdigit():
                continue
            ac = ac.zfill(5)
            an = area_names.get(v.get("@area", ""), ac)
            if ac not in records:
                records[ac] = {"area_code": ac, "area_name": an}
            records[ac][field_name] = int(val)
            count += 1
        print(f"  → {count} 件")
        time.sleep(0.5)

    # ---- 比率計算 ----
    for rec in records.values():
        total = rec.get("total_dwellings", 0)
        if total > 0:
            rec["owned_pct"] = round(rec.get("owned", 0) / total * 100, 1)
            rec["rental_pct"] = round(rec.get("rental", 0) / total * 100, 1)
            vac = rec.get("vacancy_total", 0)
            rec["vacancy_rate_pct"] = round(vac / total * 100, 1)
        rental = rec.get("rental", 0)
        vac_rental = rec.get("vacancy_rental", 0)
        if rental > 0:
            rec["rental_vacancy_rate_pct"] = round(vac_rental / rental * 100, 1)

    # ---- CSV出力 ----
    df = pd.DataFrame(list(records.values()))
    cols = [
        "area_code", "area_name",
        "total_dwellings", "owned", "rental",
        "owned_pct", "rental_pct",
        "vacancy_total", "vacancy_rental", "vacancy_sales",
        "vacancy_secondary", "vacancy_other",
        "vacancy_rate_pct", "rental_vacancy_rate_pct",
    ]
    for c in cols:
        if c not in df.columns:
            df[c] = 0
    df = df[cols].sort_values("area_code")
    df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
    print(f"\n保存: {OUT_CSV}")
    print(f"  {len(df)} 地域")

    # サンプル確認
    print("\n=== サンプル（東京都千代田区〜港区） ===")
    sample = df[df["area_code"].isin(["13101", "13102", "13103"])]
    for _, r in sample.iterrows():
        print(f"  {r['area_code']} {r['area_name']}: "
              f"住宅{r['total_dwellings']:,} / 空き家率{r['vacancy_rate_pct']}% / "
              f"賃貸用空き家率{r['rental_vacancy_rate_pct']}%")

    # 全国
    nat = df[df["area_code"] == "00000"]
    if not nat.empty:
        r = nat.iloc[0]
        print(f"\n  全国: 住宅{r['total_dwellings']:,} / 空き家率{r['vacancy_rate_pct']}%")


if __name__ == "__main__":
    main()
