"""Async client for Upstash Redis (REST protocol).

Why REST and not the Redis TCP client:
  - Muzix runs on FastAPI Cloud (serverless, scale-to-zero). A persistent TCP
    connection pool is the wrong tool there: connections churn on cold starts
    and the pool would sit idle between requests. Upstash's REST API is
    connectionless, works from any runtime, and ships no extra dependency
    (aiohttp/orjson are already in the project).
  - One HTTP call may carry several commands; Upstash bills per command in the
    body, not per HTTP request, so batching several commands in a single POST
    stays within the free-tier command budget.

Failure contract:
  Every function in this module intentionally raises on Redis errors and never
  swallows them. Callers (helpers/routes) decide how to degrade. For rate
  limiting the caller falls back to the in-memory limiter. For caching the
  caller falls back to computing the payload fresh from Postgres. A Redis
  outage therefore degrades the API to its previous (pre-Redis) behaviour — it
  never makes an endpoint return stale data or a 5xx.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

import aiohttp
import orjson

from config import UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_ENABLED

logger = logging.getLogger("muzix.redis")

_PREFIX = "mzix"


class RedisError(Exception):
    """Raised when the Upstash REST API returns an error."""


def _build_key(namespace: str, key: str) -> str:
    return f"{_PREFIX}:{namespace}:{key}"


# Lua script: atomic fixed-window counter. Sets the TTL only when the counter
# is created (INCR returned 1), so a hot key permanently carries an expiry and
# can never leave a ghost entry behind after the window lapses.
_FEAT_WINDOW_LUA = """\
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
"""


class UpstashRedis:
    def __init__(self) -> None:
        self.enabled = REDIS_ENABLED
        self._session: aiohttp.ClientSession | None = None

    async def _exec(self, *commands: list[Any]) -> list[Any]:
        """POST 1..N commands to Upstash and return one result per command.

        Upstash REST API payload shapes:
          - A single command is sent as a flat array: ``["GET", key]``.
          - Multiple commands are pipelined as a 2D array to the ``/pipeline``
            endpoint: ``[["GET", key], ["INCR", k]]``.
        Both bill per command in the body, so batching never increases cost —
        it only cuts round-trips.
        """
        if not self.enabled:
            raise RedisError("Redis disabled (UPSTASH_REDIS_REST_URL/TOKEN unset)")
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        endpoint = UPSTASH_REDIS_REST_URL.rstrip("/")
        if len(commands) > 1:
            endpoint += "/pipeline"
        payload = list(commands) if len(commands) > 1 else commands[0]
        try:
            async with self._session.post(
                endpoint,
                headers={"Authorization": f"Bearer {UPSTASH_REDIS_REST_TOKEN}"},
                data=orjson.dumps(payload),
                timeout=aiohttp.ClientTimeout(total=3.0),
            ) as resp:
                payload = orjson.loads(await resp.read())
        except (aiohttp.ClientError, orjson.JSONDecodeError, TimeoutError) as exc:  # noqa: PERF203
            raise RedisError(f"Upstash request failed: {exc!r}") from exc
        # Single-command responses come back as one object, not a list.
        if isinstance(payload, dict):
            payload = [payload]
        # payload is a list parallel to commands, or {'error': ...}
        if isinstance(payload, dict) and "error" in payload:
            raise RedisError(f"Upstash error: {payload['error']}")
        if not isinstance(payload, list):
            raise RedisError(f"Unexpected Upstash reply: {payload!r}")
        results: list[Any] = []
        for item in payload:
            if isinstance(item, dict) and "error" in item:
                raise RedisError(f"Upstash command error: {item['error']}")
            results.append(item.get("result") if isinstance(item, dict) else item)
        return results

    async def close(self) -> None:
        """Idempotent. Called from the app lifespan shutdown handler."""
        if self._session is not None and not self._session.closed:
            await self._session.close()
            self._session = None

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------
    async def rate_limit_check(self, key: str, max_requests: int, window_ms: int) -> bool:
        """Return True if a request is allowed under a fixed-window limit.

        The counter key TTL is refreshed only on creation. Stale entries are
        auto-expired by Redis; no manual cleanup needed.
        """
        full_key = _build_key("rl", key)
        (count,) = await self._exec(
            ["EVAL", _FEAT_WINDOW_LUA, "1", full_key, str(window_ms)]
        )
        count = int(count)
        return count <= max_requests

    # ------------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------------
    async def cache_get(self, namespace: str, key: str) -> str | None:
        """Return cached JSON string, or None on miss so callers can compute."""
        full_key = _build_key(namespace, key)
        (raw,) = await self._exec(["GET", full_key])
        return raw if isinstance(raw, str) else None

    async def cache_set(self, namespace: str, key: str, value: str | bytes, ttl_ms: int) -> None:
        """Store a value with an absolute expiry. TTL is mandatory (never cache forever)."""
        full_key = _build_key(namespace, key)
        await self._exec(["SET", full_key, value, "PX", str(ttl_ms)])

    async def cache_get_epoch(self, namespace: str) -> int:
        """Return the invalidation generation for a namespace (0 if never bumped)."""
        epoch_key = _build_key(f"epoch:{namespace}", "gen")
        (val,) = await self._exec(["GET", epoch_key])
        return int(val) if val else 0

    async def cache_bump_epoch(self, namespace: str) -> int:
        """Atomically invalidate every key in a namespace and return the new gen.

        Call this wherever the underlying data changes (import scripts, admin).
        All caches keys embed the current generation, so bumping makes every
        old key a permanent miss without any delete traversal.
        """
        epoch_key = _build_key(f"epoch:{namespace}", "gen")
        (val,) = await self._exec(["INCR", epoch_key])
        return int(val)

    async def invalidate_key(self, namespace: str, key: str) -> None:
        """Explicitly delete a single cache entry (rare; preferred path is epoch)."""
        full_key = _build_key(namespace, key)
        await self._exec(["DEL", full_key])


# Module-level singleton shared across requests (holds session reuse when it stays connected).
redis = UpstashRedis()