"""
市区町村セントロイドから最寄り施設への実走行距離/時間を算出。
OSRM (Open Source Routing Machine) の public API を利用。

Usage:
    python scripts/compute_driving_distances.py                 # 全都道府県
    python scripts/compute_driving_distances.py --pref 13       # 東京のみ
    python scripts/compute_driving_distances.py --pref 1 --dry  # ドライラン(API呼ばず)

Output:
    data/nlni/cache/driving_distances.csv

Columns:
    pref_code, muni_code, area_name,
    nearest_station_km, nearest_station_min, nearest_station_name,
    nearest_medical_km, nearest_medical_min,
    nearest_commercial_km, nearest_commercial_min,
    car_dependency_score  (0-100, 高いほど車依存)
"""

import argparse
import io
import json
import math
import os
import sys
import time
from pathlib import Path

# Fix Windows console encoding for Japanese output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import pandas as pd

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from data.nlni.spatial import load_municipality_boundaries

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

OSRM_BASE = "https://router.project-osrm.org"  # Public demo server
OSRM_PROFILE = "car"  # driving profile
RATE_LIMIT_SECONDS = 1.1  # Public server rate limit: ~1 req/sec

CACHE_DIR = PROJECT_ROOT / "data" / "nlni" / "cache"
OUTPUT_CSV = CACHE_DIR / "driving_distances.csv"

STATIONS_CSV = CACHE_DIR / "railways_stations.csv"
MEDICAL_CSV = CACHE_DIR / "facilities_medical.csv"
COMMERCIAL_CSV = CACHE_DIR / "facilities_commercial.csv"


# --------------------------------------------------------------------------
# Haversine for pre-filtering (avoid unnecessary API calls)
# --------------------------------------------------------------------------

def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def find_nearest_by_haversine(
    centroid_lon: float, centroid_lat: float,
    facilities: pd.DataFrame, k: int = 3
) -> list[tuple[float, float, str]]:
    """Return k nearest facilities by straight-line distance. Returns list of (lon, lat, name)."""
    dists = facilities.apply(
        lambda row: haversine_km(centroid_lon, centroid_lat, row["lon"], row["lat"]),
        axis=1
    )
    nearest_idx = dists.nsmallest(k).index
    results = []
    for idx in nearest_idx:
        row = facilities.loc[idx]
        name = row.get("station_name", row.get("facility_name", ""))
        results.append((row["lon"], row["lat"], str(name)))
    return results


# --------------------------------------------------------------------------
# OSRM API
# --------------------------------------------------------------------------

def osrm_route(
    src_lon: float, src_lat: float,
    dst_lon: float, dst_lat: float,
    dry_run: bool = False
) -> tuple[float, float] | None:
    """
    Query OSRM for driving distance/duration.
    Returns (distance_km, duration_min) or None on failure.
    """
    if dry_run:
        # Approximate: haversine * 1.3 detour factor, 40km/h average
        dist = haversine_km(src_lon, src_lat, dst_lon, dst_lat) * 1.3
        return (round(dist, 1), round(dist / 40 * 60, 1))

    import urllib.request

    coords = f"{src_lon},{src_lat};{dst_lon},{dst_lat}"
    url = f"{OSRM_BASE}/route/v1/{OSRM_PROFILE}/{coords}?overview=false"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CI102-MarketAnalysis/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        if data.get("code") != "Ok" or not data.get("routes"):
            return None

        route = data["routes"][0]
        dist_km = round(route["distance"] / 1000, 1)
        dur_min = round(route["duration"] / 60, 1)
        return (dist_km, dur_min)
    except Exception as e:
        print(f"    OSRM error: {e}")
        return None


