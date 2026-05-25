"""国土数値情報 全データセット一括ダウンロード。

Usage:
  python scripts/download_nlni.py                    # 全データセット
  python scripts/download_nlni.py --dataset railways  # 個別指定
  python scripts/download_nlni.py --pref 13           # 東京都のみ
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data.nlni.downloader import (
    NlniDatasetConfig, download_zip, RAW_DIR,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ============================================================================
# データセット URL 定義
# ============================================================================
# 国土数値情報のURL構造（検証済み）:
#   https://nlftp.mlit.go.jp/ksj/gml/data/{ID}/{ID}-{YY}/{ID}-{YY}_{PREF}_GML.zip
#
# URL検証結果 (2026-05-25):
#   ✅ N02, S12, L01, A29, A31, P11, N07, P04, A16 — 直接ダウンロード確認済み
#   ❌ mesh_pop, P09, A35, N01 — ブラウザセッション必要（手動ダウンロード）

BASE = "https://nlftp.mlit.go.jp/ksj/gml/data"

# --- 全国データ (1ファイル) --- ✅ 検証済み

DS_RAILWAYS = NlniDatasetConfig(
    dataset_id="N02",
    name="鉄道",
    url_template=f"{BASE}/N02/N02-22/N02-22_GML.zip",
    format="gml",
    scope="national",
    output_csv="railways_stations.csv",
    description="旅客鉄道路線・駅（R4年度）16.8MB",
)

DS_RIDERSHIP = NlniDatasetConfig(
    dataset_id="S12",
    name="駅別乗降客数",
    url_template=f"{BASE}/S12/S12-21/S12-21_GML.zip",
    format="gml",
    scope="national",
    output_csv="station_ridership.csv",
    description="駅別乗降客数（R2年度）4.5MB",
)

# --- 県別データ (47ファイル) --- ✅ 検証済み

DS_LAND_PRICES = NlniDatasetConfig(
    dataset_id="L01",
    name="地価公示",
    url_template=f"{BASE}/L01/L01-24/L01-24_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="land_prices.csv",
    description="地価公示（R6年）",
)

DS_ZONING = NlniDatasetConfig(
    dataset_id="A29",
    name="用途地域",
    url_template=f"{BASE}/A29/A29-19/A29-19_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="zoning_by_muni.csv",
    description="用途地域（R1年度）",
)

DS_FLOOD = NlniDatasetConfig(
    dataset_id="A31",
    name="洪水浸水想定区域",
    url_template=f"{BASE}/A31/A31-12/A31-12_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="flood_risk_by_muni.csv",
    description="洪水浸水想定区域（H24年）",
)

DS_BUS_STOPS = NlniDatasetConfig(
    dataset_id="P11",
    name="バス停留所",
    url_template=f"{BASE}/P11/P11-22/P11-22_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="bus_coverage_by_muni.csv",
    description="バス停留所（R4年度）",
)

DS_BUS_ROUTES = NlniDatasetConfig(
    dataset_id="N07",
    name="バス路線",
    url_template=f"{BASE}/N07/N07-11/N07-11_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="bus_routes_by_muni.csv",
    description="バス路線（H23年度）",
)

DS_MEDICAL = NlniDatasetConfig(
    dataset_id="P04",
    name="医療施設",
    url_template=f"{BASE}/P04/P04-20/P04-20_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="facilities_medical.csv",
    description="医療施設（R2年度）",
)

DS_DID = NlniDatasetConfig(
    dataset_id="A16",
    name="人口集中地区",
    url_template=f"{BASE}/A16/A16-15/A16-15_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="did_by_muni.csv",
    description="人口集中地区（H27年度）",
)

# --- 手動ダウンロード必要 --- ❌ ブラウザセッション必要
# 以下はURL直接ダウンロード不可。nlftp.mlit.go.jp からブラウザで手動DLし、
# data/nlni/raw/{ID}/{pref:02d}/ に展開する。

DS_MESH_POP = NlniDatasetConfig(
    dataset_id="mesh_pop",
    name="メッシュ別将来推計人口",
    url_template=f"https://nlftp.mlit.go.jp/ksj/gml/data/m1kr6/m1kr6-24/1km_mesh_2024_{{pref_code:02d}}_SHP.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="mesh_pop_projection.csv",
    description="1kmメッシュ別将来推計人口（R6推計）✅ 自動DL可",
)

DS_COMMERCIAL = NlniDatasetConfig(
    dataset_id="P33",
    name="集客施設（商業施設）",
    url_template=f"{BASE}/P33/P33-14/P33-14_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="facilities_commercial.csv",
    description="集客施設（H26年度）✅ 自動DL可",
)

DS_LOCATION_OPT = NlniDatasetConfig(
    dataset_id="A50",
    name="立地適正化計画区域",
    url_template=f"{BASE}/A50/A50-20/A50-20_{{pref_code:02d}}_GML.zip",
    format="shp",
    scope="per_prefecture",
    output_csv="location_optimization.csv",
    description="立地適正化計画区域（R2年度）✅ 自動DL可",
)

DS_ROADS = NlniDatasetConfig(
    dataset_id="N13",
    name="道路",
    url_template="MESH_BASED",  # メッシュ単位 — 専用ダウンロードロジックで対応
    format="shp",
    scope="per_prefecture",
    output_csv="roads_by_muni.csv",
    description="道路（R6年度）— メッシュ単位、自動変換対応",
)

# N13は2次メッシュ単位。都道府県→メッシュのマッピング（主要メッシュのみ）
# 参考: https://www.stat.go.jp/data/mesh/m_itiran.html
PREF_TO_MESH: dict[int, list[str]] = {
    1: ["6241", "6242", "6243", "6341", "6342", "6343", "6441", "6442", "6443", "6541", "6542", "6543"],
    13: ["5339", "5340"],  # 東京
    14: ["5339", "5340"],  # 神奈川
    23: ["5236", "5237"],  # 愛知
    27: ["5135", "5235"],  # 大阪
    40: ["5030", "5130"],  # 福岡
    47: ["3724", "3725", "3726", "3727"],  # 沖縄
    # 残りの県は将来追加。全メッシュリストは国土数値情報ページから取得可能
}

# 全データセットリスト
ALL_DATASETS: list[NlniDatasetConfig] = [
    DS_RAILWAYS,
    DS_RIDERSHIP,
    DS_LAND_PRICES,
    DS_ZONING,
    DS_MESH_POP,
    DS_FLOOD,
    DS_BUS_STOPS,
    DS_BUS_ROUTES,
    DS_MEDICAL,
    DS_COMMERCIAL,
    DS_DID,
    DS_LOCATION_OPT,
    DS_ROADS,
]

DATASET_MAP = {ds.dataset_id: ds for ds in ALL_DATASETS}
DATASET_NAME_MAP = {
    "railways": DS_RAILWAYS,
    "ridership": DS_RIDERSHIP,
    "land_prices": DS_LAND_PRICES,
    "zoning": DS_ZONING,
    "mesh_pop": DS_MESH_POP,
    "flood": DS_FLOOD,
    "bus_stops": DS_BUS_STOPS,
    "bus_routes": DS_BUS_ROUTES,
    "medical": DS_MEDICAL,
    "commercial": DS_COMMERCIAL,
    "did": DS_DID,
    "location_opt": DS_LOCATION_OPT,
    "roads": DS_ROADS,
}

# dataset_id → name map も更新
DATASET_MAP = {ds.dataset_id: ds for ds in ALL_DATASETS}

PREF_CODES = list(range(1, 48))


def download_dataset(ds: NlniDatasetConfig, pref_codes: list[int] | None = None):
    """データセットをダウンロード。"""
    logger.info(f"=== {ds.name} ({ds.dataset_id}) ===")

    if ds.url_template == "MANUAL_DOWNLOAD":
        raw_dir = RAW_DIR / ds.dataset_id
        if raw_dir.exists() and (any(raw_dir.rglob("*.shp")) or any(raw_dir.rglob("*.geojson"))):
            logger.info(f"  Manual data found in {raw_dir}")
        else:
            logger.warning(
                f"  ❌ 手動ダウンロード必要: nlftp.mlit.go.jp からブラウザで"
                f" {ds.name} をDLし、{raw_dir}/ に展開してください"
            )
        return

    if ds.url_template == "MESH_BASED":
        # N13道路: メッシュ単位ダウンロード
        codes = pref_codes or PREF_CODES
        for pc in codes:
            meshes = PREF_TO_MESH.get(pc)
            if not meshes:
                logger.info(f"  Pref {pc:02d}: no mesh mapping defined (skipped)")
                continue
            extract_dir = RAW_DIR / ds.dataset_id / f"{pc:02d}"
            for mesh_id in meshes:
                url = f"https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_{mesh_id}_SHP.zip"
                mesh_dir = extract_dir / mesh_id
                try:
                    download_zip(url, mesh_dir)
                except Exception as e:
                    logger.warning(f"  Mesh {mesh_id} failed: {e}")
        return

    if ds.scope == "national":
        extract_dir = RAW_DIR / ds.dataset_id
        try:
            download_zip(ds.url_template, extract_dir)
        except Exception as e:
            logger.error(f"  Failed: {e}")
    else:
        codes = pref_codes or PREF_CODES
        for pc in codes:
            url = ds.url_template.format(pref_code=pc)
            extract_dir = RAW_DIR / ds.dataset_id / f"{pc:02d}"
            try:
                download_zip(url, extract_dir)
            except Exception as e:
                logger.warning(f"  Pref {pc:02d} failed: {e}")


def download_all(pref_codes: list[int] | None = None, datasets: list[str] | None = None):
    """全データセット（またはサブセット）をダウンロード。"""
    target_datasets = ALL_DATASETS
    if datasets:
        target_datasets = [DATASET_NAME_MAP[d] for d in datasets if d in DATASET_NAME_MAP]

    for ds in target_datasets:
        download_dataset(ds, pref_codes)

    logger.info("=== Download complete ===")


def main():
    parser = argparse.ArgumentParser(description="国土数値情報ダウンロード")
    parser.add_argument("--dataset", "-d", nargs="+",
                        help="データセット名 (railways, land_prices, ...)")
    parser.add_argument("--pref", "-p", type=int, nargs="+",
                        help="都道府県コード (13=東京, ...)")
    args = parser.parse_args()

    download_all(
        pref_codes=args.pref,
        datasets=args.dataset,
    )


if __name__ == "__main__":
    main()
