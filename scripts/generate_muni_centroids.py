"""全国 1,918市区町村のセントロイド (lon, lat) を JSON 出力。
商圏分析（住所→指定半径内の市区町村特定）のためのデータ層。

出力: ci102-nextjs/public/data/muni_centroids.json
形式: { area_code: { name, lon, lat, pref_code,
                    nearest_station_km?, nearest_station_min?,
                    nearest_medical_km?, nearest_medical_min?,
                    nearest_commercial_km?, nearest_commercial_min?,
                    car_dependency_score? } }
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from data.nlni.spatial import load_municipality_boundaries

OUTPUT = Path(__file__).resolve().parents[1] / "ci102-nextjs" / "public" / "data" / "muni_centroids.json"
OSRM_CSV = Path(__file__).resolve().parents[1] / "data" / "nlni" / "cache" / "driving_distances.csv"


def main():
    centroids: dict[str, dict] = {}
    for pref in range(1, 48):
        boundaries = load_municipality_boundaries(pref)
        if not boundaries:
            print(f"  {pref:02d}: 境界データなし")
            continue
        for b in boundaries:
            geom = b["geometry"]
            props = b["properties"]
            code = props.get("N03_007") or props.get("area_code")
            name = props.get("N03_004") or props.get("N03_003") or ""
            if not code:
                continue
            # 既存キーを優先（合併等で複数ポリゴンの場合、最大面積を採用）
            if code in centroids:
                existing_area = centroids[code].get("_area", 0)
                if geom.area <= existing_area:
                    continue
            c = geom.centroid
            centroids[code] = {
                "name": name,
                "lon": round(c.x, 6),
                "lat": round(c.y, 6),
                "pref_code": pref,
                "_area": geom.area,
            }
        print(f"  {pref:02d}: {len([k for k in centroids if k.startswith(f'{pref:02d}')])} 市区町村")

    # _area を除去
    for v in centroids.values():
        v.pop("_area", None)

    # OSRM 走行距離データをマージ
    if OSRM_CSV.exists():
        df_osrm = pd.read_csv(OSRM_CSV, dtype={"muni_code": str})
        osrm_count = 0
        for _, row in df_osrm.iterrows():
            code = row["muni_code"]
            if code not in centroids:
                continue
            for key in ["nearest_station_km", "nearest_station_min",
                        "nearest_medical_km", "nearest_medical_min",
                        "nearest_commercial_km", "nearest_commercial_min",
                        "car_dependency_score"]:
                v = row.get(key)
                if pd.notna(v):
                    centroids[code][key] = round(float(v), 1) if isinstance(v, (int, float)) else v
            osrm_count += 1
        print(f"\n  OSRM データを {osrm_count} 市区町村にマージ")
    else:
        print(f"\n  ⚠ OSRM CSV ({OSRM_CSV}) なし。走行時間データはマージされません")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(centroids, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = OUTPUT.stat().st_size / 1024
    print()
    print(f"出力: {OUTPUT}")
    print(f"  市区町村数: {len(centroids)}")
    print(f"  サイズ: {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