def osrm_table(
    src_lon: float, src_lat: float,
    destinations: list[tuple[float, float]],
    dry_run: bool = False
) -> list[tuple[float, float] | None]:
    """
    OSRM Table API: one source to multiple destinations.
    More efficient than individual route queries.
    Returns list of (distance_km, duration_min) for each destination.
    """
    if dry_run:
        results = []
        for dst_lon, dst_lat in destinations:
            dist = haversine_km(src_lon, src_lat, dst_lon, dst_lat) * 1.3
            results.append((round(dist, 1), round(dist / 40 * 60, 1)))
        return results

    import urllib.request

    # Build coordinates string: source first, then all destinations
    all_coords = [(src_lon, src_lat)] + list(destinations)
    coords_str = ";".join(f"{lon},{lat}" for lon, lat in all_coords)
    sources_idx = "0"
    dest_indices = ";".join(str(i) for i in range(1, len(all_coords)))

    url = (
        f"{OSRM_BASE}/table/v1/{OSRM_PROFILE}/{coords_str}"
        f"?sources={sources_idx}&destinations={dest_indices}"
        f"&annotations=distance,duration"
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CI102-MarketAnalysis/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())

        if data.get("code") != "Ok":
            return [None] * len(destinations)

        distances = data["distances"][0]  # First (only) source row
        durations = data["durations"][0]

        results = []
        for dist_m, dur_s in zip(distances, durations):
            if dist_m is None or dur_s is None:
                results.append(None)
            else:
                results.append((round(dist_m / 1000, 1), round(dur_s / 60, 1)))
        return results
    except Exception as e:
        print(f"    OSRM table error: {e}")
        return [None] * len(destinations)


# --------------------------------------------------------------------------
# Car Dependency Score
# --------------------------------------------------------------------------

def car_dependency_score(
    station_min: float | None,
    medical_min: float | None,
    commercial_min: float | None,
    num_stations: int = 0,
    num_bus_stops: int = 0,
) -> int:
    """
    Car dependency score (0-100). Higher = more car-dependent.
    Based on:
    - Time to nearest station (weight 35%)
    - Time to nearest medical facility (weight 25%)
    - Time to nearest commercial facility (weight 20%)
    - Public transit availability penalty (weight 20%)
    """
    # Station time component (0-100): 0min=0, 30min+=100
    st = min((station_min or 60) / 30 * 100, 100) * 0.35

    # Medical time component: 0min=0, 20min+=100
    med = min((medical_min or 40) / 20 * 100, 100) * 0.25

    # Commercial time component: 0min=0, 15min+=100
    com = min((commercial_min or 30) / 15 * 100, 100) * 0.20

    # Transit availability: no stations & <3 bus stops = 100
    if num_stations == 0 and num_bus_stops < 3:
        transit_penalty = 100
    elif num_stations == 0:
        transit_penalty = 60
    elif num_stations <= 1 and num_bus_stops < 5:
        transit_penalty = 30
    else:
        transit_penalty = 0
    tp = transit_penalty * 0.20

    return min(100, round(st + med + com + tp))


# --------------------------------------------------------------------------
# Main processing
# --------------------------------------------------------------------------

def compute_municipality_centroids(pref_code: int) -> list[dict]:
    """
    Load TopoJSON boundaries and compute centroids.
    Returns list of {muni_code, area_name, lon, lat}.
    """
    boundaries = load_municipality_boundaries(pref_code)
    results = []
    seen_codes = set()

    for b in boundaries:
        props = b["properties"]
        muni_code = props.get("N03_007", "")
        area_name = props.get("N03_004", props.get("N03_003", ""))

        if not muni_code or muni_code in seen_codes:
            continue
        seen_codes.add(muni_code)

        centroid = b["geometry"].centroid
        results.append({
            "muni_code": muni_code,
            "area_name": area_name,
            "lon": round(centroid.x, 6),
            "lat": round(centroid.y, 6),
        })

    return results


