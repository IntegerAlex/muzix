# 05 — Play-Time Tracking

Single-listen telemetry: one terminal row per track, pause-exclusive heard time, idempotent delivery.

- **Type**: Custom
- **File**: `web/muzix/components/PlayerBridge.tsx` (ActiveListen block, `beginListen` / `markListenResolved` / `accrueListen` / `endListen`)
- **File**: `backend/repositories/listening_events.py` (`record_events`, `PLAY_TYPES`)

## How it works

### 1. Listen lifecycle (client)

One `ActiveListen` at a time per client:

1. `beginListen(song, position, surface)` — opens on track load. `playedMs = 0`, `stamp = null`, `resolved = false`. Surface is read from the queue slot (`queue[currentIndex].surface`), so shuffled queues and autoplay tails keep per-track attribution.
2. `markListenResolved(audioOrigin, playing)` — fires when `player.replace()` lands. Starts the heard-time anchor (`stamp = now`) only if still playing; a user who paused mid-load accrues nothing.
3. `accrueListen()` — banks `now - stamp` into `playedMs` on pause, seek, sleep-deadline, and track switch; `stamp` is `null` while paused, so pause-time never counts. Seek restarts the anchor after the jump, so skipped-over audio is never counted as heard.
4. `endListen(outcome)` — emits the single terminal row. Natural end → `complete` (100%); any advance away → `skip` with real `playedMs` and computed pct. `playedMs` is clamped to the track duration. Rows for audio never heard (`!resolved && playedMs <= 0`, e.g. load errors) are dropped — failures are not listens.

Pause/resume/seek emit nothing. The old per-transition `play`/`pause`/`seek` rows (which multiplied `play_count` on every resume) and the `playTimeTracker.ts` dual pipeline (removed; its concurrent read-modify-write flushes double-counted under race) are gone.

### 2. Idempotent delivery

Every emitted row carries a client-generated `client_event_id` UUID (`genEventId`). Retries, buffer re-queues, and offline replays resend the same id; the server's `UNIQUE(user_id, client_event_id)` index (`uq_listening_events_user_client`, migration v4) makes replays no-op. Pre-v4 rows have `NULL` keys (distinct under the index) and are unaffected.

### 3. Server aggregation

Listening time is `SUM(duration_played_ms)` over in-period rows — never the lifetime-cumulative `song_durations` counters (one in-period play used to credit a song's entire lifetime). The `/telemetry/duration` endpoint and `upsert_duration` are retained only for old app versions still calling them.

`source` is the discovery surface (`home | search | album | artist | playlist | library | profile | autoplay`, stamped onto queue slots at `playSong` time); `audio_origin` (`cache | catalog | device | remote`) records where the bytes came from. They were previously conflated in `source`.

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Flush cadence | 10s when buffered | `flushEvents`, 50-row cap, 3 retries then discard |
| Offline cap | 100 rows | `localStorage` persist/restore (web) |
| Batch cap | 50 events / request | `POST /telemetry/events` |

## Input → Output

- **Input**: Track loads, play/pause/seek transitions, queue-slot surfaces
- **Output**: One terminal `complete|skip` row per heard track with real `duration_played_ms`, `completion_percentage`, `source`, `audio_origin`, `client_event_id`
