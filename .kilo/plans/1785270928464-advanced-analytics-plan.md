# Advanced User Behavior Analytics Implementation Plan

## Goal

Upgrade the Muzix analytics system from basic play-count tracking to a comprehensive user behavior analysis platform that enables personalized recommendations, engagement optimization, and product insights.

## Current State

- **Data collected**: play/pause/complete/skip/seek events with timestamps, durations, completion %, source, position_in_queue, device_type
- **Data analyzed**: top songs (play count), basic stats (total ms, unique songs/artists, sessions), recent activity
- **Critical gap**: `UserSession` metrics never populated; no skip rate, completion rate, affinity scoring, time patterns, or trend analysis

## Phase 1: Fix Session Metrics Population

### 1.1 Fix `end_session` in `repositories/sessions.py`

**File**: `backend/repositories/sessions.py`

When `end_session` is called, query `listening_events` for this session and populate:
- `total_listening_ms` = `SUM(duration_played_ms)`
- `songs_played` = `COUNT(*) WHERE event_type = 'play'`
- `songs_completed` = `COUNT(*) WHERE event_type = 'complete'`
- `songs_skipped` = `COUNT(*) WHERE event_type = 'skip'`
- `unique_songs` = `COUNT(DISTINCT song_id)`
- `unique_artists` = `COUNT(DISTINCT song.artist_id)` (join with songs table)

### 1.2 Add session metrics to `services/analytics.py`

**File**: `backend/services/analytics.py`

Add `get_session_metrics(user_id, period)` that returns session-level metrics including:
- Average session duration
- Sessions per day
- Completion rate per session
- Binge index (songs per session × sessions per day)

## Phase 2: Data Model Enhancements

### 2.1 Add columns to `ListeningEvent` model

**File**: `backend/models.py`

Add:
- `hour_of_day` (`Integer`, nullable) — extracted from `started_at`, enables time-of-day indexing
- `day_of_week` (`Integer`, nullable) — extracted from `started_at`, enables weekly pattern queries

These are derived from `started_at` at insert time. Storing them avoids expensive `EXTRACT` calls on every query.

### 2.2 Update `ListeningEvent` creation in repository

**File**: `backend/repositories/listening_events.py`

In `record_events`, extract `hour_of_day` and `day_of_week` from `started_at` before creating the event:
```python
started_at = datetime.fromisoformat(e["started_at"].replace("Z", "+00:00"))
hour_of_day = started_at.hour
day_of_week = started_at.weekday()
```

### 2.3 Add migration for new columns

**File**: `backend/migrate.py`

Add `ALTER TABLE listening_events ADD COLUMN IF NOT EXISTS` for `hour_of_day` and `day_of_week`.

## Phase 3: New Repository Methods

### 3.1 Skip Rate Analysis

**File**: `backend/repositories/listening_events.py`

```python
async def get_skip_rate(user_id, period, limit=50) -> list[dict]:
    # For each song: play_count, skip_count, skip_rate = skips / (plays + skips)
    # Join with Song for metadata
```

### 3.2 Completion Rate Analysis

```python
async def get_completion_rate(user_id, period, limit=50) -> list[dict]:
    # For each song: play_count, avg_completion_percentage, completion_rate
    # completion_rate = avg(completion_percentage) / 100
```

### 3.3 Discovery Metrics

```python
async def get_discovery_metrics(user_id, period) -> dict:
    # total_plays, first_time_plays, repeat_plays
    # discovery_ratio = first_time_plays / total_plays
    # Use subquery: first play of each song_id for this user
```

### 3.4 Artist Affinity Scoring

```python
async def get_artist_affinity(user_id, period, limit=50) -> list[dict]:
    # For each artist:
    # affinity = (plays * 1.0) + (completions * 0.5) + (repeat_plays * 2.0) - (skips * 0.5)
    # Join listening_events with songs for artist info
```

### 3.5 Listening Patterns (Time-of-Day / Day-of-Week)