def process_prefecture(
    pref_code: int,
    stations_df: pd.DataFrame,
    medical_df: pd.DataFrame,
    commercial_df: pd.DataFrame,
    dry_run: bool = False,
) -> list[dict]:
    """Process all municipalities in a prefecture."""

    print(f"\n[{pref_code:02d}] Computing centroids...")
    centroids = compute_municipality_centroids(pref_code)
    if not centroids:
        print(f"  No centroids found for pref {pref_code}")
        return []

    # Filter facilities to nearby prefectures (±2 codes for border areas)
    nearby_prefs = set(range(max(1, pref_code - 2), min(47, pref_code + 2) + 1))
    local_stations = stations_df[stations_df["pref_code"].isin(nearby_prefs)].copy()
    local_medical = medical_df[medical_df["pref_code"].isin(nearby_prefs)].copy()
    local_commercial = commercial_df[commercial_df["pref_code"].isin(nearby_prefs)].copy()

    print(f"  {len(centroids)} municipalities, "
          f"stations={len(local_stations)}, medical={len(local_medical)}, commercial={len(local_commercial)}")

    results = []
    for i, muni in enumerate(centroids):
        mlon, mlat = muni["lon"], muni["lat"]

        # Find k nearest by haversine (pre-filter for OSRM)
        nearest_st = find_nearest_by_haversine(mlon, mlat, local_stations, k=3) if len(local_stations) > 0 else []
        nearest_med = find_nearest_by_haversine(mlon, mlat, local_medical, k=3) if len(local_medical) > 0 else []
        nearest_com = find_nearest_by_haversine(mlon, mlat, local_commercial, k=3) if len(local_commercial) > 0 else []

        # Build destination list for OSRM table API (batch query)
        destinations = []
        dest_labels = []  # track which destination is which
        for lon, lat, name in nearest_st:
            destinations.append((lon, lat))
            dest_labels.append(("station", name))
        for lon, lat, _ in nearest_med:
            destinations.append((lon, lat))
            dest_labels.append(("medical", ""))
        for lon, lat, _ in nearest_com:
            destinations.append((lon, lat))
            dest_labels.append(("commercial", ""))

        # Query OSRM table API (one call for all destinations)
        if destinations:
            if not dry_run:
                time.sleep(RATE_LIMIT_SECONDS)
            route_results = osrm_table(mlon, mlat, destinations, dry_run=dry_run)
        else:
            route_results = []

        # Parse results by category
        station_results = []
        medical_results = []
        commercial_results = []
        for j, (label, name) in enumerate(dest_labels):
            if j < len(route_results) and route_results[j] is not None:
                dist_km, dur_min = route_results[j]
                if label == "station":
                    station_results.append((dist_km, dur_min, name))
                elif label == "medical":
                    medical_results.append((dist_km, dur_min))
                elif label == "commercial":
                    commercial_results.append((dist_km, dur_min))

        # Pick closest for each category
        best_station = min(station_results, key=lambda x: x[1]) if station_results else (None, None, "")
        best_medical = min(medical_results, key=lambda x: x[1]) if medical_results else (None, None)
        best_commercial = min(commercial_results, key=lambda x: x[1]) if commercial_results else (None, None)

        # Get transit counts from existing data
        pref_stations = stations_df[
            (stations_df["pref_code"] == pref_code) &
            (stations_df["muni_code"].astype(str) == str(muni["muni_code"]))
        ]
        num_stations = len(pref_stations)

        row = {
            "pref_code": pref_code,
            "muni_code": muni["muni_code"],
            "area_name": muni["area_name"],
            "centroid_lon": mlon,
            "centroid_lat": mlat,
            "nearest_station_km": best_station[0],
            "nearest_station_min": best_station[1],
            "nearest_station_name": best_station[2],
            "nearest_medical_km": best_medical[0] if len(best_medical) >= 2 else None,
            "nearest_medical_min": best_medical[1] if len(best_medical) >= 2 else None,
            "nearest_commercial_km": best_commercial[0] if len(best_commercial) >= 2 else None,
            "nearest_commercial_min": best_commercial[1] if len(best_commercial) >= 2 else None,
            "car_dependency_score": car_dependency_score(
                best_station[1], best_medical[1] if len(best_medical) >= 2 else None,
                best_commercial[1] if len(best_commercial) >= 2 else None,
                num_stations=num_stations,
                num_bus_stops=0,  # Will be enriched later
            ),
        }
        results.append(row)

        if (i + 1) % 10 == 0 or i == len(centroids) - 1:
            st_str = f"駅{best_station[1]:.0f}分" if best_station[1] else "駅-"
            med_str = f"医療{best_medical[1]:.0f}分" if (len(best_medical) >= 2 and best_medical[1]) else "医療-"
            com_str = f"商業{best_commercial[1]:.0f}分" if (len(best_commercial) >= 2 and best_commercial[1]) else "商業-"
            print(f"  [{i + 1}/{len(centroids)}] {muni['area_name']}: {st_str} / {med_str} / {com_str} -> dep={row['car_dependency_score']}")

    return results


