# Muzix Algorithms

Runtime logic, data transformations, and deterministic flows used across the Muzix music app.

## Scope

**Included**: algorithms that transform data, make decisions, or produce deterministic outputs — recommendation engines, scoring functions, caching eviction, retry policies, search indexing, analytics computations.

**Excluded**: UI animation timings (e.g., `EqualizerBar`), config files, one-off scripts, and visual effects. ETL/data-pipeline scripts are documented separately in `16-genre-backfill.md` for reference but are not runtime algorithms.

## Maintenance

- **Last audited**: 2026-08-02
- Line numbers referenced in these docs were valid as of the audit date. If files have been refactored, grep for the function name to find the current location.
- Known discrepancy: the SQL aggregation in `get_all_user_interactions` uses `skip=-0.5`, while `_compute_weight` uses `skip=-1.0`. This is intentional — the aggregated SQL version uses a softer negative signal for batch processing.

## Index

| # | File | Category | Algorithm | Type |
|---|------|----------|-----------|------|
| 01 | [recommendation-engine](01-recommendation-engine.md) | Recommendations | ALS matrix factorization + content-based boost | Known (Hu et al.) + Custom |
| 02 | [interaction-scoring](02-interaction-scoring.md) | Scoring | Event weight computation, SQL aggregation, user features | Custom |
| 03 | [shuffle](03-shuffle.md) | Playback | Fisher-Yates shuffle + unshuffle toggle | Known + Custom |
| 04 | [player-logic](04-player-logic.md) | Playback | Next/prev navigation, queue reorder, completion detection | Custom |
| 05 | [play-time-tracking](05-play-time-tracking.md) | Tracking | Delta accumulator, periodic flush, server upsert | Custom |
| 06 | [offline-queue](06-offline-queue.md) | Offline | FIFO request queue, promise queue, retry on reconnect | Custom |
| 07 | [analytics](07-analytics.md) | Analytics | Skip rate, affinity, discovery, trends, binge index | Custom |
| 08 | [mood-system](08-mood-system.md) | Personalization | Genre-to-mood mapping, majority vote | Custom |
| 09 | [caching-strategy](09-caching-strategy.md) | Caching | LRU+TTL, Redis generation-scoped catalog, ETag/304, preload cache | Known + Custom |
| 10 | [audio-cache](10-audio-cache.md) | Caching | SQLite-backed audio file cache, LRU rotation | Custom |
| 11 | [network-retry](11-network-retry.md) | Network | Exponential backoff, timeout, error classification | Known + Custom |
| 12 | [auth-and-rate-limiting](12-auth-and-rate-limiting.md) | Security | JWT parsing, refresh token rotation, Redis + in-memory sliding/fixed-window rate limiter | Custom |
| 13 | [lyrics-and-color](13-lyrics-and-color.md) | Data | LRC parser, MD5 color generation, color mixing | Custom |
| 14 | [search](14-search.md) | Search | PostgreSQL full-text search, client fallback, debounce | Known + Custom |
| 15 | [thumbnail-serving](15-thumbnail-serving.md) | Media | URL propagation, R2 streaming, size guard, cache headers | Custom |
| 16 | [genre-backfill](16-genre-backfill.md) | ETL | MusicBrainz + Wikipedia genre scraping pipeline | Custom |

## Summary by category

- **Recommendations**: 01, 02
- **Playback**: 03, 04
- **Tracking**: 05
- **Offline**: 06
- **Analytics**: 07
- **Personalization**: 08
- **Caching**: 09, 10
- **Network**: 11
- **Security**: 12
- **Data**: 13, 14, 15, 16
