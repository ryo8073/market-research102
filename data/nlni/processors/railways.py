"""鉄道 + 駅別乗降客数プロセッサ。

N02（鉄道路線・駅 Shapefile）+ S12（駅別乗降客数 Shapefile）を統合。
駅のShapefileにはポイント座標があるので、都道府県コードは座標から推定。

出力CSV: railways_stations.csv
  pref_code, muni_code, station_name, line_name, operator, lon, lat, daily_riders
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd
import shapefile

from data.nlni.downloader import (
    RAW_DIR, load_cached_csv, save_cached_csv,
)

logger = logging.getLogger(__name__)

OUTPUT_CSV = "railways_stations.csv"

# 都道府県の大まかな緯度経度範囲（高速フィルタ用）
# (min_lon, max_lon, min_lat, max_lat)
_PREF_BBOX: dict[int, tuple[float, float, float, float]] = {
    1:  (139.3, 148.9, 41.3, 45.6),
    2:  (139.5, 141.7, 40.2, 41.6),
    3:  (139.0, 142.1, 38.7, 40.5),
    4:  (139.5, 141.7, 37.8, 39.0),
    5:  (139.5, 140.9, 39.0, 40.5),
    6:  (139.5, 140.7, 37.7, 39.2),
    7:  (139.1, 141.0, 36.8, 38.0),
    8:  (139.7, 140.9, 35.7, 37.0),
    9:  (139.3, 140.3, 36.2, 37.1),
    10: (138.6, 139.7, 36.0, 37.1),
    11: (138.7, 140.0, 35.7, 36.3),
    12: (139.7, 140.9, 34.9, 36.1),
    13: (138.9, 139.9, 35.5, 35.9),
    14: (139.0, 139.8, 35.1, 35.7),
    15: (137.8, 140.0, 37.0, 38.6),
    16: (136.7, 137.5, 36.2, 37.0),
    17: (136.2, 137.4, 36.1, 36.9),
    18: (135.5, 136.9, 35.3, 36.3),
    19: (138.2, 139.2, 35.2, 36.0),
    20: (137.5, 138.8, 35.5, 37.0),
    21: (136.3, 137.7, 35.1, 36.5),
    22: (137.5, 139.2, 34.6, 35.6),
    23: (136.5, 137.8, 34.6, 35.4),
    24: (135.8, 137.0, 34.0, 35.2),
    25: (135.8, 136.5, 34.8, 35.5),
    26: (134.8, 136.1, 34.7, 35.8),
    27: (135.1, 135.8, 34.3, 35.1),
    28: (134.2, 135.5, 34.2, 35.7),
    29: (135.5, 136.3, 34.1, 34.8),
    30: (135.0, 136.0, 33.4, 34.4),
    31: (133.2, 134.5, 35.1, 35.7),
    32: (131.7, 133.4, 34.3, 35.6),
    33: (133.3, 134.4, 34.4, 35.3),
    34: (131.6, 133.4, 34.0, 35.1),
    35: (130.8, 132.2, 33.7, 34.8),
    36: (133.5, 134.8, 33.5, 34.3),
    37: (133.4, 134.5, 34.0, 34.5),
    38: (132.0, 133.7, 33.0, 34.0),
    39: (132.5, 134.3, 32.7, 33.9),
    40: (130.0, 131.2, 33.0, 34.0),
    41: (129.7, 130.6, 32.9, 33.6),
    42: (128.6, 130.4, 32.0, 34.7),
    43: (130.1, 131.3, 32.0, 33.3),
    44: (131.0, 132.1, 32.7, 33.8),
    45: (130.7, 131.9, 31.4, 32.9),
    46: (129.0, 131.3, 30.2, 32.1),
    47: (123.5, 131.4, 24.0, 28.0),
}


def _guess_pref_from_coords(lon: float, lat: float) -> int | None:
    """座標から都道府県コードを推定（bbox判定）。"""
    for pc, (lo0, lo1, la0, la1) in _PREF_BBOX.items():
        if lo0 <= lon <= lo1 and la0 <= lat <= la1:
            return pc
    return None


def process_all() -> pd.DataFrame:
    """鉄道駅+乗降客数データを処理。"""
    cached = load_cached_csv(OUTPUT_CSV)
    if cached is not None:
        logger.info(f"Using cached {OUTPUT_CSV}")
        return cached

    # ---- N02 駅データ読み込み ----
    station_shp = RAW_DIR / "N02" / "UTF-8" / "N02-22_Station.shp"
    if not station_shp.exists():
        # Shift-JIS版を試す
        station_shp = RAW_DIR / "N02" / "Shift-JIS" / "N02-22_Station.shp"
    if not station_shp.exists():
        logger.warning("N02 station shapefile not found")
        return pd.DataFrame()

    enc = "utf-8" if "UTF-8" in str(station_shp) else "cp932"
    logger.info(f"Reading N02 stations: {station_shp.name}")
    stations = []
    with shapefile.Reader(str(station_shp), encoding=enc) as sf:
        field_names = [f[0] for f in sf.fields[1:]]
        for sr in sf.iterShapeRecords():
            rec = dict(zip(field_names, sr.record))
            # N02駅はPolyLine(type=3)で2点の短い線分。中点を駅座標とする
            if sr.shape.points:
                pts = sr.shape.points
                rec["lon"] = sum(p[0] for p in pts) / len(pts)
                rec["lat"] = sum(p[1] for p in pts) / len(pts)
                stations.append(rec)
    logger.info(f"  Read {len(stations)} stations")

    # ---- S12 乗降客数データ読み込み ----
    rider_shp = RAW_DIR / "S12" / "UTF-8" / "S12-21_NumberOfPassengers.shp"
    if not rider_shp.exists():
        rider_shp = RAW_DIR / "S12" / "Shift-JIS" / "S12-21_NumberOfPassengers.shp"

    ridership: dict[tuple[float, float], int] = {}
    if rider_shp.exists():
        enc_s = "utf-8" if "UTF-8" in str(rider_shp) else "cp932"
        logger.info(f"Reading S12 ridership: {rider_shp.name}")
        with shapefile.Reader(str(rider_shp), encoding=enc_s) as sf:
            field_names_s = [f[0] for f in sf.fields[1:]]
            for sr in sf.iterShapeRecords():
                rec_s = dict(zip(field_names_s, sr.record))
                if sr.shape.points:
                    pts = sr.shape.points
                    lon = round(sum(p[0] for p in pts) / len(pts), 4)
                    lat = round(sum(p[1] for p in pts) / len(pts), 4)
                    # 乗降客数: S12は4列セットで年度ごとのデータ
                    # 最大値を取得（最新かつ最も信頼性のある値）
                    riders = 0
                    for key in sorted(rec_s.keys(), reverse=True):
                        val = rec_s.get(key)
                        if val and isinstance(val, (int, float)) and val > riders:
                            riders = int(val)
                    ridership[(lon, lat)] = max(ridership.get((lon, lat), 0), riders)
        logger.info(f"  Read {len(ridership)} ridership points")

    # ---- 統合: 駅 + 乗降客数 + 都道府県推定 ----
    rows = []
    for st in stations:
        lon = st.get("lon", 0)
        lat = st.get("lat", 0)
        pc = _guess_pref_from_coords(lon, lat)
        if pc is None:
            continue

        # 乗降客数マッチング（座標の近似一致）
        riders = ridership.get((round(lon, 4), round(lat, 4)), 0)

        rows.append({
            "pref_code": f"{pc:02d}",
            "muni_code": "",  # precompute時にbboxのみで県集計するので不要
            "station_name": st.get("N02_005", st.get("N02_004", "")),
            "line_name": st.get("N02_003", ""),
            "operator": st.get("N02_004", st.get("N02_002", "")),
            "lon": lon,
            "lat": lat,
            "daily_riders": riders,
        })

    if not rows:
        return pd.DataFrame()

    result = pd.DataFrame(rows)
    # 重複除去
    result = result.drop_duplicates(subset=["station_name", "lon", "lat"])
    save_cached_csv(result, OUTPUT_CSV)
    return result
