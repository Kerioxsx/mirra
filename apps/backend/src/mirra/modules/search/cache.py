"""Short-lived cache for connector result pages, so repeated searches don't re-hit provider
rate limits (Taobao especially). Redis when configured, otherwise a bounded in-process store."""

from __future__ import annotations

import contextlib
import hashlib
import time
from collections import OrderedDict
from typing import Protocol

from redis.asyncio import Redis
from redis.exceptions import RedisError

from mirra.modules.marketplaces.base import ConnectorQuery, ConnectorSearchPage

DEFAULT_TTL_SECONDS = 600


class PageCache(Protocol):
    async def get(self, key: str) -> ConnectorSearchPage | None: ...
    async def set(
        self, key: str, page: ConnectorSearchPage, ttl: int = DEFAULT_TTL_SECONDS
    ) -> None: ...


def cache_key(connector_id: str, query: ConnectorQuery) -> str:
    digest = hashlib.sha256(f"{connector_id}|{query.model_dump_json()}".encode()).hexdigest()
    return f"mirra:search:v1:{connector_id}:{digest[:32]}"


class MemoryPageCache:
    def __init__(self, max_entries: int = 256) -> None:
        self._data: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._max = max_entries

    async def get(self, key: str) -> ConnectorSearchPage | None:
        hit = self._data.get(key)
        if hit is None:
            return None
        expires, payload = hit
        if expires < time.monotonic():
            self._data.pop(key, None)
            return None
        self._data.move_to_end(key)
        return ConnectorSearchPage.model_validate_json(payload)

    async def set(
        self, key: str, page: ConnectorSearchPage, ttl: int = DEFAULT_TTL_SECONDS
    ) -> None:
        self._data[key] = (time.monotonic() + ttl, page.model_dump_json())
        self._data.move_to_end(key)
        while len(self._data) > self._max:
            self._data.popitem(last=False)


class RedisPageCache:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def get(self, key: str) -> ConnectorSearchPage | None:
        try:
            payload = await self._redis.get(key)
        except RedisError:
            return None
        return ConnectorSearchPage.model_validate_json(payload) if payload else None

    async def set(
        self, key: str, page: ConnectorSearchPage, ttl: int = DEFAULT_TTL_SECONDS
    ) -> None:
        with contextlib.suppress(RedisError):  # caching is best-effort
            await self._redis.set(key, page.model_dump_json(), ex=ttl)
