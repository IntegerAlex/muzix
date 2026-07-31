# 12 — Auth & Rate Limiting

JWT token management, refresh token rotation, and sliding window rate limiter.

- **Type**: Custom
- **File**: `web/muzix/store/authStore.ts`, lines 1–106 (client auth)
- **File**: `backend/services/auth.py`, lines 1–75 (server auth)
- **File**: `backend/helpers.py`, lines 67–94 (rate limiter)

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

### 5. Sliding Window Rate Limiter (helpers.py, lines 78–94)

```python
def check_rate_limit(key, max_requests=10, window=60):
    now = time.time()
    _rate_limit[key] = [t for t in _rate_limit[key] if now - t < window]  # evict old
    if len(_rate_limit[key]) >= max_requests:
        raise HTTPException(status_code=429, detail="Too many requests")
    _rate_limit[key].append(now)
```

**Per-route limits**:

| Route | Max Requests | Window |
|-------|-------------|--------|
| General (home, analytics, search, recommendations) | 30 | 60s |
| Register | 5 | 300s |
| Login | 10 | 60s |
| Refresh | 10 | 60s |
| Playlists | 60 | 60s |
| Thumbnails | 120 | 60s |

**Cleanup**: Stale keys (no requests in window) are purged every 60 seconds (lines 85–89).

**IP extraction**: Uses `X-Forwarded-For` header if present, otherwise `request.client.host` (lines 71–75).

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| JWT expiry | 24 hours | Configurable via ACCESS_TOKEN_EXPIRY_HOURS |
| Refresh token expiry | 30 days | Hardcoded in generate_refresh_token |
| Token expiry buffer | 60,000ms | Pre-emptive expiry check |
| Auth error cooldown | 5,000ms | Prevents rapid-fire logouts |
| Rate limit window | 60s | Default for most routes |
| Rate limit cleanup | 60s | Stale key purge interval |

## Input → Output

- **Input**: JWT tokens, HTTP requests
- **Output**: Authenticated user, rate-limited responses (429), refresh token rotation
