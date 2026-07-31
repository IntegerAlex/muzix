# 15 — Thumbnail Serving

URL propagation pattern, R2 streaming with size guard, and cache headers.

- **Type**: Custom
- **File**: `backend/services/thumbnails.py`, lines 1–38 (R2 fetch)
- **File**: `backend/routes/thumbnails.py`, lines 1–20 (endpoint)
- **File**: `backend/routes/home.py`, lines 26–29 (URL injection)
- **File**: `backend/helpers.py`, lines 245, 268 (serialization)

## How it works

### 1. URL Propagation Pattern

Thumbnails follow a consistent URL pattern across all API responses:

```
{base_url}/thumbnails/{song_id}.jpg
```

Injected in multiple places:
- `serialize_song()` — `helpers.py:245`
- `serialize_album()` — `helpers.py:268`
- `_add_thumbnail()` — `routes/home.py:26–29` (fallback for missing imageUrl)
- `get_recommendations()` — `services/recommendations.py:239`
- `get_top_songs()` — `repositories/listening_events.py:212`
- `get_popular_songs()` — `repositories/recommendations.py:247`

### 2. Thumbnail Endpoint (`routes/thumbnails.py`, lines 10–20)

```python
@router.get("/thumbnails/{filename}")
async def serve_thumbnail(filename: str, request: Request):
    rate_limit(request, max_requests=120, window=60)
    content, content_type = await thumb_svc.get_thumbnail(filename)
    return Response(
        content=content,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )
```

### 3. R2 Fetch with Size Guard (`services/thumbnails.py`, lines 10–38)

```python
async def get_thumbnail(filename: str) -> tuple[bytes, str]:
    # Path traversal validation
    if '/' in filename or '\\' in filename or '..' in filename or '\0' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    key = f"thumbnails/{filename}"
    obj = await asyncio.to_thread(r2.get_object, Bucket=R2_BUCKET, Key=key)

    # Size check (header)
    content_length = obj.get("ContentLength", 0)
    if content_length and content_length > MAX_THUMB_BYTES:
        raise HTTPException(status_code=413, detail="Thumbnail too large")

    # Chunked read with size check
    chunks = []
    total = 0
    while True:
        chunk = await asyncio.to_thread(body.read, STREAM_CHUNK)
        if not chunk: break
        total += len(chunk)
        if total > MAX_THUMB_BYTES:
            raise HTTPException(status_code=413, detail="Thumbnail too large")
        chunks.append(chunk)

    return b"".join(chunks), obj.get("ContentType", "image/jpeg")
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max thumbnail size | 5MB | 5 × 1024 × 1024 bytes |
| Stream chunk size | 64KB | 64 × 1024 bytes |
| Cache-Control | `max-age=86400, immutable` | 24-hour cache |
| Rate limit | 120 req/60s | Per IP |
| URL pattern | `/thumbnails/{song_id}.jpg` | Consistent across all endpoints |

## Input → Output

- **Input**: Song/album ID
- **Output**: Raw JPEG bytes with content-type and immutable cache headers
