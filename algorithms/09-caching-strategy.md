# 09 — Caching Strategy

Four-layer caching: LRU+TTL in-memory/disk, Redis distributed catalog cache, ETag/HTTP conditional caching, and audio preload cache.

- **Type**: Known (LRU, ETag) + Custom
- **File**: `web/muzix/services/cache.ts`, lines 1–219 (LRU + ETag)
- **File**: `web/muzix/components/PlayerBridge.tsx`, lines 114–139 (preload cache)
- **File**: `backend/helpers.py`, lines 150–200 (backend Redis cache + epoch invalidation)
- **File**: `backend/services/redis_client.py`, lines 131–162 (Redis commands)

## How it works

### 1. LRU + TTL Cache (`cache.ts`)

In-memory `Map` with disk persistence (localStorage on web).

**Eviction** (`evictLRU`, lines 49–60):
```typescript
function evictLRU() {
  if (memCache.size <= MAX_CACHE_ENTRIES) return;
  let oldestKey = null;
  let oldestTime = Infinity;
  for (const [k, v] of memCache) {
    if (v.accessTime < oldestTime) {
      oldestTime = v.accessTime;
      oldestKey = k;
    }
  }
  if (oldestKey) memCache.delete(oldestKey);
}
```

**TTL check**: `isExpired = Date.now() - entry.timestamp > entry.ttl`

**Disk persistence**: Versioned localStorage (version 2). Debounced 500ms save.

### 2. ETag / HTTP Conditional Caching (`cachedFetch`, lines 130–189)

```
1. Check in-memory cache for valid entry
2. If expired, send request with If-None-Match header (cached ETag)
3. On 304 Not Modified → return cached data, touch entry
4. On 200 → store new ETag + data in cache
5. On empty array response → return stale cached data (cache stampede protection)
6. On network error → return stale cached data if available
```

**Backend ETag** (`helpers.py`, lines 101–123):
```python
def compute_etag(data):
    serialized = orjson.dumps(data, option=orjson.OPT_SORT_KEYS)
    return hashlib.sha256(serialized).hexdigest()[:32]
```

### 3. Redis Distributed Catalog Cache (`helpers.py` lines 150–200, `redis_client.py` lines 131–162)

Immutable, user-agnostic catalog GETs (songs, albums, artists) are served from Upstash Redis. The cache is **generation-scoped** for O(1) invalidation:

```
1. epoch = redis.cache_get_epoch(namespace)         # 0 if never bumped
2. rkey  = f"{epoch}:{key}"                          # key embeds generation
3. raw = redis.cache_get(namespace, rkey) -> hit? serve
4. miss? compute body from DB, then cache_set with TTL
```

**Epoch based invalidation** (`redis_client.py` lines 148–157): a writer that changes the underlying data calls `cache_bump_epoch(namespace)` which does a single `INCR`. Because every cache key embeds the current generation, bumping makes all old keys permanent misses — no O(n) delete traversal across the catalog.

```
Atomic: epoch_key = "epoch:{namespace}:gen"; INCR -> new generation
```

- **Retry read fresh**: the epoch is re-read from Redis on *every* request so a just-bumped generation is observed immediately (never served stale), at the cost of one extra GET.
- **TTL**: 60s (`CACHE_TTL_MS`), mirroring `Cache-Control: max-age=60`.
- **Fail-open:** on any Redis fault, catalog endpoints recompute from DB (logs a warning).
- **Scope guard:** only immutable, user-agnostic `catalog:*` namespaces use this; user-scoped data (home, likes) intentionally stays on the in-memory ETag path to avoid a correctness regression.

### 4. Preload Cache (`PlayerBridge.tsx`, lines 114–139)

Bounded `Map<string, HTMLAudioElement>` for preloading next track audio:

```typescript
const preloadCache = new Map<string, HTMLAudioElement>();

function preloadNextTrack(url: string) {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  preloadCache.set(url, audio);
  if (preloadCache.size > 3) {
    const oldest = preloadCache.keys().next().value;
    preloadCache.delete(oldest);  // FIFO eviction
  }
}
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max cache entries | 200 | In-memory LRU |
| Default TTL | 300,000ms (5 min) | Overridable per path |
| Cache version | 2 | Triggers localStorage wipe on bump |
| Disk save debounce | 500ms | Prevents write thrashing |
| Max preload entries | 3 | FIFO eviction |
| Backend Cache-Control | `max-age=60, stale-while-revalidate=300` | Server-side headers |
| Redis catalog TTL | 60s | `CACHE_TTL_MS` |
| Redis key shape | `mzix:{namespace}:{epoch}:{key}` | `_PREFIX="mzix"` + generation-scoped |
| Invalidation | epoch INCR | O(1) whole-cache invalidation per namespace |

## Input → Output

- **Input**: API paths, URLs
- **Output**: Cached responses with TTL, Redis generation-scoped catalog, ETags for conditional requests, preloaded audio elements
