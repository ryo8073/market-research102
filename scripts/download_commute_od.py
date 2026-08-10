"""通勤OD行列を都道府県別にe-Statから取得し、分割JSONで保存する。

データ: 国勢調査 2020年 従業地・通学地集計
テーブル: 0003454527 (従業・通学市区町村，男女別通勤者・通学者数)

area = 常住地（Origin: どこに住んでいるか）
cat02 = 従業地（Destination: どこに通勤しているか）
cat01 = 0（総数）

出力: ci102-nextjs/public/data/commute_od/{pref_code}.json
形式: {
  "origin_code": {
    "dest_code": commuters,
    ...
  },
  "_meta": { "total_employed": N }
}

使い方: python scripts/download_commute_od.py [pref_code]
  pref_code省略時は全47都道府県を取得
"""
from __future__ import annotations
import io, sys, json, urllib.parse, urllib.request, os, time
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

APP_ID = os.environ.get("ESTAT_APP_ID", "")
BASE = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
TABLE_ID = "0003454527"
OUTPUT_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "commute_od"

PREF_NAMES = {
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


def _fetch(params: dict) -> list[dict]:
    """ページネーション付きで全レコード取得。"""
    all_values: list[dict] = []
    start = 1
    while True:
        p = {**params, "appId": APP_ID, "lang": "J", "limit": 100000, "startPosition": start}
        url = BASE + "?" + urllib.parse.urlencode(p)
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                d = json.load(r)
        except Exception as e:
            print(f"  ERROR: {e}")
            break
        try:
            values = d["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
        except (KeyError, TypeError):
            values = []
        if isinstance(values, dict):
            values = [values]
        all_values.extend(values)
        if len(values) < 100000:
            break
        start += 100000
        time.sleep(0.3)
    return all_values


def _num(s: str) -> int | None:
    s = str(s).strip()
    if s in ("-", "", "...", "x", "***", "X", "*", "N/A", "…"):
        return None
    try:
        return int(float(s.replace(",", "")))
    except ValueError:
        return None


def _get_muni_codes(pref_code: int) -> list[str]:
    """メタ情報から都道府県内の市区町村コード一覧を取得。"""
    url = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?" + urllib.parse.urlencode(
        {"appId": APP_ID, "lang": "J", "statsDataId": TABLE_ID}
    )
    with urllib.request.urlopen(url, timeout=60) as r:
        d = json.load(r)
    objs = d["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
    pref_str = f"{pref_code:02d}"
    codes = []
    for o in objs:
        if o.get("@id") == "area":
            cl = o.get("CLASS", [])
            if isinstance(cl, dict):
                cl = [cl]
            for c in cl:
                code = c.get("@code", "")
                if code.startswith(pref_str) and len(code) >= 4 and not code.endswith("000") and code != "00000":
                    codes.append(code)
    return codes

# メタ情報キャッシュ
_muni_codes_cache: dict[int, list[str]] = {}

def download_pref(pref_code: int) -> dict:
    """1都道府県の通勤OD行列を取得。

    市区町村ごとにAPIを呼び出し、全通勤先を取得する。
    """
    pref_str = f"{pref_code:02d}"
    print(f"\n=== {pref_str} {PREF_NAMES.get(pref_code, '')} ===")

    # この県の市区町村コード一覧
    if pref_code not in _muni_codes_cache:
        _muni_codes_cache[pref_code] = _get_muni_codes(pref_code)
    muni_codes = _muni_codes_cache[pref_code]
    print(f"  市区町村数: {len(muni_codes)}")

    od: dict[str, dict[str, int]] = {}
    total_employed: dict[str, int] = {}

    for i, muni_code in enumerate(muni_codes):
        # 市区町村ごとにAPIリクエスト
        values = _fetch({
            "statsDataId": TABLE_ID,
            "cdTab": "2020_51",
            "cdCat01": "0",
            "cdArea": muni_code,
            "cdTime": "2020000000",
        })

        origin = muni_code.zfill(5)
        for v in values:
            count = _num(v.get("$", ""))
            if count is None or count == 0:
                continue
            dest = v.get("@cat02", "").strip()

            if dest == "00000":
                total_employed[origin] = count
                continue
            if len(dest) < 4 or dest.endswith("000"):
                continue

            dest = dest.zfill(5)
            if origin not in od:
                od[origin] = {}
            od[origin][dest] = count

        if (i + 1) % 10 == 0 or i == len(muni_codes) - 1:
            print(f"  進捗: {i+1}/{len(muni_codes)} 市区町村")
        time.sleep(0.2)  # API負荷対策

    n_origins = len(od)
    n_pairs = sum(len(dests) for dests in od.values())
    print(f"  OD: {n_origins} origins, {n_pairs} non-zero pairs")

    return {
        "od": od,
        "total_employed": total_employed,
    }


def save_pref(pref_code: int, data: dict):
    """都道府県別JSONに保存。"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{pref_code:02d}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = path.stat().st_size / 1024
    print(f"  保存: {path.name} ({size_kb:.0f} KB)")


def main():
    if not APP_ID:
        raise SystemExit("ESTAT_APP_ID が .env に設定されていません")

    # コマンドライン引数で都道府県を指定可能
    target_prefs = list(range(1, 48))
    if len(sys.argv) > 1:
        target_prefs = [int(x) for x in sys.argv[1:]]

    for pc in target_prefs:
        try:
            data = download_pref(pc)
            save_pref(pc, data)
        except Exception as e:
            print(f"  ERROR: {e}")
        time.sleep(1)  # API負荷対策

    # サマリー
    print("\n=== サマリー ===")
    total_size = 0
    total_pairs = 0
    if OUTPUT_DIR.exists():
        for f in sorted(OUTPUT_DIR.glob("*.json")):
            size = f.stat().st_size / 1024
            total_size += size
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
                pairs = sum(len(v) for v in d.get("od", {}).values())
                total_pairs += pairs
    print(f"  合計サイズ: {total_size/1024:.1f} MB")
    print(f"  合計ペア数: {total_pairs:,}")


if __name__ == "__main__":
    main()
