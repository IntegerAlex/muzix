# 12 — Auth & Rate Limiting

JWT token management, refresh token rotation, and sliding window rate limiter.

- **Type**: Custom
- **File**: `web/muzix/store/authStore.ts`, lines 1–106 (client auth)
- **File**: `backend/services/auth.py`, lines 1–75 (server auth)
- **File**: `backend/helpers.py`, lines 70–123 (dual rate limiter)
- **File**: `backend/services/redis_client.py`, lines 115–126 (distributed counter)

## How it works

### 1. JWT Expiry Parsing (authStore.ts, lines 80–106)

Client-side base64 decode (no `atob` dependency) to extract `exp` claim:

```typescript
function parseJwtExpiry(token: string): number | null {
  const payload = JSON.parse(base64Decode(token.split('.')[1]));
  return payload.exp ? payload.exp * 1000 : null;
}
```

### 2. Token Expiry Buffer (authStore.ts, lines 20, 68–71)

Considers token expired 60 seconds before actual expiry:

```typescript
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

isTokenExpired: () => {
  return Date.now() > tokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS;
}
```

### 3. Offline Auth Guard (authStore.ts + _layout.tsx)

- `hydrate()` only auto-logouts on expiry if `navigator.onLine` is true
- Auth guard only redirects to `/login` when online and unauthenticated

### 4. Refresh Token Rotation (auth.py, lines 46–75)

```
1. Hash incoming refresh token with SHA-256
2. Look up hash in database
3. If not found → 401 (invalid)
4. If revoked → revoke entire family (theft detection), 401
5. If expired → 401
6. Revoke current token (mark as used)
7. Issue new JWT (24h expiry) + new refresh token (same family_id)
8. Return {token, refreshToken, user}
```

**Family tracking**: All refresh tokens in a rotation chain share `family_id`. If a revoked token is reused, the entire family is revoked (lines 58–60).

### 5. Rate Limiting — dual backend (helpers.py, lines 70–123)

Two entry points share one Redis-backed core and an in-memory fallback:

- `rate_limit(request, ...)` — synchronous, in-memory. Uses a `defaultdict[str, list[float]]` sliding window.
- `rate_limit_async(request, ...)` — distributed over Redis with fail-open fallback to `check_rate_limit` (used by auth + share routes).

**In-memory sliding window** (`check_rate_limit`, lines 81–93):

```python
_now_rate_limit[key] = [t for t in _rate_limit[key] if now - t < window]  # evict old
if len(_rate_limit[key]) >= max_requests:
    raise HTTPException(status_code=429, detail="Too many requests")
_rate_limit[key].append(now)
```

**Distributed counter** (`redis_client.rate_limit_check`, lines 115–126) — a single atomic `EVAL` of a fixed-window Lua script counters this key with a TTL:

```
1. Build full key:  rl:{ip}:{path}
2. EVAL _FEAT_WINDOW_LUA (fixed-window script) -> current count
3. Return count <= max_requests
```

Because the counter key carries a TTL set at creation, stale entries auto-expire in Redis — no manual cleanup pass (unlike the in-memory dict, which purges stale keys every 60 seconds, lines 88–93).

**Fail-open contract:** if Upstash is unconfigured, errors out, or times out, `rate_limit_async` catches the exception and degrades to the in-memory limiter (lines 119–123). A Redis outage never 429s or 5xxs the whole app.

**Per-route limits** (auth/share use the async/Redis path; the rest use in-memory):

| Route | Max Requests | Window | Backend |
|-------|-------------|--------|---------|
| Register | 5 | 300s | Redis (async) |
| Login | 10 | 60s | Redis (async) |
| Refresh | 10 | 60s | Redis (async) |
| Share | 10 | 60s | Redis (async) |
| Songs, albums, artists, playlists | 60 | 60s | In-memory |
| General (home, analytics, search, recommendations) | 30 | 60s | In-memory |
| Thumbnails | 120 | 60s | In-memory |

**IP extraction**: Uses `X-Forwarded-For` header if present, otherwise `request.client.host` (helpers.py, `_client_ip`).

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| JWT expiry | 24 hours | Configurable via ACCESS_TOKEN_EXPIRY_HOURS |
| Refresh token expiry | 30 days | Hardcoded in generate_refresh_token |
| Token expiry buffer | 60,000ms | Pre-emptive expiry check |
| Auth error cooldown | 5,000ms | Prevents rapid-fire logouts |
| Rate limit window | 60s | Default for most routes |
| Redis counter TTL | window | Auto-expired by Redis, no manual cleanup |
| In-memory cleanup | 60s | Stale key purge interval (in-memory path only) |
| Redis timeout | 3,000ms | `aiohttp.ClientTimeout.total` in `_exec` |
| Share / auth limiter | async + Redis | register 5/300s, login 10/60s, refresh 10/60s, share 10/60s |

## Input → Output

- **Input**: JWT tokens, HTTP requests
- **Output**: Authenticated user, rate-limited responses (429), refresh token rotation
