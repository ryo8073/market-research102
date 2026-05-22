"""Fetch 建築着工統計 from e-Stat and compute per-prefecture housing development defaults.

Outputs:
  ci102-nextjs/public/data/housing_defaults.json

Contains per-prefecture:
  - avg_unit_area_m2: average floor area per apartment unit (共同住宅 新築)
  - avg_floors: weighted average number of floors for residential buildings
  - avg_units_per_building: estimated average units per apartment building
  - data_year: source data year

Data Sources:
  - 建築着工統計 年報 Table 16 (statsDataId: 0003114613)
    tab=18(戸数), tab=13(床面積合計), cat01=14(共同住宅), cat02=12(新築)
  - 建築着工統計 月報 Table 4 (statsDataId: 0003114393)
    tab=12(建築物の数), cat03=12(A居住専用住宅), cat02=(階数帯別)

Usage:
  python scripts/fetch_housing_starts.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests

ESTAT_BASE = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
APP_ID = ""

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "ci102-nextjs" / "public" / "data"

PREFECTURES = {
    1: "北海道", 2: "青森県", 3: "岩手県", 4: "宮城県", 5: "秋田県",
    6: "山形県", 7: "福島県", 8: "茨城県", 9: "栃木県", 10: "群馬県",
    11: "埼玉県", 12: "千葉県", 13: "東京都", 14: "神奈川県", 15: "新潟県",
    16: "富山県", 17: "石川県", 18: "福井県", 19: "山梨県", 20: "長野県",
    21: "岐阜県", 22: "静岡県", 23: "愛知県", 24: "三重県", 25: "滋賀県",
    26: "京都府", 27: "大阪府", 28: "兵庫県", 29: "奈良県", 30: "和歌山県",
    31: "鳥取県", 32: "島根県", 33: "岡山県", 34: "広島県", 35: "山口県",
    36: "徳島県", 37: "香川県", 38: "愛媛県", 39: "高知県", 40: "福岡県",
    41: "佐賀県", 42: "長崎県", 43: "熊本県", 44: "大分県", 45: "宮崎県",
    46: "鹿児島県", 47: "沖縄県",
}


def estat_fetch(stats_data_id: str, **kwargs) -> list[dict]:
    """Fetch data from e-Stat API with retry."""
    params = {"appId": APP_ID, "statsDataId": stats_data_id, **kwargs}
    for attempt in range(3):
        try:
            r = requests.get(ESTAT_BASE, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
            values = (
                data.get("GET_STATS_DATA", {})
                .get("STATISTICAL_DATA", {})
                .get("DATA_INF", {})
                .get("VALUE", [])
            )
            return values
        except Exception as e:
            print(f"  Retry {attempt + 1}: {e}")
            time.sleep(3)
    return []


def fetch_apartment_area_by_pref(year: str = "2023000000") -> dict[int, dict]:
    """Fetch avg floor area per apartment unit by prefecture.

    Table 16 (0003114613):
      tab=18 → 戸数, tab=13 → 床面積の合計
      cat01=14 → 共同住宅
      cat02=12 → 新築
    """
    print("Fetching Table 16: apartment units & floor area...")
    result: dict[int, dict] = {}

    # Fetch units (戸数)
    units_data = estat_fetch(
        "0003114613",
        cdTab="18",       # 戸数・件数
        cdCat01="14",     # 共同住宅
        cdCat02="12",     # 新築
        cdTime=year,
    )
    print(f"  戸数: {len(units_data)} records")

    # Fetch floor area (床面積の合計)
    area_data = estat_fetch(
        "0003114613",
        cdTab="13",       # 床面積の合計
        cdCat01="14",     # 共同住宅
        cdCat02="12",     # 新築
        cdTime=year,
    )
    print(f"  床面積: {len(area_data)} records")

    # Parse into prefecture-level data
    units_by_pref: dict[str, float] = {}
    area_by_pref: dict[str, float] = {}

    for v in units_data:
        area_code = v.get("@area", "")
        val = v.get("$", "")
        if val in ("", "-", "…", "x"):
            continue
        units_by_pref[area_code] = float(val)

    for v in area_data:
        area_code = v.get("@area", "")
        val = v.get("$", "")
        if val in ("", "-", "…", "x"):
            continue
        area_by_pref[area_code] = float(val)

    for pref_code, pref_name in PREFECTURES.items():
        area_key = f"{pref_code:05d}".replace(f"{pref_code:02d}", f"{pref_code:02d}")
        # Prefecture area codes: 01000, 02000, ..., 47000
        area_key = f"{pref_code:02d}000"
        units = units_by_pref.get(area_key, 0)
        area = area_by_pref.get(area_key, 0)

        if units > 0 and area > 0:
            result[pref_code] = {
                "pref_name": pref_name,
                "apartment_units": int(units),
                "apartment_area_total_m2": round(area),
                "avg_unit_area_m2": round(area / units, 1),
            }
        else:
            print(f"  WARNING: No data for {pref_name} (code={area_key}, units={units}, area={area})")

    return result


def fetch_building_stories_by_pref() -> dict[int, dict]:
    """Fetch building count by story range for residential buildings by prefecture.

    Table 4 (0003114393) — monthly data, sum 2023 full year.
      tab=12 → 建築物の数
      cat01=11 → 計 (all structures)
      cat03=12 → A居住専用住宅
      cat02=11~20 → 階数帯
      time=2023年1月~12月
    """
    print("\nFetching Table 4: building stories distribution...")

    # Story range midpoints for weighted average
    story_midpoints = {
        "12": 1,      # 1階
        "13": 2,      # 2階
        "14": 3,      # 3階
        "15": 4.5,    # 4~5階
        "16": 7.5,    # 6~9階
        "17": 12.5,   # 10~15階
        "18": 18,     # 16~20階
        "19": 23,     # 21~25階
        "20": 28,     # 26~30階 (approximate based on earlier metadata showing this might exist)
    }

    # Fetch all months of 2023
    all_values = []
    for month in range(1, 13):
        time_code = f"2023{month:04d}{month:02d}"
        values = estat_fetch(
            "0003114393",
            cdTab="12",       # 建築物の数
            cdCat01="11",     # 計 (all structures)
            cdCat03="12",     # A居住専用住宅
            cdTime=time_code,
        )
        all_values.extend(values)
        time.sleep(0.3)  # Rate limit

    print(f"  Total records: {len(all_values)}")

    # Aggregate by prefecture and story range
    pref_stories: dict[str, dict[str, float]] = {}
    for v in all_values:
        area_code = v.get("@area", "")
        story_code = v.get("@cat02", "")
        val = v.get("$", "")
        if val in ("", "-", "…", "x") or story_code == "11":  # Skip 計
            continue
        if story_code not in story_midpoints:
            continue

        if area_code not in pref_stories:
            pref_stories[area_code] = {}
        pref_stories[area_code][story_code] = (
            pref_stories[area_code].get(story_code, 0) + float(val)
        )

    # Codes for 3F+ buildings only (proxy for apartment/collective housing)
    apartment_story_codes = {"14", "15", "16", "17", "18", "19", "20"}

    result: dict[int, dict] = {}
    for pref_code, pref_name in PREFECTURES.items():
        area_key = f"{pref_code:02d}000"
        stories = pref_stories.get(area_key, {})
        if not stories:
            print(f"  WARNING: No story data for {pref_name}")
            continue

        # Weighted average floors: ALL residential (including detached)
        total_buildings = sum(stories.values())
        if total_buildings == 0:
            continue

        # Weighted average floors: 3F+ only (apartments/collective housing)
        apt_buildings = {
            code: count for code, count in stories.items()
            if code in apartment_story_codes
        }
        apt_total = sum(apt_buildings.values())

        if apt_total > 0:
            apt_weighted = sum(
                story_midpoints[code] * count
                for code, count in apt_buildings.items()
            )
            avg_floors_apartment = apt_weighted / apt_total
        else:
            avg_floors_apartment = 3.0  # Fallback

        # Story distribution for apartments (for explanation)
        story_distribution = {}
        for code, count in sorted(apt_buildings.items()):
            mp = story_midpoints[code]
            if mp == 3:
                label = "3F"
            elif mp == 4.5:
                label = "4-5F"
            elif mp == 7.5:
                label = "6-9F"
            elif mp == 12.5:
                label = "10-15F"
            else:
                label = f"{int(mp)}F+"
            story_distribution[label] = int(count)

        result[pref_code] = {
            "total_residential_buildings": int(total_buildings),
            "apartment_buildings_3f_plus": int(apt_total),
            "avg_floors_all": round(
                sum(story_midpoints.get(c, 1) * n for c, n in stories.items()) / total_buildings,
                1,
            ),
            "avg_floors_apartment": round(avg_floors_apartment, 1),
            "story_distribution": story_distribution,
        }

    return result


def main():
    global APP_ID

    # Load API key from .env if not set
    if not APP_ID:
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if line.startswith("ESTAT_APP_ID="):
                    APP_ID = line.split("=", 1)[1].strip().strip('"')
                    break

    if not APP_ID:
        # Try .env.local in nextjs dir
        env_local = Path(__file__).resolve().parent.parent / "ci102-nextjs" / ".env.local"
        if env_local.exists():
            for line in env_local.read_text(encoding="utf-8").splitlines():
                if line.startswith("ESTAT_APP_ID="):
                    APP_ID = line.split("=", 1)[1].strip().strip('"')
                    break

    if not APP_ID:
        print("ERROR: ESTAT_APP_ID not found in .env or ci102-nextjs/.env.local")
        sys.exit(1)

    print(f"e-Stat APP_ID: {APP_ID[:8]}...")

    # Fetch data
    apartment_data = fetch_apartment_area_by_pref()
    story_data = fetch_building_stories_by_pref()

    # Combine into final output
    output: dict[str, dict] = {}

    for pref_code, pref_name in PREFECTURES.items():
        apt = apartment_data.get(pref_code, {})
        stories = story_data.get(pref_code, {})

        avg_area = apt.get("avg_unit_area_m2", 50)  # Fallback
        # Use apartment-only average floors (3F+ buildings)
        avg_floors_apt = stories.get("avg_floors_apartment", 5)
        apt_units = apt.get("apartment_units", 0)
        apt_buildings = stories.get("apartment_buildings_3f_plus", 0)

        # Estimate units per building: apartment units / apartment buildings
        avg_units_per_building = 20  # Default
        if apt_buildings > 0 and apt_units > 0:
            avg_units_per_building = round(apt_units / apt_buildings, 1)

        # Estimate units per floor from actual data
        avg_units_per_floor = 4  # Default
        if avg_floors_apt > 0 and avg_units_per_building > 0:
            avg_units_per_floor = round(avg_units_per_building / max(avg_floors_apt, 1), 1)
            avg_units_per_floor = max(1, min(avg_units_per_floor, 20))  # Clamp

        output[str(pref_code)] = {
            "pref_name": pref_name,
            "avg_unit_area_m2": avg_area,
            "avg_floors": avg_floors_apt,
            "avg_floors_all_residential": stories.get("avg_floors_all", None),
            "avg_units_per_building": avg_units_per_building,
            "avg_units_per_floor": avg_units_per_floor,
            "apartment_units_2023": apt.get("apartment_units", None),
            "apartment_buildings_3f_plus_2023": apt_buildings or None,
            "story_distribution": stories.get("story_distribution", None),
            "data_year": 2023,
            "_note": "avg_floors is for 3F+ buildings only (apartments). avg_floors_all_residential includes detached houses.",
        }
        print(f"  {pref_name}: area={avg_area}m2, apt_floors={avg_floors_apt}, units/bldg={avg_units_per_building}, units/floor={avg_units_per_floor}")

    # National average
    all_areas = [v["avg_unit_area_m2"] for v in output.values() if v["avg_unit_area_m2"]]
    all_floors = [v["avg_floors"] for v in output.values() if v["avg_floors"]]
    national_avg_area = round(sum(all_areas) / len(all_areas), 1) if all_areas else 50
    national_avg_floors = round(sum(all_floors) / len(all_floors), 1) if all_floors else 5

    output["national"] = {
        "pref_name": "全国平均",
        "avg_unit_area_m2": national_avg_area,
        "avg_floors": national_avg_floors,
        "avg_units_per_building": None,
        "avg_units_per_floor": None,
        "data_year": 2023,
        "_note": "avg_floors is for 3F+ buildings only (apartments).",
    }

    # Save
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "housing_defaults.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n=== Saved to {out_path} ===")
    print(f"National avg: area={national_avg_area}m2, floors={national_avg_floors}")
    print(f"Prefectures: {len(output) - 1}")


if __name__ == "__main__":
    main()
