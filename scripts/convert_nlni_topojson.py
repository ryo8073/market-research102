"""NLNIのGeoJSONをTopoJSON（高解像度+低解像度）に変換する。

入力: ci102-nextjs/public/data/nlni/*.geojson
出力:
  ci102-nextjs/public/data/nlni_topo/*.topojson      (高解像度 → R2用)
  ci102-nextjs/public/data/nlni_lite/*.topojson       (低解像度 → git残し即座表示用)

使い方: python scripts/convert_nlni_topojson.py
"""
from __future__ import annotations
import io, sys, json, os
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    import topojson as tp
except ImportError:
    print("pip install topojson")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
NLNI_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "nlni"
TOPO_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "nlni_topo"
LITE_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "nlni_lite"

# 低解像度の簡略化パラメータ（レイヤーごとに調整）
SIMPLIFY = {
    "flood":        {"toposimplify": 0.01, "topoquantize": 1e4},
    "zoning":       {"toposimplify": 0.01, "topoquantize": 1e4},
    "location_opt": {"toposimplify": 0.005, "topoquantize": 1e5},
    "did":          {"toposimplify": 0.005, "topoquantize": 1e5},
    "land_prices":  {"toposimplify": 0, "topoquantize": 1e5},  # ポイントデータ
    "railways":     {"toposimplify": 0, "topoquantize": 1e5},  # ラインデータ
}

# 大きすぎるファイルのスキップ閾値（MB）
MAX_FILE_MB = 200


def convert_file(src: Path, dst_topo: Path, dst_lite: Path, layer_type: str):
    """1ファイルを高解像度TopoJSON + 低解像度TopoJSONに変換。"""
    size_mb = src.stat().st_size / 1024 / 1024

    if size_mb > MAX_FILE_MB:
        print(f"  SKIP (>{MAX_FILE_MB}MB): {src.name} ({size_mb:.0f}MB)")
        # 巨大ファイルは低解像度のみ生成（メモリ節約のためchunk読み込み）
        try:
            with open(src, encoding="utf-8") as f:
                geojson = json.load(f)
            # features数を間引き（10%に）
            features = geojson.get("features", [])
            step = max(1, len(features) // (len(features) // 10 + 1))
            geojson["features"] = features[::step]
            params = SIMPLIFY.get(layer_type, {"toposimplify": 0.01, "topoquantize": 1e4})
            topo = tp.Topology(geojson, toposimplify=params["toposimplify"], topoquantize=int(params["topoquantize"]))
            with open(dst_lite, "w", encoding="utf-8") as f:
                json.dump(topo.to_dict(), f, separators=(",", ":"))
            print(f"  LITE: {dst_lite.name} ({dst_lite.stat().st_size / 1024:.0f}KB)")
        except Exception as e:
            print(f"  ERROR: {e}")
        return

    try:
        with open(src, encoding="utf-8") as f:
            geojson = json.load(f)

        # 高解像度（R2用）
        topo_hi = tp.Topology(geojson, topoquantize=int(1e6))
        with open(dst_topo, "w", encoding="utf-8") as f:
            json.dump(topo_hi.to_dict(), f, separators=(",", ":"))

        # 低解像度（git用・即座表示）
        params = SIMPLIFY.get(layer_type, {"toposimplify": 0.01, "topoquantize": 1e4})
        topo_lo = tp.Topology(geojson, toposimplify=params["toposimplify"], topoquantize=int(params["topoquantize"]))
        with open(dst_lite, "w", encoding="utf-8") as f:
            json.dump(topo_lo.to_dict(), f, separators=(",", ":"))

        hi_kb = dst_topo.stat().st_size / 1024
        lo_kb = dst_lite.stat().st_size / 1024
        orig_kb = src.stat().st_size / 1024
        print(f"  {src.name}: {orig_kb:.0f}KB → hi:{hi_kb:.0f}KB lo:{lo_kb:.0f}KB ({lo_kb/orig_kb*100:.0f}%)")

    except Exception as e:
        print(f"  ERROR {src.name}: {e}")


def main():
    TOPO_DIR.mkdir(parents=True, exist_ok=True)
    LITE_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(NLNI_DIR.glob("*.geojson"))
    print(f"変換対象: {len(files)} ファイル")

    for f in files:
        name = f.stem  # e.g., "flood_13"
        layer_type = name.rsplit("_", 1)[0]  # e.g., "flood"
        dst_topo = TOPO_DIR / f"{name}.topojson"
        dst_lite = LITE_DIR / f"{name}.topojson"

        if dst_lite.exists():
            continue  # 既に変換済み

        print(f"\n{name} ({layer_type}):")
        convert_file(f, dst_topo, dst_lite, layer_type)

    # サマリー
    print("\n=== サマリー ===")
    for d, label in [(NLNI_DIR, "元GeoJSON"), (TOPO_DIR, "高解像度TopoJSON"), (LITE_DIR, "低解像度TopoJSON")]:
        if d.exists():
            total = sum(f.stat().st_size for f in d.iterdir() if f.is_file()) / 1024 / 1024
            count = sum(1 for f in d.iterdir() if f.is_file())
            print(f"  {label}: {count} files, {total:.0f}MB")


if __name__ == "__main__":
    main()
