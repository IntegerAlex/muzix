# 05 — Play-Time Tracking

Client-side delta accumulator with periodic flush and server-side duration upsert.

- **Type**: Custom
- **File**: `web/muzix/services/playTimeTracker.ts`, lines 1–103
- **File**: `backend/repositories/listening_events.py`, lines 9–24 (server upsert)

## How it works

### 1. Delta Accumulation (playTimeTracker.ts)

Tracks per-song play time in memory and on disk.

**State**:
```typescript
interface SongPlayRecord {
  totalMs: number;   // total accumulated play time
  flushedMs: number; // amount already sent to server
}
```

**Flow**:
1. `startPlaying(songId)` — records `trackRef.since = Date.now()`
2. `pausePlaying()` — calculates `elapsed = Date.now() - trackRef.since`, adds to `totalMs`, saves to storage, calls `flushDelta`
3. `flushDelta(songId?)` — calculates `delta = totalMs - flushedMs`, sends to server via `api.recordDuration()`, updates `flushedMs` on success

**Key detail**: If the currently playing song is being flushed, elapsed time is calculated live (line 70–74) rather than using the stored value.

### 2. Periodic Flush (lines 91–96)

```typescript
const FLUSH_INTERVAL_MS = 30_000;  // 30 seconds

startPeriodicFlush() → setInterval(flushDelta, FLUSH_INTERVAL_MS)
```

### 3. Persistence

- State is stored in `safeStorage` (MMKV on native, localStorage on web) under key `muzix-playtime`
- On flush failure, `flushedMs` is left unchanged so the delta will be retried on next flush (line 86)

### 4. Server-Side Upsert (`upsert_duration`, listening_events.py lines 9–24)

```python
async def upsert_duration(user_id, song_id, delta_ms):
    row = session.execute(select(SongDuration).where(...))
    if row:
        row.total_ms += delta_ms          # accumulate
        row.last_updated = datetime.now(timezone.utc)
    else:
        row = SongDuration(user_id=user_id, song_id=song_id, total_ms=delta_ms)
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Flush interval | 30,000ms (30s) | Client-side periodic flush |
| Storage key | `muzix-playtime` | Persisted to safeStorage |

## Input → Output

- **Input**: Song ID + playback time deltas
- **Output**: Accumulated `total_ms` per user per song in `song_durations` table
