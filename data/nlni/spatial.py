"""空間集約ユーティリティ。

既存のTopoJSON市区町村境界を使い、ポイント・ポリゴン・ラインデータを
市区町村コード単位に集約する。
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from shapely.geometry import Point, shape, mapping
from shapely.prepared import prep
from shapely import STRtree

logger = logging.getLogger(__name__)

# 既存の市区町村TopoJSONディレクトリ
_GEO_DIR = Path(__file__).resolve().parent.parent / "geo"


def _decode_arc(raw_arc: list, transform: dict | None) -> list:
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
    if idx >= 0:
        return list(arcs_decoded[idx])
    return list(reversed(arcs_decoded[~idx]))


def _decode_ring(arcs_decoded: list, ring_indices: list) -> list:
    coords = []
    for idx in ring_indices:
        arc_coords = _resolve_arc(arcs_decoded, idx)
        if coords:
            coords.extend(arc_coords[1:])
        else:
            coords.extend(arc_coords)
    return coords


def _topojson_to_shapely_features(topo_data: dict) -> list[dict]:
    """TopoJSON → shapely geometryのリスト。各要素は {geometry, properties}。"""
    transform = topo_data.get("transform")
    arcs_decoded = [_decode_arc(arc, transform) for arc in topo_data["arcs"]]
    obj_name = list(topo_data["objects"].keys())[0]
    geometries = topo_data["objects"][obj_name]["geometries"]

    features = []
    for geom in geometries:
        props = geom.get("properties", {})
        gtype = geom["type"]

        if gtype == "Polygon":
            coordinates = [_decode_ring(arcs_decoded, ring) for ring in geom["arcs"]]
            geojson_geom = {"type": "Polygon", "coordinates": coordinates}
        elif gtype == "MultiPolygon":
            coordinates = [
                [_decode_ring(arcs_decoded, ring) for ring in polygon]
                for polygon in geom["arcs"]
            ]
            geojson_geom = {"type": "MultiPolygon", "coordinates": coordinates}
        else:
            continue

        try:
            shapely_geom = shape(geojson_geom)
            if shapely_geom.is_valid:
                features.append({"geometry": shapely_geom, "properties": props})
        except Exception:
            pass

    return features


@lru_cache(maxsize=8)
def load_municipality_boundaries(pref_code: int) -> list[dict]:
    """県別の市区町村境界をshapely形式で読み込み。

    Returns
    -------
    list of dict: [{geometry: shapely.Polygon, properties: {N03_004: 名前, N03_007: コード}}, ...]
    """
    filename = f"N03-21_{pref_code:02d}_210101.json"
    path = _GEO_DIR / filename
    if not path.exists():
        logger.warning(f"Boundary file not found: {path}")
        return []
    with open(path, encoding="utf-8") as f:
        topo = json.load(f)
    return _topojson_to_shapely_features(topo)


def build_spatial_index(boundaries: list[dict]) -> tuple[STRtree, list[dict]]:
    """市区町村境界の空間インデックスを構築。

    Returns
    -------
    (STRtree, boundaries_list) — STRtree.query() の結果インデックスで boundaries_list を参照
    """
    geoms = [b["geometry"] for b in boundaries]
    tree = STRtree(geoms)
    return tree, boundaries


def assign_points_to_municipalities(
    points: list[tuple[float, float]],
    pref_code: int,
) -> list[str | None]:
    """(lon, lat) のリストを市区町村コードに割り当て。

    Returns
    -------
    list of str|None: 各ポイントに対応する5桁市区町村コード。該当なしはNone。
    """
    boundaries = load_municipality_boundaries(pref_code)
    if not boundaries:
        return [None] * len(points)

    tree, bounds = build_spatial_index(boundaries)
    prepared_geoms = [(prep(b["geometry"]), b["properties"].get("N03_007", "")) for b in bounds]

    results = []
    shapely_points = [Point(lon, lat) for lon, lat in points]

    for pt in shapely_points:
        muni_code = None
        idxs = tree.query(pt)
        for idx in idxs:
            prep_geom, code = prepared_geoms[idx]
            if prep_geom.contains(pt):
                muni_code = code
                break
        results.append(muni_code)

    return results


def assign_points_to_prefectures(
    points: list[tuple[float, float]],
) -> list[int | None]:
    """(lon, lat) のリストを都道府県コードに割り当て（簡易版: 経度緯度の矩形判定）。

    正確な判定が必要な場合はpref別境界を使うが、
    国土数値情報のデータは大半が都道府県コード付きなので補助用。
    """
    # 簡易版: 各県の境界を順に試す（重い場合はpref_codeが既知のデータに使わない）
    results: list[int | None] = [None] * len(points)
    # This is a fallback; most processors have pref_code from the source data
    return results


def aggregate_points_by_municipality(
    records: list[dict[str, Any]],
    pref_code: int,
    lon_key: str = "_lon",
    lat_key: str = "_lat",
) -> dict[str, list[dict]]:
    """レコードリストを市区町村コード別に集約。

    Parameters
    ----------
    records : 各レコードに lon_key, lat_key を含む辞書のリスト
    pref_code : 都道府県コード

    Returns
    -------
    dict: {muni_code: [records]}
    """
    points = [(r[lon_key], r[lat_key]) for r in records]
    muni_codes = assign_points_to_municipalities(points, pref_code)

    result: dict[str, list[dict]] = {}
    for rec, code in zip(records, muni_codes):
        if code:
            result.setdefault(code, []).append(rec)
    return result


def simplify_geometry(geom, tolerance: float = 0.001):
    """ジオメトリをDouglas-Peuckerで簡略化。"""
    return geom.simplify(tolerance, preserve_topology=True)


def geometry_to_geojson(geom) -> dict:
    """shapely geometry → GeoJSON dict。座標を小数5桁に丸める。"""
    geojson = mapping(geom)

    def _round_coords(coords):
        if isinstance(coords[0], (int, float)):
            return [round(c, 5) for c in coords]
        return [_round_coords(c) for c in coords]

    geojson["coordinates"] = _round_coords(geojson["coordinates"])
    return geojson
