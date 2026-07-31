# 07 — Analytics

Statistical computations for user listening behavior: skip rate, completion rate, discovery, affinity, trends, and binge index.

- **Type**: Custom
- **File**: `backend/repositories/listening_events.py`, lines 256–681

## Algorithms

### 1. Skip Rate (lines 256–298)

Per-song skip rate as a ratio:

```
skip_rate = skip_count / (play_count + skip_count)
```

Returns 0 when `play_count + skip_count == 0`.

### 2. Completion Rate (lines 305–347)

Per-song average completion percentage:

```
completion_rate = avg_completion_percentage / 100
```

Ordered by `avg(completion_percentage)` descending.

### 3. Discovery Metrics (lines 354–402)

First-time plays vs repeat plays using a subquery:

```sql
first_play = MIN(started_at) GROUP BY song_id  -- subquery
first_time_plays = COUNT(events WHERE started_at == first_play)
discovery_ratio = first_time_plays / total_plays
repeat_play_ratio = (total_plays - first_time_plays) / total_plays
```

### 4. Artist Affinity Score (lines 409–443)

Weighted linear combination — **hardcoded weights**:

```
affinity_score = plays × 1.0 + completions × 0.5 + unique_songs × 2.0 - skips × 0.5
```

| Component | Weight | Notes |
|-----------|--------|-------|
| plays | 1.0 | Base engagement |
| completions | 0.5 | Full listens valued |
| unique_songs | 2.0 | Highest weight — breadth of exploration |
| skips | -0.5 | Negative signal |

### 5. Listening Patterns (lines 450–494)

Histograms by hour-of-day (0–23) and day-of-week (0–6). Fills missing slots with 0. Extracts top 3 peak hours and days.

### 6. Trend Analysis (lines 501–523)

Period-over-period percentage change:

```python
def pct_change(current, previous):
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round((current - previous) / previous * 100, 1)
```

Metrics tracked: `total_ms`, `total_plays`, `unique_songs`, `unique_artists`, `sessions`.

Period bounds: day (1d/2d), week (1w/2w), month (30d/60d), year (365d/730d).

### 7. Catalog Exploration (lines 530–558)

```
exploration_ratio = unique_songs / total_catalog_songs
repeat_play_ratio = (total_plays - unique_songs) / total_plays
```

### 8. Queue Dropoff (lines 565–596)

Positional histogram of skip events:

```
avg_skip_position = mean(position_in_queue WHERE event_type = 'skip')
dropoff_by_position = {position: skip_count}
```

### 9. Source Effectiveness (lines 603–634)

Per-source engagement score:

```
engagement_score = (avg_completion / 100) × plays
```

### 10. Binge Index (lines 641–681)

Density metric — songs per session divided by average gap between sessions:

```
songs_per_session = total_plays / total_sessions
avg_session_gap_hours = mean(gaps_between_session_starts)
binge_index = songs_per_session × (1 / avg_session_gap_hours)
```

Higher = more binge-like listening.

## Input → Output

- **Input**: `user_id`, `period` (day/week/month/year)
- **Output**: Varies per metric — ratios, scores, histograms, trend percentages