def main():
    parser = argparse.ArgumentParser(description="Compute driving distances via OSRM")
    parser.add_argument("--pref", type=int, help="Process specific prefecture code only")
    parser.add_argument("--dry", action="store_true", help="Dry run: use haversine approximation instead of OSRM API")
    args = parser.parse_args()

    # Load facility data
    print("Loading facility data...")
    stations_df = pd.read_csv(STATIONS_CSV) if STATIONS_CSV.exists() else pd.DataFrame(columns=["pref_code", "lon", "lat", "station_name", "muni_code"])
    medical_df = pd.read_csv(MEDICAL_CSV) if MEDICAL_CSV.exists() else pd.DataFrame(columns=["pref_code", "lon", "lat", "facility_name"])
    commercial_df = pd.read_csv(COMMERCIAL_CSV) if COMMERCIAL_CSV.exists() else pd.DataFrame(columns=["pref_code", "lon", "lat", "facility_name"])

    # Ensure numeric columns
    for df in [stations_df, medical_df, commercial_df]:
        if "lon" in df.columns:
            df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
            df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
            df.dropna(subset=["lon", "lat"], inplace=True)
            df["pref_code"] = pd.to_numeric(df["pref_code"], errors="coerce").fillna(0).astype(int)

    print(f"  Stations: {len(stations_df)}, Medical: {len(medical_df)}, Commercial: {len(commercial_df)}")

    # Process prefectures
    pref_codes = [args.pref] if args.pref else list(range(1, 48))
    all_results = []

    # Load existing results for incremental processing
    if OUTPUT_CSV.exists() and args.pref:
        try:
            existing = pd.read_csv(OUTPUT_CSV)
            if not existing.empty:
                # Remove the prefecture we're reprocessing
                existing = existing[existing["pref_code"] != args.pref]
                all_results = existing.to_dict("records")
        except (pd.errors.EmptyDataError, pd.errors.ParserError):
            pass  # Empty or corrupt file, start fresh

    for pcode in pref_codes:
        try:
            results = process_prefecture(pcode, stations_df, medical_df, commercial_df, dry_run=args.dry)
            all_results.extend(results)
        except Exception as e:
            print(f"  ERROR pref {pcode}: {e}")
            continue

    # Save
    df = pd.DataFrame(all_results)
    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    print(f"\nSaved: {OUTPUT_CSV} ({len(df)} rows)")

    # Summary statistics
    if len(df) > 0 and "car_dependency_score" in df.columns:
        print(f"\n--- Summary ---")
        print(f"Car dependency score: mean={df['car_dependency_score'].mean():.1f}, "
              f"median={df['car_dependency_score'].median():.1f}")
        high_dep = df[df["car_dependency_score"] >= 70]
        print(f"High car-dependency (≥70): {len(high_dep)} municipalities ({len(high_dep)/len(df)*100:.0f}%)")


if __name__ == "__main__":
    main()
