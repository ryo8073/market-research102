"""共通 HTTP クライアント基盤。

機能:
  - ディスクキャッシュ（JSON ファイル、TTL 付き）
  - レート制限（リクエスト間 200ms ディレイ）
  - 指数バックオフリトライ（最大 3 回）
  - カスタム例外

Pre-mortem リスク #2 の緩和策。
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 例外
# ---------------------------------------------------------------------------
class APIError(Exception):
    """API レスポンスエラー。"""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(f"API Error {status_code}: {message}")


class APIKeyMissingError(Exception):
    """API キーが設定されていない。"""


# ---------------------------------------------------------------------------
# キャッシュ付き HTTP クライアント
# ---------------------------------------------------------------------------
class CachedAPIClient:
    """キャッシュ・リトライ・レート制限を備えた HTTP GET クライアント。"""

    def __init__(
        self,
        base_url: str,
        default_headers: dict[str, str] | None = None,
        default_params: dict[str, str] | None = None,
        cache_dir: Path | None = None,
        cache_ttl: int = 86400,
        request_interval: float = 0.2,
        max_retries: int = 3,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._default_headers = default_headers or {}
        self._default_params = default_params or {}
        self._cache_dir = cache_dir
        self._cache_ttl = cache_ttl
        self._request_interval = request_interval
        self._max_retries = max_retries
        self._session = requests.Session()
        self._session.headers.update(self._default_headers)
        self._last_request_time: float = 0.0

        if self._cache_dir:
            self._cache_dir.mkdir(parents=True, exist_ok=True)

    # ----- 公開 API -----

    def get(self, endpoint: str, params: dict[str, Any] | None = None) -> dict:
        """GET リクエスト。キャッシュ → HTTP の順で試行。"""
        merged_params = {**self._default_params, **(params or {})}
        cache_key = self._make_cache_key(endpoint, merged_params)

        # キャッシュ確認
        cached = self._read_cache(cache_key)
        if cached is not None:
            return cached

        # HTTP リクエスト（リトライ付き）
        data = self._request_with_retry(endpoint, merged_params)

        # キャッシュ保存
        self._write_cache(cache_key, data)
        return data

    # ----- 内部メソッド -----

    def _request_with_retry(
        self, endpoint: str, params: dict[str, Any]
    ) -> dict:
        url = f"{self._base_url}/{endpoint.lstrip('/')}"
        last_error: Exception | None = None

        for attempt in range(1, self._max_retries + 1):
            self._rate_limit()
            try:
                resp = self._session.get(url, params=params, timeout=30)
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code == 429:
                    wait = 2 ** attempt
                    logger.warning(
                        "Rate limited (429). Retry %d/%d in %ds",
                        attempt, self._max_retries, wait,
                    )
                    time.sleep(wait)
                    continue
                raise APIError(resp.status_code, resp.text[:500])
            except requests.RequestException as e:
                last_error = e
                if attempt < self._max_retries:
                    wait = 2 ** attempt
                    logger.warning(
                        "Request failed: %s. Retry %d/%d in %ds",
                        e, attempt, self._max_retries, wait,
                    )
                    time.sleep(wait)

        raise APIError(0, f"All {self._max_retries} retries failed: {last_error}")

    def _rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < self._request_interval:
            time.sleep(self._request_interval - elapsed)
        self._last_request_time = time.monotonic()

    def _make_cache_key(self, endpoint: str, params: dict) -> str:
        raw = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.md5(raw.encode()).hexdigest()

    def _read_cache(self, key: str) -> dict | None:
        if not self._cache_dir:
            return None
        path = self._cache_dir / f"{key}.json"
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            fetched_at = datetime.fromisoformat(cached["fetched_at"])
            age = (datetime.now(timezone.utc) - fetched_at).total_seconds()
            if age > self._cache_ttl:
                path.unlink(missing_ok=True)
                return None
            return cached["data"]
        except (json.JSONDecodeError, KeyError, ValueError):
            path.unlink(missing_ok=True)
            return None

    def _write_cache(self, key: str, data: dict) -> None:
        if not self._cache_dir:
            return
        path = self._cache_dir / f"{key}.json"
        payload = {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
