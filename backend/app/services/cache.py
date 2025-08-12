from __future__ import annotations

import time
from typing import Any, Optional

try:
    import redis  # type: ignore
except Exception:  # pragma: no cover - redis optional
    redis = None  # type: ignore

from app.core.config import get_settings


class _InMemoryTTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._store[key] = (time.time() + ttl_seconds, value)


class Cache:
    def __init__(self) -> None:
        settings = get_settings()
        self._mem = _InMemoryTTLCache()
        self._redis = None
        if redis is not None:
            try:
                self._redis = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=0.2)
                # quick ping to validate
                self._redis.ping()  # type: ignore[attr-defined]
            except Exception:
                self._redis = None

    def get(self, key: str) -> Optional[Any]:
        if self._redis is not None:
            try:
                raw = self._redis.get(key)  # type: ignore[attr-defined]
                if raw is None:
                    return None
                import json

                return json.loads(raw)
            except Exception:
                return None
        return self._mem.get(key)

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        if self._redis is not None:
            try:
                import json

                self._redis.setex(key, ttl_seconds, json.dumps(value))  # type: ignore[attr-defined]
                return
            except Exception:
                pass
        self._mem.set(key, value, ttl_seconds)


_cache_instance: Optional[Cache] = None


def get_cache() -> Cache:
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = Cache()
    return _cache_instance


