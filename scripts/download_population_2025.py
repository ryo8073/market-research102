"""令和7年（2025年）国勢調査 人口速報集計を e-Stat からダウンロードしキャッシュする。"""
from __future__ import annotations
import io, sys, json, urllib.parse, urllib.request, os
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
OUT_CSV = CACHE_DIR / "census_population_2025.csv"

TABLE_POP = "0004050397"
TABLE_HH = "0004050417"

def _fetch(params: dict) -> list[dict]:
    all_values: list[dict] = []
    start = 1
    while True:
        p = {**params, "appId": APP_ID, "lang": "J", "limit": 100000, "startPosition": start}
        url = BASE + "?" + urllib.parse.urlencode(p)
        with urllib.request.urlopen(url, timeout=60) as r:
            d = json.load(r)
        try:
            values = d["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
        except (KeyError, TypeError):
            values = []
        if isinstance(values, dict): values = [values]
        all_values.extend(values)
        print(f"  取得済み: {len(all_values)} レコード")
        if len(values) < 100000: break
        start += 100000
    return all_values

def _fetch_meta(table_id: str, meta_id: str) -> dict[str, str]:
    url = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?" + urllib.parse.urlencode({"appId": APP_ID, "lang": "J", "statsDataId": table_id})
    with urllib.request.urlopen(url, timeout=60) as r:
        d = json.load(r)
    objs = d["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
    for o in objs:
        if o.get("@id") == meta_id:
            cl = o.get("CLASS", [])
            if isinstance(cl, dict): cl = [cl]
            return {c["@code"]: c["@name"] for c in cl}
    return {}

def _num(s: str) -> float | None:
    s = str(s).strip()
    if s in ("-", "", "…", "x", "***", "X", "*", "N/A"): return None
    try: return float(s.replace(",", ""))
    except ValueError: return None

def main():
    if not APP_ID: raise SystemExit("ESTAT_APP_ID missing")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []

    print(f"DL: 2025 POP ({TABLE_POP})")
    area_names = _fetch_meta(TABLE_POP, "area")
    pop_values = _fetch({"statsDataId": TABLE_POP, "cdCat01": "0"})
    for v in pop_values:
        val = _num(v.get("$", ""))
        if val is None: continue
        ac = v.get("@area", "")
        rows.append({"area_code": ac, "area_name": area_names.get(ac, ac), "category_code": "2025_01", "category_name": "人口", "value": val})

    print(f"DL: 2025 HH/DENS ({TABLE_HH})")
    area_names2 = _fetch_meta(TABLE_HH, "area")
    tab_names = _fetch_meta(TABLE_HH, "tab")
    hh_values = _fetch({"statsDataId": TABLE_HH})
    for v in hh_values:
        val = _num(v.get("$", ""))
        if val is None: continue
        ac = v.get("@area", "")
        tab = v.get("@tab", "")
        rows.append({"area_code": ac, "area_name": area_names2.get(ac, ac), "category_code": tab, "category_name": tab_names.get(tab, tab), "value": val})

    import pandas as pd
    df = pd.DataFrame(rows)
    df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
    print(f"Saved: {OUT_CSV}")
    print(f"Rows: {len(df)} / Areas: {df['area_code'].nunique()}")

if __name__ == "__main__": main()
