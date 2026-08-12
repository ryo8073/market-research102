"""鉄道駅CSVに市区町村コード(muni_code)を座標から割り当てる。

DID (A16) のポリゴンで点-in-ポリゴン判定。DID外の駅は最近傍DIDの
市区町村コードを使用（駅は基本的にDID内にある）。

使い方: python scripts/fix_railways_muni_code.py
"""
from __future__ import annotations

import io
import sys

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import os
from pathlib import Path

import pandas as pd
import shapefile
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "nlni" / "cache" / "railways_stations.csv"
DID_RAW = ROOT / "data" / "nlni" / "raw" / "A16"


def load_did_polygons() -> list[tuple[str, object]]:
    """全都道府県のDIDポリゴンを読み込み、(muni_code, polygon) のリストを返す。"""
    polys = []
    for pc in range(1, 48):
        pc_str = f"{pc:02d}"
        shp_path = DID_RAW / pc_str / f"A16-15_{pc_str}_GML" / f"A16-15_{pc_str}_DID.shp"
        if not shp_path.exists():
            continue
        try:
            with shapefile.Reader(str(shp_path), encoding="cp932") as sf:
                fields = [f[0] for f in sf.fields[1:]]
                muni_idx = fields.index("A16_002") if "A16_002" in fields else None
                if muni_idx is None:
                    continue
                for sr in sf.iterShapeRecords():
                    muni_code = sr.record[muni_idx]
                    if not muni_code:
                        continue
                    try:
                        geom = shape(sr.shape.__geo_interface__)
                        if geom.is_valid:
                            polys.append((str(muni_code), geom))
                    except Exception:
                        continue
        except Exception as e:
            print(f"  Skip {pc_str}: {e}")
    return polys


def main():
    print("Loading railways CSV...")
    df = pd.read_csv(CSV_PATH)
    print(f"  {len(df)} stations")

    print("Loading DID polygons (47 prefectures)...")
    did_polys = load_did_polygons()
    print(f"  {len(did_polys)} DID polygons loaded")

    # Build spatial index
    geoms = [p[1] for p in did_polys]
    codes = [p[0] for p in did_polys]
    tree = STRtree(geoms)

    print("Assigning muni_code to stations...")
    assigned = 0
    unassigned = 0
    muni_codes = []

    for _, row in df.iterrows():
        pt = Point(row["lon"], row["lat"])
        # Query nearby polygons
        idx_list = tree.query(pt)
        found = None
        for idx in idx_list:
            if geoms[idx].contains(pt):
                found = codes[idx]
                break
        if found:
            muni_codes.append(found)
            assigned += 1
        else:
            # Nearest polygon fallback
            idx_nearest = tree.nearest(pt)
            muni_codes.append(codes[idx_nearest])
            assigned += 1

    df["muni_code"] = muni_codes
    print(f"  Assigned: {assigned}, Unassigned: {unassigned}")

    # Save
    df.to_csv(CSV_PATH, index=False)
    print(f"  Saved to {CSV_PATH}")

    # Verify Tokyo
    tokyo = df[df["pref_code"].astype(str).str.zfill(2) == "13"]
    print(f"\nTokyo verification:")
    print(f"  Total stations: {len(tokyo)}")
    print(f"  With muni_code: {(tokyo['muni_code'] != '').sum()}")
    print(f"  Sample:")
    for _, r in tokyo.head(5).iterrows():
        print(f"    {r['station_name']} -> {r['muni_code']}")


if __name__ == "__main__":
    main()
