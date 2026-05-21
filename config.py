"""アプリケーション設定とAPIキー管理。

CLAUDE.md ルール準拠:
  - APIクライアントはモジュールレベルで生成しない
  - factory関数で呼び出し時に生成する
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# .env 読み込み（存在する場合のみ）
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------
RESAS_BASE_URL = "https://opendata.resas-portal.go.jp"
ESTAT_BASE_URL = "https://api.e-stat.go.jp/rest/3.0"
MLIT_BASE_URL = "https://www.reinfolib.mlit.go.jp/ex-api/external"

# キャッシュ設定
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent / "data" / "cache"
DEFAULT_CACHE_TTL_SECONDS = 24 * 60 * 60  # 24時間


# ---------------------------------------------------------------------------
# 設定クラス
# ---------------------------------------------------------------------------
class Settings:
    """環境変数から読み込むアプリケーション設定。"""

    def __init__(self) -> None:
        self.resas_api_key: str = os.environ.get("RESAS_API_KEY", "")
        self.estat_app_id: str = os.environ.get("ESTAT_APP_ID", "")
        self.mlit_api_key: str = os.environ.get("MLIT_API_KEY", "")
        self.anthropic_api_key: str = os.environ.get("ANTHROPIC_API_KEY", "")
        self.proformer_api_key: str = os.environ.get("PROFORMER_API_KEY", "")
        self.cache_dir: Path = Path(
            os.environ.get("CACHE_DIR", str(DEFAULT_CACHE_DIR))
        )
        self.cache_ttl_seconds: int = int(
            os.environ.get("CACHE_TTL_SECONDS", str(DEFAULT_CACHE_TTL_SECONDS))
        )

    @property
    def has_resas_key(self) -> bool:
        return bool(self.resas_api_key)

    @property
    def has_estat_key(self) -> bool:
        return bool(self.estat_app_id)

    @property
    def has_mlit_key(self) -> bool:
        return bool(self.mlit_api_key)

    @property
    def has_anthropic_key(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_proformer_key(self) -> bool:
        return bool(self.proformer_api_key)

    def missing_keys(self) -> list[str]:
        """未設定のAPIキー名リストを返す。"""
        missing = []
        if not self.has_resas_key:
            missing.append("RESAS_API_KEY")
        if not self.has_estat_key:
            missing.append("ESTAT_APP_ID")
        if not self.has_mlit_key:
            missing.append("MLIT_API_KEY")
        return missing


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Settings シングルトンを返す。"""
    return Settings()
