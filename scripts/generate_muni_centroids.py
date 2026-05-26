"""全国 1,918市区町村のセントロイド (lon, lat) を JSON 出力。
商圏分析（住所→指定半径内の市区町村特定）のためのデータ層。

出力: ci102-nextjs/public/data/muni_centroids.json
形式: { area_code: { name, lon, lat, pref_code } }
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data.nlni.spatial import load_municipality_boundaries

OUTPUT = Path(__file__).resolve().parents[1] / "ci102-nextjs" / "public" / "data" / "muni_centroids.json"


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
