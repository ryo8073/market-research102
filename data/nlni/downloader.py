"""国土数値情報ダウンロード基盤。

ZIP/Shapefile/GeoJSON を取得し、data/nlni/cache/ に処理済みCSVとして保存する。
census_cache.py のパターンを踏襲。
"""
from __future__ import annotations

import io
import json
import logging
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import pandas as pd
import requests

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent / "cache"
RAW_DIR = Path(__file__).parent / "raw"


@dataclass
class NlniDatasetConfig:
    """国土数値情報ダウンロード設定。"""
    dataset_id: str             # e.g., "N02", "L01", "A31"
    name: str                   # 日本語名
    url_template: str           # URL template with {pref_code:02d}, {year} etc.
    format: Literal["shp", "geojson", "gml"]
    scope: Literal["national", "per_prefecture"]
    output_csv: str             # 処理済み出力ファイル名
    description: str = ""


def _ensure_dirs():
    """キャッシュ・生データディレクトリを作成。"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)


def download_zip(url: str, extract_dir: Path, *, timeout: int = 300) -> Path:
    """ZIPファイルをダウンロードして展開。既に展開済みならスキップ。"""
    _ensure_dirs()
    extract_dir.mkdir(parents=True, exist_ok=True)

    # 展開先にファイルが既にあればスキップ
    existing = list(extract_dir.glob("*"))
    if existing:
        logger.info(f"  Already extracted: {extract_dir}")
        return extract_dir

    logger.info(f"  Downloading: {url}")
    resp = requests.get(url, timeout=timeout, stream=True)
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        zf.extractall(extract_dir)
    logger.info(f"  Extracted to: {extract_dir}")
    return extract_dir


def download_geojson(url: str, dest: Path, *, timeout: int = 300) -> Path:
    """GeoJSONファイルを直接ダウンロード。"""
    _ensure_dirs()
    if dest.exists():
        logger.info(f"  Already cached: {dest}")
        return dest

    logger.info(f"  Downloading: {url}")
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(resp.content)
    return dest


def read_shapefile_records(shp_dir: Path, encoding: str = "cp932") -> list[dict[str, Any]]:
    """Shapefileからレコードを読み取り、dict のリストとして返す。

    Parameters
    ----------
    shp_dir : Shapefile格納ディレクトリ（.shp, .dbf, .shx が含まれる）
    encoding : DBFファイルのエンコーディング（日本語データはcp932が一般的）

    Returns
    -------
    list of dict: 各レコードの属性 + geometry情報
    """
    import shapefile

    # .shp ファイルを探す（GMLしかない場合はGeoJSONにフォールバック）
    shp_files = list(shp_dir.rglob("*.shp"))
    if not shp_files:
        # GMLディレクトリにはGeoJSONが含まれる場合がある
        geojson_files = list(shp_dir.rglob("*.geojson")) + list(shp_dir.rglob("*.json"))
        if geojson_files:
            return _read_geojson_as_records(geojson_files[0])
        raise FileNotFoundError(f"No .shp or .geojson file found in {shp_dir}")

    shp_path = shp_files[0]
    logger.info(f"  Reading shapefile: {shp_path.name}")

    # エンコーディングフォールバック: cp932 → utf-8
    for enc in ([encoding] if encoding == "utf-8" else [encoding, "utf-8"]):
        try:
            records = _read_shp_with_encoding(shp_path, enc)
            if records:
                logger.info(f"  Read {len(records)} records from {shp_path.name} (enc={enc})")
                return records
        except UnicodeDecodeError:
            logger.warning(f"  Encoding {enc} failed for {shp_path.name}, trying next...")
        except Exception as e:
            logger.error(f"  Error reading {shp_path.name} with {enc}: {e}")
            raise

    raise ValueError(f"Could not decode {shp_path} with any encoding")


def _read_shp_with_encoding(shp_path: Path, encoding: str) -> list[dict[str, Any]]:
    """Shapefile読み取りの実装（エンコーディング指定）。"""
    import shapefile

    records = []
    with shapefile.Reader(str(shp_path), encoding=encoding) as sf:
        field_names = [f[0] for f in sf.fields[1:]]  # Skip DeletionFlag
        for sr in sf.iterShapeRecords():
            try:
                rec = dict(zip(field_names, sr.record))
            except Exception:
                continue  # 壊れたレコードをスキップ

            shape = sr.shape
            if shape.shapeType in (1, 11, 21):  # Point types
                if shape.points:
                    rec["_lon"] = shape.points[0][0]
                    rec["_lat"] = shape.points[0][1]
            elif shape.shapeType in (3, 13, 23):  # PolyLine types
                rec["_geometry_type"] = "LineString"
                rec["_points"] = shape.points
                rec["_parts"] = list(shape.parts)
            elif shape.shapeType in (5, 15, 25):  # Polygon types
                rec["_geometry_type"] = "Polygon"
                rec["_points"] = shape.points
                rec["_parts"] = list(shape.parts)
            elif shape.shapeType == 0:  # Null shape
                pass
            records.append(rec)

    return records


def _read_geojson_as_records(path: Path) -> list[dict[str, Any]]:
    """GeoJSONファイルをread_shapefile_records互換の形式で読み取り。"""
    features = read_geojson_features(path)
    records = []
    for f in features:
        rec = dict(f.get("properties", {}))
        geom = f.get("geometry", {})
        if geom.get("type") == "Point" and geom.get("coordinates"):
            rec["_lon"] = geom["coordinates"][0]
            rec["_lat"] = geom["coordinates"][1]
        elif geom.get("type") in ("Polygon", "MultiPolygon"):
            rec["_geometry_type"] = geom["type"]
            rec["_geojson_geometry"] = geom
        elif geom.get("type") in ("LineString", "MultiLineString"):
            rec["_geometry_type"] = geom["type"]
            rec["_geojson_geometry"] = geom
        records.append(rec)
    logger.info(f"  Read {len(records)} features from {path.name}")
    return records


def read_geojson_features(path: Path) -> list[dict[str, Any]]:
    """GeoJSONファイルからフィーチャーリストを読み取り。"""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if data.get("type") == "FeatureCollection":
        return data.get("features", [])
    elif data.get("type") == "Feature":
        return [data]
    return []


def read_gml_points(gml_path: Path, feature_tag: str) -> list[dict[str, Any]]:
    """GML XMLからポイントフィーチャーを読み取り。

    Parameters
    ----------
    gml_path : GML XMLファイルパス
    feature_tag : フィーチャーのローカルタグ名 (e.g., "BusStop")
    """
    import xml.etree.ElementTree as ET

    tree = ET.parse(gml_path)
    root = tree.getroot()

    # Namespace detection
    ns_ksj = "http://nlftp.mlit.go.jp/ksj/schemas/ksj-app"
    ns_gml = "http://schemas.opengis.net/gml/3.2.1"

    # Build point lookup first (GML uses lat,lon order)
    points = {}
    for pt_elem in root.iter(f"{{{ns_gml}}}Point"):
        pt_id = pt_elem.attrib.get(f"{{{ns_gml}}}id", pt_elem.attrib.get("id", ""))
        pos_elem = pt_elem.find(f"{{{ns_gml}}}pos")
        if pos_elem is not None and pos_elem.text:
            parts = pos_elem.text.strip().split()
            if len(parts) >= 2:
                points[pt_id] = (float(parts[1]), float(parts[0]))  # GML: lat lon → lon, lat

    records = []
    for elem in root.iter(f"{{{ns_ksj}}}{feature_tag}"):
        rec: dict[str, Any] = {}
        for child in elem:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            # Detect xlink:href for position reference (tag can be "loc", "position", etc.)
            href = child.attrib.get("{http://www.w3.org/1999/xlink}href", "")
            if href:
                ref = href.lstrip("#")
                if ref in points:
                    rec["_lon"], rec["_lat"] = points[ref]
            elif child.text and child.text.strip():
                rec[tag] = child.text.strip()

        records.append(rec)

    logger.info(f"  Read {len(records)} features from {gml_path.name}")
    return records


def load_cached_csv(csv_name: str) -> pd.DataFrame | None:
    """処理済みCSVをロード。存在しなければNone。"""
    path = CACHE_DIR / csv_name
    if not path.exists():
        return None
    return pd.read_csv(path, dtype={"area_code": str, "muni_code": str, "pref_code": str})


def save_cached_csv(df: pd.DataFrame, csv_name: str) -> Path:
    """処理済みCSVを保存。"""
    _ensure_dirs()
    path = CACHE_DIR / csv_name
    df.to_csv(path, index=False, encoding="utf-8-sig")
    logger.info(f"  Saved: {path} ({len(df)} rows)")
    return path
