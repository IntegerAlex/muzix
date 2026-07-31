# 14 — Search

PostgreSQL full-text search with client-side fallback and debounced input.

- **Type**: Known (PostgreSQL tsvector/tsquery) + Custom
- **File**: `backend/services/search.py`, lines 1–24
- **File**: `web/muzix/services/data.ts`, lines 132–140 (client fallback), 393–415 (debounce)

## How it works

### 1. PostgreSQL Full-Text Search (`search.py`, lines 9–19)

Uses PostgreSQL's built-in full-text search with English language stemming:

```python
tsquery = func.plainto_tsquery("english", query)
songs = select(Song).where(Song.fts.op("@@")(tsquery)).limit(50)
albums = select(Album).where(Album.fts.op("@@")(tsquery)).limit(50)
artists = select(Artist).where(Artist.fts.op("@@")(tsquery)).limit(50)
```

- `plainto_tsquery("english", query)` — stems query words using English dictionary
- `@@` operator — matches against a `TSVECTOR` column
- Empty query returns first 50 results (no filter)

### 2. Client-Side Fallback (`data.ts`, lines 132–140)

Case-insensitive substring matching when API is unavailable:

```typescript
function searchAll(query) {
  const q = query.trim().toLowerCase();
  return {
    songs: _songs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)),
    albums: _albums.filter(a => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)),
    artists: _artists.filter(a => a.name.toLowerCase().includes(q)),
  };
}
```

### 3. Search Debounce (`data.ts`, lines 393–415)

Debounces input by 300ms before making API call:

```typescript
useEffect(() => {
  if (!query.trim()) { setResults(empty); return; }
  const timer = setTimeout(() => {
    apiSearch(query).then(r => { setResults(r); setLoading(false); });
  }, 300);
  return () => clearTimeout(timer);
}, [query]);
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| FTS language | English | Stemming dictionary |
| Results limit | 50 | Per entity type (songs, albums, artists) |
| Debounce delay | 300ms | Before API call |

## Input → Output

- **Input**: Search query string
- **Output**: `{songs: [], albums: [], artists: []}` — up to 50 results each
