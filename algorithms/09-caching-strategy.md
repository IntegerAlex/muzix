# 09 — Caching Strategy

Three-layer caching: LRU+TTL in-memory/disk, ETag/HTTP conditional caching, and audio preload cache.

- **Type**: Known (LRU, ETag) + Custom
- **File**: `web/muzix/services/cache.ts`, lines 1–219 (LRU + ETag)
- **File**: `web/muzix/components/PlayerBridge.tsx`, lines 114–139 (preload cache)

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

### 3. Preload Cache (`PlayerBridge.tsx`, lines 114–139)

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

## Input → Output

- **Input**: API paths, URLs
- **Output**: Cached responses with TTL, ETags for conditional requests, preloaded audio elements
