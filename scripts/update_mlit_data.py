"""MLIT不動産成約データを最新まで更新する。

2024Q4〜2026Q1の成約データを全47都道府県分取得し、CSVキャッシュに保存。

使い方: python scripts/update_mlit_data.py
"""
from __future__ import annotations
import io, sys, json, urllib.request, os, time, gzip, csv
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

API_KEY = os.environ.get("MLIT_API_KEY", "")
CACHE_DIR = ROOT / "data" / "cache"
BASE_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001"

# 取得する四半期
QUARTERS = [
    ("2024", "4"),
    ("2025", "1"),
    ("2025", "2"),
    ("2025", "3"),
    ("2025", "4"),
    ("2026", "1"),
]


def fetch_quarter(pref_code: int, year: str, quarter: str) -> list[dict]:
    """1都道府県・1四半期のデータを取得。"""
    url = f"{BASE_URL}?year={year}&quarter={quarter}&area={pref_code:02d}"
    req = urllib.request.Request(url, headers={
        "Ocp-Apim-Subscription-Key": API_KEY,
        "Accept-Encoding": "gzip",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            try:
                text = gzip.decompress(raw).decode("utf-8")
            except Exception:
                text = raw.decode("utf-8")
            d = json.loads(text)
            return d.get("data", [])
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []  # データなし
        print(f"    ERROR {e.code}: {pref_code:02d} {year}Q{quarter}")
        return []
    except Exception as e:
        print(f"    ERROR: {e}")
        return []


def save_csv(pref_code: int, year: str, quarter: str, data: list[dict]):
    """CSVキャッシュに保存。"""
    if not data:
        return
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"mlit_{pref_code:02d}_all_{year}_q{quarter}.csv"
    keys = list(data[0].keys())
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(data)


def main():
    if not API_KEY:
        raise SystemExit("MLIT_API_KEY が .env に設定されていません")

    total_new = 0
    total_skipped = 0

    for pref_code in range(1, 48):
        for year, quarter in QUARTERS:
            cache_file = CACHE_DIR / f"mlit_{pref_code:02d}_all_{year}_q{quarter}.csv"
            if cache_file.exists() and cache_file.stat().st_size > 100:
                total_skipped += 1
                continue

            data = fetch_quarter(pref_code, year, quarter)
            if data:
                save_csv(pref_code, year, quarter, data)
                total_new += 1
                if pref_code % 10 == 0 or pref_code == 1:
                    print(f"  {pref_code:02d} {year}Q{quarter}: {len(data)} 件")
            time.sleep(0.3)  # API負荷対策

        # 進捗
        if pref_code % 10 == 0:
            print(f"進捗: {pref_code}/47 都道府県 (新規{total_new} / スキップ{total_skipped})")

    print(f"\n完了: 新規{total_new} / スキップ{total_skipped}")

    # 最新のデータ四半期を確認
    latest_files = sorted(CACHE_DIR.glob("mlit_13_all_*.csv"))
    if latest_files:
        print(f"東京都の最新: {latest_files[-1].name}")


if __name__ == "__main__":
    main()