```python
async def get_listening_patterns(user_id, period) -> dict:
    # Group by hour_of_day: plays per hour
    # Group by day_of_week: plays per day
    # Peak hours, peak days
```

### 3.6 Trend Analysis (MoM/WoW)

```python
async def get_trend_analysis(user_id, period) -> dict:
    # Compare current period vs previous period
    # total_ms change, plays change, unique_songs change
    # Percent change for each metric
```

### 3.7 Catalog Exploration

```python
async def get_catalog_exploration(user_id, period) -> dict:
    # exploration_ratio = unique_songs_played / total_songs_in_catalog
    # new_artists_ratio = new_artists / total_artists_played
    # repeat_play_ratio = repeat_plays / total_plays
```

### 3.8 Queue Drop-off Analysis

```python
async def get_queue_dropoff(user_id, period) -> dict:
    # Average position_in_queue where skips occur
    # Drop-off rate by position
    # Most common skip positions
```

### 3.9 Source Effectiveness

```python
async def get_source_effectiveness(user_id, period) -> dict:
    # For each source (playlist, album, artist, search, radio, queue):
    # total_plays, completion_rate, avg_duration_played_ms
    # Which sources drive the most engagement
```

### 3.10 Binge Index

```python
async def get_binge_index(user_id, period) -> dict:
    # songs_per_session = total_plays / total_sessions
    # avg_session_gap = avg time between sessions
    # binge_index = songs_per_session * (1 / avg_session_gap_hours)
```

## Phase 4: New Service Methods

**File**: `backend/services/analytics.py`

Wrap each repository method with business logic and derived metric computation:

- `get_skip_rate(user_id, period, limit)` → adds `skip_rate` percentage
- `get_completion_rate(user_id, period, limit)` → adds `completion_rate` percentage
- `get_discovery_metrics(user_id, period)` → adds `discovery_ratio` percentage
- `get_artist_affinity(user_id, period, limit)` → adds `affinity_score`
- `get_listening_patterns(user_id, period)` → adds `peak_hours`, `peak_days`
- `get_trend_analysis(user_id, period)` → adds `pct_change` for each metric
- `get_catalog_exploration(user_id, period)` → adds `exploration_ratio`
- `get_queue_dropoff(user_id, period)` → adds `avg_skip_position`
- `get_source_effectiveness(user_id, period)` → adds `engagement_score` per source
- `get_binge_index(user_id, period)` → adds `binge_index` score

## Phase 5: New API Endpoints

**File**: `backend/routes/analytics.py`

All endpoints under `/analytics/user/`, require auth, rate-limited (30 req/min):

| Method | Path | Service Method |
|--------|------|----------------|
| GET | `/analytics/user/skip-rate` | `analytics_svc.get_skip_rate` |
| GET | `/analytics/user/completion-rate` | `analytics_svc.get_completion_rate` |
| GET | `/analytics/user/discovery` | `analytics_svc.get_discovery_metrics` |
| GET | `/analytics/user/artist-affinity` | `analytics_svc.get_artist_affinity` |
| GET | `/analytics/user/listening-patterns` | `analytics_svc.get_listening_patterns` |
| GET | `/analytics/user/trends` | `analytics_svc.get_trend_analysis` |
| GET | `/analytics/user/catalog-exploration` | `analytics_svc.get_catalog_exploration` |
| GET | `/analytics/user/queue-dropoff` | `analytics_svc.get_queue_dropoff` |
| GET | `/analytics/user/source-effectiveness` | `analytics_svc.get_source_effectiveness` |
| GET | `/analytics/user/binge-index` | `analytics_svc.get_binge_index` |

Each endpoint accepts `period` query param (`day`, `week`, `month`, `year`, `all`) and optional `limit`.

## Phase 6: Frontend API Client

**File**: `web/muzix/services/api.ts`

Add typed API methods for each new endpoint:

