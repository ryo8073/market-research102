"""prefectures.json と municipalities/*.json に人口時系列データを追加する。

入力:
  data/cache/census_population_timeseries.csv
  ci102-nextjs/public/data/prefectures.json
  ci102-nextjs/public/data/municipalities/*.json

出力:
  同ファイルに pop_timeseries フィールドを追加/更新:
  {
    "pop_timeseries": [
      {"year": 2000, "population": 12345678, "households": 4567890, "pop_under15": 1234567, "pop_over65": 2345678},
      {"year": 2005, ...},
      ...
    ]
  }

使い方:
  python scripts/enrich_json_timeseries.py
"""
from __future__ import annotations
import io, sys, json
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "cache" / "census_population_timeseries.csv"
PREF_JSON = ROOT / "ci102-nextjs" / "public" / "data" / "prefectures.json"
MUNI_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "municipalities"


def build_timeseries(df: pd.DataFrame, area_code: str) -> list[dict] | None:
    """指定area_codeの時系列を辞書リストで返す。"""
    rows = df[df["area_code"] == area_code].sort_values("year")
    if rows.empty:
        return None
    result = []
    for _, r in rows.iterrows():
        entry: dict = {"year": int(r["year"])}
        if pd.notna(r.get("population")):
            entry["population"] = int(r["population"])
        if pd.notna(r.get("households")):
            entry["households"] = int(r["households"])
        if pd.notna(r.get("pop_under15")):
            entry["pop_under15"] = int(r["pop_under15"])
        if pd.notna(r.get("pop_over65")):
            entry["pop_over65"] = int(r["pop_over65"])
        result.append(entry)
    return result if len(result) >= 2 else None


def main():
    if not CSV.exists():
        raise SystemExit(f"時系列CSVが見つかりません: {CSV}\n先に download_population_timeseries.py を実行してください。")

    df = pd.read_csv(CSV, dtype={"area_code": str})
    print(f"CSV loaded: {len(df)} rows, {df['area_code'].nunique()} areas, years={sorted(df['year'].unique())}")

    # 1. prefectures.json の更新
    with open(PREF_JSON, encoding="utf-8") as f:
        prefs = json.load(f)

    pref_count = 0
    for pref_code_str, pref_data in prefs.items():
        area_code = pref_code_str.zfill(2) + "000"
        ts = build_timeseries(df, area_code)
        if ts:
            pref_data["pop_timeseries"] = ts
            pref_count += 1

    with open(PREF_JSON, "w", encoding="utf-8") as f:
        json.dump(prefs, f, ensure_ascii=False, separators=(",", ":"))
    print(f"prefectures.json 更新: {pref_count}/47 都道府県に pop_timeseries を追加")

    # 2. municipalities/*.json の更新
    muni_count = 0
    muni_total = 0
    if MUNI_DIR.exists():
        for json_path in sorted(MUNI_DIR.glob("*.json")):
            with open(json_path, encoding="utf-8") as f:
                munis = json.load(f)

            updated = False
            # リスト形式（各要素が市区町村dict）
            if isinstance(munis, list):
                for muni_data in munis:
                    muni_total += 1
                    area_code = str(muni_data.get("area_code", "")).zfill(5)
                    ts = build_timeseries(df, area_code)
                    if ts:
                        muni_data["pop_timeseries"] = ts
                        muni_count += 1
                        updated = True
            # dict形式（キー=市区町村コード）
            elif isinstance(munis, dict):
                for muni_code_str, muni_data in munis.items():
                    muni_total += 1
                    area_code = muni_code_str.zfill(5)
                    ts = build_timeseries(df, area_code)
                    if ts:
                        muni_data["pop_timeseries"] = ts
                        muni_count += 1
                        updated = True

            if updated:
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(munis, f, ensure_ascii=False, separators=(",", ":"))

    print(f"municipalities/*.json 更新: {muni_count}/{muni_total} 市区町村に pop_timeseries を追加")


if __name__ == "__main__":
    main()
