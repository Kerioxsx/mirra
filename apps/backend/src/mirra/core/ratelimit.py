"""Fixed-window rate limiter. Uses Redis when configured, otherwise process memory."""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from mirra.core.config import get_settings
from mirra.core.errors import RateLimited


class RateLimiter:
    def __init__(self, redis: Redis | None = None) -> None:
        self._redis = redis
        self._memory: dict[str, tuple[int, float]] = {}

    async def hit(self, key: str, limit: int, window: int) -> bool:
        """Count a hit; return True while the caller is within ``limit`` hits per ``window``."""
        if self._redis is not None:
            try:
                bucket = f"rl:{key}:{int(time.time()) // window}"
                count = await self._redis.incr(bucket)
                if count == 1:
                    await self._redis.expire(bucket, window)
                return int(count) <= limit
            except RedisError:
                pass  # degrade to memory rather than failing closed on credential endpoints
        now = time.monotonic()
        count, started = self._memory.get(key, (0, now))
        if now - started >= window:
            count, started = 0, now
        count += 1
        self._memory[key] = (count, started)
        return count <= limit

    def reset(self) -> None:
        self._memory.clear()


_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        url = get_settings().redis_url
        _limiter = RateLimiter(Redis.from_url(url) if url else None)
    return _limiter


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(
    scope: str, limit: int | None = None, window: int | None = None
) -> Callable[[Request], Awaitable[None]]:
    """FastAPI dependency factory limiting a route per client IP (defaults: the auth limits)."""

    async def _dep(request: Request) -> None:
        s = get_settings()
        ok = await get_limiter().hit(
            f"{scope}:{client_ip(request)}",
            limit or s.auth_rate_limit,
            window or s.auth_rate_window_seconds,
        )
        if not ok:
            raise RateLimited("Too many attempts. Try again shortly.")

    return _dep
