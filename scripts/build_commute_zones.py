"""CSIS 都市雇用圏 (UEA) 2020 データから commute_zones.json を生成する。

入力: data/cache/uea_MEA2020C.csv, uea_MEA2020.csv, uea_MCEA2020C.csv, uea_MCEA2020.csv
出力: ci102-nextjs/public/data/commute_zones.json

形式:
{
  "zones": {
    "MEA_01100": {
      "name": "札幌市",
      "type": "MEA",
      "centers": ["01100"],
      "suburbs": ["01203", "01217", ...],
      "all": ["01100", "01203", ...],
      "did_pop": 1916037
    },
    ...
  },
  "muni_to_zone": {
    "01100": "MEA_01100",
    "01203": "MEA_01100",
    ...
  }
}
"""
from __future__ import annotations
import io, sys, csv, json
from pathlib import Path
from collections import defaultdict

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "cache"
OUTPUT = ROOT / "ci102-nextjs" / "public" / "data" / "commute_zones.json"


def _read_csv(path: Path) -> list[dict]:
    """Shift-JIS or UTF-8 CSV を読む。"""
    for enc in ["utf-8-sig", "utf-8", "cp932", "shift_jis"]:
        try:
            with open(path, encoding=enc, newline="") as f:
                reader = csv.DictReader(f)
                return list(reader)
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise RuntimeError(f"Cannot decode {path}")


def _pad5(code: str) -> str:
    """市区町村コードを5桁にゼロパディング。"""
    code = code.strip()
    try:
        return str(int(code)).zfill(5)
    except ValueError:
        return code


def main():
    zones: dict[str, dict] = {}
    muni_to_zone: dict[str, str] = {}

    # --- MEA (大都市雇用圏) ---
    # 中心市
    for row in _read_csv(CACHE / "uea_MEA2020C.csv"):
        mea_code = row.get("MEA", "").strip()
        center_code = row.get("center", "").strip()
        mea_name = row.get("\u90fd\u5e02\u96c7\u7528\u570f", "") or row.get("MEA Name", "") or ""
        # ヘッダーの文字化けに対応（2列目が都市名）
        if not mea_name:
            vals = list(row.values())
            mea_name = vals[1] if len(vals) > 1 else ""
        did_pop = 0
        for k, v in row.items():
            if "DID" in k and "Population" in k:
                try:
                    did_pop = int(float(v))
                except (ValueError, TypeError):
                    pass

        zone_id = f"MEA_{_pad5(mea_code)}"
        if zone_id not in zones:
            zones[zone_id] = {
                "name": mea_name.strip(),
                "type": "MEA",
                "centers": [],
                "suburbs": [],
                "did_pop": did_pop,
            }
        center = _pad5(center_code)
        zones[zone_id]["centers"].append(center)
        muni_to_zone[center] = zone_id

    # 郊外市
    for row in _read_csv(CACHE / "uea_MEA2020.csv"):
        mea_code = row.get("MEA", "").strip()
        zone_id = f"MEA_{_pad5(mea_code)}"
        # 郊外コード（suburb, suburb2, suburb3, suburb4）
        for key in ["suburb", "suburb2", "suburb3", "suburb4"]:
            sub_code = row.get(key, "").strip()
            if sub_code:
                sub = _pad5(sub_code)
                if zone_id in zones and sub not in zones[zone_id]["suburbs"]:
                    zones[zone_id]["suburbs"].append(sub)
                    muni_to_zone[sub] = zone_id

    # --- McEA (小都市雇用圏) ---
    # 中心市
    for row in _read_csv(CACHE / "uea_MCEA2020C.csv"):
        uea_code = row.get("UEA", row.get("MEA", "")).strip()
        center_code = row.get("center", "").strip()
        uea_name = ""
        vals = list(row.values())
        uea_name = vals[1] if len(vals) > 1 else ""
        did_pop = 0
        for k, v in row.items():
            if "DID" in k and "Population" in k:
                try:
                    did_pop = int(float(v))
                except (ValueError, TypeError):
                    pass

        zone_id = f"McEA_{_pad5(uea_code)}"
        if zone_id not in zones:
            zones[zone_id] = {
                "name": uea_name.strip(),
                "type": "McEA",
                "centers": [],
                "suburbs": [],
                "did_pop": did_pop,
            }
        center = _pad5(center_code)
        zones[zone_id]["centers"].append(center)
        muni_to_zone[center] = zone_id

    # 郊外市
    for row in _read_csv(CACHE / "uea_MCEA2020.csv"):
        mea_code = row.get("MEA", row.get("UEA", "")).strip()
        zone_id = f"McEA_{_pad5(mea_code)}"
        # 小都市圏の郊外は zone_id が McEA_ でない場合がある（CSVヘッダーがMEA）
        if zone_id not in zones:
            zone_id = f"McEA_{_pad5(mea_code)}"
        for key in ["suburb", "suburb2", "suburb3", "suburb4"]:
            sub_code = row.get(key, "").strip()
            if sub_code:
                sub = _pad5(sub_code)
                if zone_id in zones and sub not in zones[zone_id]["suburbs"]:
                    zones[zone_id]["suburbs"].append(sub)
                    muni_to_zone[sub] = zone_id

    # all = centers + suburbs
    for z in zones.values():
        z["all"] = sorted(set(z["centers"] + z["suburbs"]))

    # 出力
    result = {
        "zones": zones,
        "muni_to_zone": muni_to_zone,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUTPUT.stat().st_size / 1024
    print(f"出力: {OUTPUT}")
    print(f"  ゾーン数: {len(zones)}（MEA: {sum(1 for z in zones.values() if z['type']=='MEA')}, McEA: {sum(1 for z in zones.values() if z['type']=='McEA')}）")
    print(f"  マッピング市区町村数: {len(muni_to_zone)}")
    print(f"  ファイルサイズ: {size_kb:.0f} KB")

    # サンプル表示
    for zid in ["MEA_13100", "MEA_01100", "MEA_40130", "McEA_37201"]:
        z = zones.get(zid)
        if z:
            print(f"\n  {zid}: {z['name']}（{z['type']}）")
            print(f"    中心: {z['centers']}")
            print(f"    郊外: {len(z['suburbs'])}市区町村")
            print(f"    合計: {len(z['all'])}市区町村")


if __name__ == "__main__":
    main()
