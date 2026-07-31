# 10 — Audio Cache

SQLite-backed offline audio file cache with FIFO eviction (native platforms only).

- **Type**: Custom
- **File**: `web/muzix/services/cache.ts`, lines 220–363

## How it works

### 1. SQLite Schema (lines 229–237)

```sql
CREATE TABLE IF NOT EXISTS audio_cache (
  song_id TEXT PRIMARY KEY,
  local_uri TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  downloaded_at INTEGER NOT NULL
);
```

Database: `muzix-audio.db` via `expo-sqlite`.

### 2. Download to Cache (`downloadToCache`, lines 272–313)

```
1. Check if song is already cached in SQLite
2. If cached and file exists → update downloaded_at, return local URI
3. If cached but file missing → delete stale DB row
4. Download to expo-file-system documentDirectory/muzix-audio/{songId}.m4a
5. Insert into SQLite with size and timestamp
6. Call evictOldEntries()
7. Return local URI (falls back to remote URL on error)
```

### 3. Eviction (`evictOldEntries`, lines 253–269)

FIFO eviction with overflow buffer:

```typescript
const excess = count.c - MAX_CACHED_SONGS + 5;  // evict 5 extra to prevent thrashing
const rows = await db.getAllAsync(
  'SELECT song_id, local_uri FROM audio_cache WHERE song_id != ? ORDER BY downloaded_at ASC LIMIT ?',
  keepSongId, excess
);
```

Evicts oldest entries by `downloaded_at` (ASC order). Excludes the currently being cached song.

### 4. Cache Lookup (`getCachedAudioPath`, lines 316–336)

Checks SQLite for the song, validates file exists on disk, cleans up stale entries.

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max cached songs | 50 | FIFO eviction |
| Eviction buffer | +5 extra | Prevents thrashing at boundary |
| File format | `.m4a` | Stored in documentDirectory |
| Platform | Native only | Returns remote URL on web |

## Input → Output

- **Input**: `songId`, `url` (remote audio URL)
- **Output**: Local file URI for offline playback, or remote URL as fallback
