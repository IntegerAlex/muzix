# 16 — Genre Backfill

ETL script that backfills genre for songs using MusicBrainz tags with Wikipedia scraping as fallback.

- **Type**: Custom (ETL script, not runtime algorithm)
- **File**: `backend/backfill_genre.py`, lines 1–206

**Note**: This is a data pipeline script, not a runtime algorithm. Documented for reference.

## How it works

### 1. MusicBrainz Tag Lookup (lines 37–66)

```
1. Search MusicBrainz API for artist by name
2. Fetch artist tags (genre tags from community)
3. Clean tags: remove decade tags, tags too similar to artist name
4. Return first valid tag as genre
```

### 2. Wikipedia Fallback (lines 95–117)

```
1. Fetch Wikipedia page for artist: en.wikipedia.org/wiki/{Artist_Name}
2. Parse infobox table for "Genre" row
3. Extract genre from links in the cell
4. Return first valid genre
```

### 3. Tag Cleaning (`clean_tag`, lines 69–85)

Filters out invalid tags:
- Tags identical to artist name
- Decade tags (e.g., "1980s", "1990")
- Tags that are subsets of artist name words
- Tags with fuzzy match ratio > 0.8 to artist name (`SequenceMatcher`)

### 4. Pipeline Flow (`backfill`, lines 137–185)

```
For each artist:
  1. Search MusicBrainz for artist ID (API_DELAY = 1.0s)
  2. Fetch tags from MusicBrainz (API_DELAY = 1.0s)
  3. If no valid tag → scrape Wikipedia (SCRAPE_DELAY = 0.3s)
  4. Update songs AND albums tables with genre
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| MusicBrainz API delay | 1.0s | Rate limiting |
| Scrape delay | 0.3s | Between Wikipedia requests |
| Fuzzy match threshold | 0.8 | SequenceMatcher ratio |
| User-Agent | `Muzix/1.0 (https://muzix.app)` | MusicBrainz requirement |

## Input → Output

- **Input**: All distinct artists from `songs` table
- **Output**: Updated `genre` field on `songs` and `albums` tables
