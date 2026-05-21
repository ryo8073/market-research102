"""TopoJSON → GeoJSON 変換ユーティリティ。

smartnews-smri/japan-topography の県別TopoJSON（s0010）を
Plotly choropleth_map 用の GeoJSON FeatureCollection に変換する。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_GEO_DIR = Path(__file__).parent / "geo"


def _decode_arc(raw_arc: list, transform: dict | None) -> list:
    """単一のdelta-encodedアークを絶対座標に変換。"""
    if not transform:
        return [list(pt) for pt in raw_arc]
    scale = transform["scale"]
    translate = transform["translate"]
    decoded = []
    x, y = 0, 0
    for pt in raw_arc:
        x += pt[0]
        y += pt[1]
        decoded.append([x * scale[0] + translate[0], y * scale[1] + translate[1]])
    return decoded


def _resolve_arc(arcs_decoded: list, idx: int) -> list:
    """アークインデックス（正/負）から座標列を取得。"""
    if idx >= 0:
        return list(arcs_decoded[idx])
    return list(reversed(arcs_decoded[~idx]))


def _decode_ring(arcs_decoded: list, ring_indices: list) -> list:
    """リング（アークインデックスのリスト）を座標列に変換。"""
    coords = []
    for idx in ring_indices:
        arc_coords = _resolve_arc(arcs_decoded, idx)
        if coords:
            # 前のアークの末尾と次のアークの先頭が重複するので先頭を省略
            coords.extend(arc_coords[1:])
        else:
            coords.extend(arc_coords)
    return coords


def topojson_to_geojson(topo_data: dict) -> dict:
    """TopoJSON dict を GeoJSON FeatureCollection dict に変換。"""
    transform = topo_data.get("transform")

    # 全arcを先にdelta-decode（各arc独立でx,yをリセット）
    arcs_decoded = [_decode_arc(arc, transform) for arc in topo_data["arcs"]]

    obj_name = list(topo_data["objects"].keys())[0]
    geometries = topo_data["objects"][obj_name]["geometries"]

    features = []
    for geom in geometries:
        props = geom.get("properties", {})
        gtype = geom["type"]

        if gtype == "Polygon":
            coordinates = [_decode_ring(arcs_decoded, ring) for ring in geom["arcs"]]
            geometry = {"type": "Polygon", "coordinates": coordinates}
        elif gtype == "MultiPolygon":
            coordinates = [
                [_decode_ring(arcs_decoded, ring) for ring in polygon]
                for polygon in geom["arcs"]
            ]
            geometry = {"type": "MultiPolygon", "coordinates": coordinates}
        else:
            continue

        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geometry,
        })

    return {"type": "FeatureCollection", "features": features}


@lru_cache(maxsize=8)
def load_municipality_geojson(pref_code: int) -> dict | None:
    """県別TopoJSONを読み込みGeoJSONに変換（LRUキャッシュ付き）。

    Parameters
    ----------
    pref_code : 都道府県コード (1-47)

    Returns
    -------
    GeoJSON FeatureCollection dict。各フィーチャーの properties に:
      - N03_004: 市区町村名
      - N03_007: 5桁市区町村コード
    """
    filename = f"N03-21_{pref_code:02d}_210101.json"
    path = _GEO_DIR / filename
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        topo = json.load(f)
    return topojson_to_geojson(topo)
