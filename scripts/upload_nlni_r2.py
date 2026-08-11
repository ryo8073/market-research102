"""NLNI高解像度TopoJSONをCloudflare R2にアップロードする。

前提: wrangler CLIがインストール+ログイン済み
  npm install -g wrangler
  wrangler login

使い方: python scripts/upload_nlni_r2.py

環境変数:
  R2_BUCKET_NAME: R2バケット名（デフォルト: ci102-nlni）
"""
from __future__ import annotations
import io, sys, os, subprocess
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
TOPO_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "nlni_topo"
LITE_DIR = ROOT / "ci102-nextjs" / "public" / "data" / "nlni_lite"
BUCKET = os.environ.get("R2_BUCKET_NAME", "ci102-nlni")


def upload_dir(src_dir: Path, prefix: str):
    """ディレクトリ内の全ファイルをR2にアップロード。"""
    files = sorted(src_dir.glob("*.topojson"))
    if not files:
        print(f"ファイルが見つかりません: {src_dir}")
        return

    total_mb = sum(f.stat().st_size for f in files) / 1024 / 1024
    print(f"\n{prefix}/: {len(files)} ファイル, {total_mb:.0f} MB")

    success = 0
    failed = 0
    for i, f in enumerate(files):
        key = f"{prefix}/{f.name}"
        size_kb = f.stat().st_size / 1024
        try:
            result = subprocess.run(
                ["wrangler", "r2", "object", "put", f"{BUCKET}/{key}",
                 f"--file={f}", "--content-type=application/json"],
                capture_output=True, text=True, timeout=60,
            )
            if result.returncode == 0:
                success += 1
                if (i + 1) % 20 == 0 or i == len(files) - 1:
                    print(f"  進捗: {i+1}/{len(files)} ({success} 成功)")
            else:
                failed += 1
                print(f"  ERROR {key}: {result.stderr[:100]}")
        except subprocess.TimeoutExpired:
            failed += 1
            print(f"  TIMEOUT {key}")
        except FileNotFoundError:
            print("wrangler が見つかりません。npm install -g wrangler でインストールしてください。")
            return

    print(f"  完了: {success} 成功 / {failed} 失敗")


def main():
    print(f"R2 bucket: {BUCKET}")
    upload_dir(LITE_DIR, "lite")
    upload_dir(TOPO_DIR, "hires")
    print(f"\n次のステップ:")
    print(f"1. Vercel Dashboard → Settings → Environment Variables")
    print(f"2. NEXT_PUBLIC_NLNI_R2_URL = https://pub-xxxx.r2.dev (R2のパブリックURL)")
    print(f"3. Save → Redeploy")


if __name__ == "__main__":
    main()