```typescript
export interface SkipRateItem { song: ApiSong; playCount: number; skipCount: number; skipRate: number; }
export interface CompletionRateItem { song: ApiSong; playCount: number; avgCompletion: number; completionRate: number; }
export interface DiscoveryMetrics { totalPlays: number; firstTimePlays: number; repeatPlays: number; discoveryRatio: number; }
export interface ArtistAffinityItem { artist: string; affinityScore: number; plays: number; completions: number; skips: number; }
export interface ListeningPatterns { hourly: Record<number, number>; daily: Record<number, number>; peakHours: number[]; peakDays: number[]; }
export interface TrendAnalysis { period: string; current: Record<string, number>; previous: Record<string, number>; pctChange: Record<string, number>; }
export interface CatalogExploration { explorationRatio: number; newArtistsRatio: number; repeatPlayRatio: number; uniqueSongs: number; totalCatalogSongs: number; }
export interface QueueDropoff { avgSkipPosition: number; dropoffByPosition: Record<number, number>; }
export interface SourceEffectiveness { [source: string]: { plays: number; completionRate: number; avgDurationMs: number; engagementScore: number; }; }
export interface BingeIndex { songsPerSession: number; avgSessionGapHours: number; bingeIndex: number; }
```

## Phase 7: Testing

### 7.1 Backend Tests

**File**: `backend/tests/test_analytics.py`

Create test file with:
- Test data fixtures (users, songs, listening events)
- Test `get_skip_rate` with known data
- Test `get_completion_rate` with known data
- Test `get_discovery_metrics` with first-time and repeat plays
- Test `get_artist_affinity` scoring formula
- Test `get_listening_patterns` time grouping
- Test `get_trend_analysis` period comparison
- Test `get_catalog_exploration` ratios
- Test `get_queue_dropoff` position analysis
- Test `get_source_effectiveness` per-source metrics
- Test `get_binge_index` calculation
- Test `end_session` populates all metrics correctly

### 7.2 Test Strategy

- Use `pytest` with `pytest-asyncio`
- Use a test database (PostgreSQL) with transaction rollback per test
- Seed test data with known values for deterministic assertions
- Test edge cases: empty data, single event, all skips, all completions

## Implementation Order

1. **Phase 1** (Session metrics fix) — 1 day, highest priority, unblocks all session-based analytics
2. **Phase 2** (Data model) — 1 day, adds indexed columns for time analysis
3. **Phase 3** (Repository methods) — 3-4 days, core analytics queries
4. **Phase 4** (Service methods) — 1 day, business logic layer
5. **Phase 5** (API endpoints) — 1 day, route definitions
6. **Phase 6** (Frontend API client) — 1 day, typed client methods
7. **Phase 7** (Testing) — 2-3 days, comprehensive test coverage

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Time-series queries on large `listening_events` table could be slow | Add composite indexes: `(user_id, started_at)`, `(user_id, hour_of_day)`, `(user_id, day_of_week)` |
| `end_session` aggregation query could be slow for sessions with many events | Use a single SQL aggregation query, not N+1 |
| Backfilling session metrics for existing sessions could lock the table | Run backfill as a background job with small batches |
| Discovery metrics require subquery to find first play per song | Use `ROW_NUMBER() OVER (PARTITION BY song_id ORDER BY started_at)` or a separate `user_song_first_play` table |
| Affinity score formula may need tuning | Make weights configurable via constants, allow A/B testing |

## Migration Path

1. Add new columns to `listening_events` (backward compatible)
2. Deploy `end_session` fix (backward compatible, only affects new sessions)
3. Backfill session metrics for existing sessions (background job)
4. Deploy new repository methods (backward compatible)
5. Deploy new service methods (backward compatible)
6. Deploy new API endpoints (backward compatible)
7. Deploy frontend API client methods (backward compatible)
8. Backfill `hour_of_day`/`day_of_week` for existing events (background job)

## Validation Plan

1. Unit tests for each repository method with known data
2. Integration tests for each endpoint
3. Verify session metrics are populated correctly after `end_session`
4. Verify affinity scores are reasonable (spot-check with real data)
5. Verify time-of-day patterns match expected listening behavior
6. Verify trend analysis shows correct percent changes
7. Verify no performance regression on existing endpoints
