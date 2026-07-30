# Profile Page Improvements + Production Fix

## Goal
Improve `/profile` UI/UX, rendering performance, and API performance without building a new consolidated endpoint.

## Current State
- **PRODUCTION BLOCKER**: Backend crashes on startup with `NameError: name 'asyncio' is not defined` at `backend/main.py:23`
- Frontend fires 3 parallel requests on mount: `topSongs('all', 50)`, `getLikes`, `playlists`
- `topSongs` uses `period='all'` which scans every listening event since 1970
- No ETag caching on analytics or likes endpoints
- `get_user_likes` selects full `UserLike` rows instead of just `song_id`
- `ScrollView` renders all rows inline with no memoization
- Blank `ActivityIndicator` spinner on initial load
- Row components re-subscribe to `usePlayerStore` causing full re-renders
- Unused `isPlaying` variable in row components
- `key` on recently-played rows uses array index

## Changes

### Critical Production Fix — `backend/main.py`
0. **Add missing import**: Add `import asyncio` at the top of `backend/main.py` (line 1, before `import orjson`). The `lifespan` function at line 23 calls `asyncio.create_task(...)` without importing the module. This is blocking all API traffic.

### Frontend — `web/muzix/app/(tabs)/profile.tsx`
1. **Replace spinner with skeletons**: Show `SongSkeleton` placeholders (already exists in `components/Skeleton.tsx`) during initial load.
2. **Memoize row components**: Wrap `TopSongRow` and `SongRow` in `React.memo`.
3. **Memoize derived data**: Use `useMemo` for `songMap`, `recentSongsMapped`, `likedSongsMapped`, and stats calculations.
4. **Fix keys**: Use `song.id` instead of index for recently-played row keys.
5. **Remove unused `isPlaying`** or wire it to a visual indicator (e.g., accent border or equalizer icon) so the variable isn't dead code.
6. **Change `period='all'` to `'month'`** in `api.topSongs` call. This is the single biggest API perf win — avoids a full-table scan on `listening_events`.

### Backend — `backend/routes/analytics.py`
7. **Add ETag caching** to `GET /analytics/user/top-songs` using existing `make_cached_response` helper (same pattern as `routes/playlists.py:40`).
8. **Add ETag caching** to `GET /likes` using `make_cached_response`.

### Backend — `backend/repositories/likes.py`
9. **Select only `song_id`**: Change `select(UserLike)` to `select(UserLike.song_id)` in `get_user_likes` to avoid loading unnecessary columns.

### Backend — `backend/models.py`
10. **Add composite index** on `ListeningEvent`: `Index("ix_listening_events_user_event_started", "user_id", "event_type", "started_at")`. This directly benefits `get_top_songs` which filters on all three columns.

## Validation
- Verify backend starts without `NameError` in production logs
- Verify profile loads in < 2s on a populated dev database
- Confirm `topSongs` query uses the new index (check `EXPLAIN ANALYZE`)
- Verify 304 responses work for cached analytics/likes endpoints
- Confirm skeleton UI shows during load and disappears after data resolves
