"""通勤OD行列からLouvainコミュニティ検出でゾーンを生成する。

複数の解像度（resolution）パラメータでクラスタリングし、
ユーザーが粒度を選べるようにする。

入力: ci102-nextjs/public/data/commute_od/*.json（47都道府県のOD行列）
出力: ci102-nextjs/public/data/commute_louvain.json

形式:
{
  "resolutions": {
    "0.5":  { "zones": { "zone_0": ["13101","13102",...], ... }, "muni_to_zone": {...} },
    "1.0":  { ... },
    "2.0":  { ... }
  },
  "meta": { "n_nodes": 1918, "n_edges": 307832 }
}

使い方: python scripts/build_louvain_zones.py
"""
from __future__ import annotations
import io, sys, json
from pathlib import Path
from collections import defaultdict

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import networkx as nx
import community as community_louvain  # python-louvain

ROOT = Path(__file__).resolve().parent.parent
OD_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "commute_od"
OUTPUT = ROOT / "ci102-nextjs" / "public" / "data" / "commute_louvain.json"

# 解像度パラメータ: 低い=大きなゾーン / 高い=小さなゾーン
RESOLUTIONS = [0.5, 1.0, 1.5, 2.0, 3.0]


def build_graph() -> nx.Graph:
    """全都道府県のOD行列を読み込み、無向重み付きグラフを構築。"""
    G = nx.Graph()
    total_edges = 0

    for od_path in sorted(OD_DIR.glob("*.json")):
        with open(od_path, encoding="utf-8") as f:
            data = json.load(f)
        od = data.get("od", {})
        for origin, dests in od.items():
            for dest, count in dests.items():
                if origin == dest:
                    continue
                if G.has_edge(origin, dest):
                    G[origin][dest]["weight"] += count
                else:
                    G.add_edge(origin, dest, weight=count)
                    total_edges += 1

    print(f"グラフ構築: {G.number_of_nodes()} ノード, {total_edges} エッジ")
    return G


def run_louvain(G: nx.Graph, resolution: float) -> dict[str, list[str]]:
    """Louvainコミュニティ検出を実行し、ゾーン→メンバーリストを返す。"""
    partition = community_louvain.best_partition(G, weight="weight", resolution=resolution, random_state=42)

    # コミュニティIDごとにメンバーを集約
    zones: dict[int, list[str]] = defaultdict(list)
    for node, comm_id in partition.items():
        zones[comm_id].append(node)

    # ゾーンIDを付与（メンバー数降順）
    sorted_zones = sorted(zones.values(), key=len, reverse=True)
    result = {}
    for i, members in enumerate(sorted_zones):
        result[f"louvain_{i}"] = sorted(members)

    return result


def main():
    print("=== Louvainコミュニティ検出 ===")
    G = build_graph()

    if G.number_of_nodes() == 0:
        print("OD行列が空です。先にdownload_commute_od.pyを実行してください。")
        return

    output_data: dict = {
        "resolutions": {},
        "meta": {
            "n_nodes": G.number_of_nodes(),
            "n_edges": G.number_of_edges(),
        },
    }

    for res in RESOLUTIONS:
        print(f"\n--- resolution={res} ---")
        zones = run_louvain(G, res)
        n_zones = len(zones)
        sizes = [len(m) for m in zones.values()]
        avg = sum(sizes) / n_zones if n_zones > 0 else 0

        # muni_to_zone マッピング
        m2z: dict[str, str] = {}
        for zone_id, members in zones.items():
            for m in members:
                m2z[m] = zone_id

        output_data["resolutions"][str(res)] = {
            "zones": zones,
            "muni_to_zone": m2z,
        }

        print(f"  ゾーン数: {n_zones}")
        print(f"  平均メンバー: {avg:.1f}")
        print(f"  最大ゾーン: {max(sizes)} / 最小: {min(sizes)}")
        # 上位5ゾーンのサイズ
        top5 = sorted(sizes, reverse=True)[:5]
        print(f"  上位5: {top5}")

    # 保存
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\n保存: {OUTPUT}")
    print(f"ファイルサイズ: {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
