"""過去の国勢調査（2000-2020）人口・世帯数を e-Stat から一括取得し時系列CSVを生成する。

データソース:
  社会・人口統計体系 市区町村データ (statsDataId: 0000020101)
  - A1101: 人口総数（国勢調査）
  - A1301: 15歳未満人口
  - A1303: 65歳以上人口
  - A7101: 世帯数（一般世帯）

  + 2025年国勢調査速報 (既存CSVから統合)

出力:
  data/cache/census_population_timeseries.csv
  列: area_code, area_name, year, population, households, pop_under15, pop_over65

使い方:
  python scripts/download_population_timeseries.py
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
CACHE_DIR = ROOT / "data" / "cache"
OUT_CSV = CACHE_DIR / "census_population_timeseries.csv"

# 社会・人口統計体系 市区町村データ
TABLE_ID = "0000020101"

# 取得する指標コード
ITEMS = {
    "A1101": "population",       # 人口総数
    "A1301": "pop_under15",      # 15歳未満人口
    "A1303": "pop_over65",       # 65歳以上人口
}
# 世帯数はcat01のコードが別系列
ITEMS_HH = {
    "A7101": "households",       # 一般世帯数
}

# 取得する国勢調査年（時間軸コード）
# 社会・人口統計体系の時間軸コードは年をそのまま使用
CENSUS_YEARS = [2000, 2005, 2010, 2015, 2020]


def _fetch(params: dict) -> list[dict]:
    """e-Stat APIからページネーション付きで全レコード取得。"""
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
        print(f"  取得済み: {len(all_values)} レコード")
        if len(values) < 100000:
            break
        start += 100000
        time.sleep(0.5)  # レート制限対策
    return all_values


def _fetch_meta(meta_id: str) -> dict[str, str]:
    """メタ情報（地域名等）を取得。"""
    url = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?" + urllib.parse.urlencode(
        {"appId": APP_ID, "lang": "J", "statsDataId": TABLE_ID}
    )
    with urllib.request.urlopen(url, timeout=60) as r:
        d = json.load(r)
    objs = d["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
    for o in objs:
        if o.get("@id") == meta_id:
            cl = o.get("CLASS", [])
            if isinstance(cl, dict):
                cl = [cl]
            return {c["@code"]: c["@name"] for c in cl}
    return {}


def _num(s: str) -> float | None:
    s = str(s).strip()
    if s in ("-", "", "...", "x", "***", "X", "*", "N/A", "…"):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def _time_code_to_year(tc: str) -> int | None:
    """時間軸コードから年を抽出（例: '2020100000' → 2020, '2020' → 2020）。"""
    tc = tc.strip()
    if len(tc) >= 4:
        try:
            return int(tc[:4])
        except ValueError:
            return None
    return None


def main():
    if not APP_ID:
        raise SystemExit("ESTAT_APP_ID が .env に設定されていません")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # メタ情報取得
    print("メタ情報を取得中...")
    area_names = _fetch_meta("area")
    cat_names = _fetch_meta("cat01")
    time_names = _fetch_meta("time")
    print(f"  地域: {len(area_names)} / 指標: {len(cat_names)} / 時間: {len(time_names)}")

    # 指標コードのマッチング（cat01のコードが完全一致しない場合に対応）
    all_item_codes = list(ITEMS.keys()) + list(ITEMS_HH.keys())
    matched_codes = []
    for code in all_item_codes:
        if code in cat_names:
            matched_codes.append(code)
            print(f"  指標 {code}: {cat_names[code]}")
        else:
            # 部分一致で探す
            for k, v in cat_names.items():
                if k.startswith(code):
                    matched_codes.append(k)
                    print(f"  指標 {code} → {k}: {v}")
                    break

    # 時間軸コードのマッチング
    year_to_timecode: dict[int, str] = {}
    for tc, tn in time_names.items():
        y = _time_code_to_year(tc)
        if y and y in CENSUS_YEARS:
            year_to_timecode[y] = tc

    print(f"  利用可能な年: {sorted(year_to_timecode.keys())}")

    if not year_to_timecode:
        # 年コードが直接数字の場合
        for y in CENSUS_YEARS:
            for tc in [str(y), f"{y}000000", f"{y}100000"]:
                if tc in time_names:
                    year_to_timecode[y] = tc
                    break

    # データ取得: 指標×年の組み合わせで取得
    import pandas as pd

    records: dict[tuple[str, int], dict] = {}  # (area_code, year) → {population, households, ...}

    for item_code in all_item_codes:
        field_name = ITEMS.get(item_code) or ITEMS_HH.get(item_code, item_code)
        print(f"\n--- {field_name} ({item_code}) ---")

        for year in sorted(year_to_timecode.keys()):
            tc = year_to_timecode[year]
            print(f"  {year}年 (time={tc})...")
            params = {
                "statsDataId": TABLE_ID,
                "cdCat01": item_code,
                "cdTime": tc,
            }
            values = _fetch(params)
            count = 0
            for v in values:
                val = _num(v.get("$", ""))
                if val is None:
                    continue
                ac = v.get("@area", "").strip()
                # 5桁にゼロパディング（e-Statは数値コードで返す場合あり）
                try:
                    ac = str(int(ac)).zfill(5)
                except ValueError:
                    continue
                # 全国(00000)はスキップ、都道府県(XX000)と市区町村(XXXXX)のみ
                if ac == "00000":
                    continue
                key = (ac, year)
                if key not in records:
                    records[key] = {
                        "area_code": ac,
                        "area_name": area_names.get(ac, area_names.get(ac[:2], ac)),
                        "year": year,
                    }
                records[key][field_name] = val
                count += 1
            print(f"    → {count} 件")
            time.sleep(0.3)

    # 2025年データの統合（既存CSVから）
    csv_2025 = CACHE_DIR / "census_population_2025.csv"
    if csv_2025.exists():
        print(f"\n--- 2025年データを {csv_2025} から統合 ---")
        df25 = pd.read_csv(csv_2025)
        pop_rows = df25[df25["category_name"] == "人口"]
        hh_rows = df25[df25["category_name"] == "世帯数"]
        for _, row in pop_rows.iterrows():
            ac = str(int(row["area_code"])).zfill(5)
            if ac == "00000":
                continue
            key = (ac, 2025)
            if key not in records:
                records[key] = {
                    "area_code": ac,
                    "area_name": row.get("area_name", ac),
                    "year": 2025,
                }
            records[key]["population"] = row["value"]
        for _, row in hh_rows.iterrows():
            ac = str(int(row["area_code"])).zfill(5)
            if ac == "00000":
                continue
            key = (ac, 2025)
            if key in records:
                records[key]["households"] = row["value"]
        print(f"  統合: 人口 {len(pop_rows)} 件, 世帯 {len(hh_rows)} 件")
    else:
        print(f"\n⚠ 2025年CSV未発見 ({csv_2025})。先に download_population_2025.py を実行してください。")

    # DataFrame化
    df = pd.DataFrame(list(records.values()))
    # 列順を整理
    cols = ["area_code", "area_name", "year", "population", "households", "pop_under15", "pop_over65"]
    for c in cols:
        if c not in df.columns:
            df[c] = None
    df = df[cols]

    # 都道府県集計を追加（市区町村から合算）
    # area_codeの先頭2桁が都道府県コード。XX000が無い年は市区町村から集計する
    PREF_NAMES = {
        "01": "北海道", "02": "青森県", "03": "岩手県", "04": "宮城県", "05": "秋田県",
        "06": "山形県", "07": "福島県", "08": "茨城県", "09": "栃木県", "10": "群馬県",
        "11": "埼玉県", "12": "千葉県", "13": "東京都", "14": "神奈川県", "15": "新潟県",
        "16": "富山県", "17": "石川県", "18": "福井県", "19": "山梨県", "20": "長野県",
        "21": "岐阜県", "22": "静岡県", "23": "愛知県", "24": "三重県", "25": "滋賀県",
        "26": "京都府", "27": "大阪府", "28": "兵庫県", "29": "奈良県", "30": "和歌山県",
        "31": "鳥取県", "32": "島根県", "33": "岡山県", "34": "広島県", "35": "山口県",
        "36": "徳島県", "37": "香川県", "38": "愛媛県", "39": "高知県", "40": "福岡県",
        "41": "佐賀県", "42": "長崎県", "43": "熊本県", "44": "大分県", "45": "宮崎県",
        "46": "鹿児島県", "47": "沖縄県",
    }
    muni = df[~df["area_code"].str.endswith("000")].copy()
    muni["pref_code"] = muni["area_code"].str[:2]
    num_cols = ["population", "households", "pop_under15", "pop_over65"]
    pref_agg = muni.groupby(["pref_code", "year"])[num_cols].sum(min_count=1).reset_index()
    pref_rows = []
    for _, row in pref_agg.iterrows():
        pc = row["pref_code"]
        pref_ac = pc + "000"
        # 既存のXX000レコードがあっても市区町村合算で上書き（速報値と合算値の整合性確保）
        existing_idx = df[(df["area_code"] == pref_ac) & (df["year"] == row["year"])].index
        if not existing_idx.empty:
            df = df.drop(existing_idx)
        pref_rows.append({
            "area_code": pref_ac,
            "area_name": PREF_NAMES.get(pc, pc),
            "year": int(row["year"]),
            **{c: row[c] for c in num_cols},
        })
    if pref_rows:
        df = pd.concat([df, pd.DataFrame(pref_rows)], ignore_index=True)
        print(f"  都道府県集計を追加: {len(pref_rows)} 件")

    df = df[cols].sort_values(["area_code", "year"]).reset_index(drop=True)

    df.to_csv(OUT_CSV, index=False, encoding="utf-8-sig")
    areas = df["area_code"].nunique()
    years = sorted(df["year"].unique())
    print(f"\n保存: {OUT_CSV}")
    print(f"レコード: {len(df)} / 地域: {areas} / 年次: {years}")

    # サマリー表示（都道府県の推移）
    print("\n=== 都道府県レベル サマリー（人口推移） ===")
    pref_df = df[df["area_code"].str.endswith("000")].copy()
    if not pref_df.empty:
        pivot = pref_df.pivot_table(index=["area_code", "area_name"], columns="year", values="population")
        print(pivot.head(10).to_string())


if __name__ == "__main__":
    main()
