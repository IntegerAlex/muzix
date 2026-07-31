# 02 — Interaction Scoring

Event weight computation for the recommendation matrix, SQL-level aggregation, and user feature extraction.

- **Type**: Custom (hardcoded constants)
- **File**: `backend/repositories/recommendations.py`, lines 41–204

## How it works

### 1. Event Weight Computation (`_compute_weight`, lines 41–55)

Maps listening events to weights for the user-item interaction matrix. **All weights are hardcoded constants — not tunable.**

| Event Type | Condition | Weight |
|------------|-----------|--------|
| `skip` | any | -1.0 |
| `complete` | any | 1.0 |
| `play` | completion ≥ 80% | 0.8 |
| `play` | completion ≥ 50% | 0.5 |
| `play` | completion ≥ 20% | 0.2 |
| `play` | completion < 20% | 0.1 |
| (default) | any other | 0.3 |

### 2. SQL Aggregated Weights (`get_all_user_interactions`, lines 58–109)

Mirrors the same weight logic in SQL using `CASE` expressions for server-side aggregation across all users. Groups by `(user_id, song_id)`, filters with `HAVING SUM(weight) > 0`.

**Known discrepancy**: SQL uses `skip = -0.5` (line 69) while Python uses `skip = -1.0` (line 44). This is intentional — the aggregated SQL version uses a softer negative signal.

```sql
SUM(
  CASE WHEN event_type = 'complete' THEN 1.0
       WHEN event_type = 'skip' THEN -0.5
       WHEN event_type = 'play' THEN
           CASE WHEN completion_pct >= 80 THEN 0.8
                WHEN completion_pct >= 50 THEN 0.5
                WHEN completion_pct >= 20 THEN 0.2
                ELSE 0.1 END
       ELSE 0.3 END
)
```

### 3. User Feature Aggregation (`get_user_features`, lines 152–204)

Builds a user profile from listening history:

| Metric | Computation |
|--------|-------------|
| top_artists | Top 10 artist IDs by weighted count (complete=2x, play=1x) |
| top_genres | Top 5 genres by weighted count (complete=2x, play=1x) |
| avg_completion | Average `completion_percentage` across all events |

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Skip weight (Python) | -1.0 | Used in `_compute_weight` |
| Skip weight (SQL) | -0.5 | Softer signal in batch aggregation |
| Complete weight | 1.0 | Full completion |
| Top artists count | 10 | Hardcoded |
| Top genres count | 5 | Hardcoded |
| Completion boost weights | 2x | Completions count double for user features |

## Input → Output

- **Input**: All user interactions from `listening_events` table (180-day window)
- **Output**: List of `{user_id, song_id, weight}` dicts for the ALS matrix
