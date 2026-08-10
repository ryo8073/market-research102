"""2020年国勢調査 住宅の所有関係別世帯数を e-Stat から取得しCSVキャッシュする。

データ: 国勢調査 2020年 人口等基本集計
テーブル: 0003445123 (住宅の所有の関係別一般世帯数 - 市区町村)

cat01コード:
  0: 総数 / 1: 住宅に住む一般世帯 / 11: 主世帯
  111: 持ち家 / 112: 公営・都市再生機構・公社の借家 / 113: 民営の借家 / 114: 給与住宅

出力: data/cache/census_housing_tenure_2020.csv

使い方: python scripts/download_housing_tenure.py
"""
from __future__ import annotations
import io, sys, json, urllib.parse, urllib.request, os, time
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

APP_ID = os.environ.get("ESTAT_APP_ID", "")
BASE = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
CACHE_DIR = ROOT / "data" / "cache"
OUT_CSV = CACHE_DIR / "census_housing_tenure_2020.csv"

TABLE_ID = "0003445123"
TIME_CODE = "2020000000"

# 取得するカテゴリコードと対応フィールド名
CATS = {
    "0": "total",           # 総数
    "111": "owned",         # 持ち家
    "112": "rented_public", # 公営・都市再生機構・公社の借家
    "113": "rented_private",# 民営の借家
    "114": "rented_company",# 給与住宅（社宅）
}


def _fetch(params: dict) -> list[dict]:
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


def _fetch_area_names() -> dict[str, str]:
    url = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?" + urllib.parse.urlencode(
        {"appId": APP_ID, "lang": "J", "statsDataId": TABLE_ID}
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
        raise SystemExit("ESTAT_APP_ID が .env に設定されていません")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print("地域名を取得中...")
    area_names = _fetch_area_names()
    print(f"  {len(area_names)} 地域")

    import pandas as pd
    records: dict[str, dict] = {}

    for cat_code, field_name in CATS.items():
        print(f"\n--- {field_name} (cat01={cat_code}) ---")
        values = _fetch({
            "statsDataId": TABLE_ID,
            "cdTab": "2020_16",
            "cdCat01": cat_code,
            "cdTime": TIME_CODE,
        })
        count = 0
        for v in values:
            val = _num(v.get("$", ""))
            if val is None:
                continue
            ac = v.get("@area", "").strip()
            # 旧市区町村コード（B付き等）を除外
            if not ac.isdigit():
                continue
            ac = ac.zfill(5)
            an = area_names.get(v.get("@area", ""), ac)
            if ac not in records:
                records[ac] = {"area_code": ac, "area_name": an}
            records[ac][field_name] = int(val)
            count += 1
        print(f"  → {count} 件")
        time.sleep(0.3)

    # 借家合計と比率を計算
    for rec in records.values():
        total = rec.get("total", 0)
        pub = rec.get("rented_public", 0)
        priv = rec.get("rented_private", 0)
        comp = rec.get("rented_company", 0)
        rec["rented_total"] = pub + priv + comp
        if total > 0:
            rec["owned_pct"] = round(rec.get("owned", 0) / total * 100, 1)
            rec["rented_pct"] = round(rec["rented_total"] / total * 100, 1)
            rec["rented_private_pct"] = round(priv / total * 100, 1)

    df = pd.DataFrame(list(records.values()))
    cols = ["area_code", "area_name", "total", "owned", "owned_pct",
            "rented_total", "rented_pct", "rented_public", "rented_private",
            "rented_private_pct", "rented_company"]
    for c in cols:
        if c not in df.columns:
            df[c] = None
    df = df[cols].sort_values("area_code").reset_index(drop=True)

    df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
    print(f"\n保存: {OUT_CSV}")
    print(f"レコード: {len(df)} / 地域: {df['area_code'].nunique()}")

    # サマリー
    prefs = df[df["area_code"].str.endswith("000")].head(10)
    print("\n都道府県サマリー:")
    print(prefs[["area_code", "area_name", "total", "rented_pct", "rented_private_pct"]].to_string(index=False))


if __name__ == "__main__":
    main()
