"""Song repository: database operations for songs."""
from sqlalchemy import select, func, text
from db import SessionLocal
from models import Song


async def get_song(song_id: str) -> Song | None:
    async with SessionLocal() as session:
        return await session.get(Song, song_id)


async def list_songs(limit: int, offset: int) -> list[Song]:
    async with SessionLocal() as session:
        result = await session.execute(select(Song).limit(limit).offset(offset))
        return list(result.scalars().all())


async def count_songs() -> int:
    async with SessionLocal() as session:
        result = await session.execute(select(func.count(Song.id)))
        return result.scalar() or 0


def _clean_str(v: str | None, max_len: int = 512) -> str:
    if not v:
        return ""
    v = str(v).strip()
    return v[:max_len]


async def ensure_external_songs(metas: list[dict]) -> int:
    """Upsert minimal Song rows for YouTube / on-device tracks.

    Telemetry, likes, and playlists all FK to songs.id. Without this, any
    play/like of a track that was never imported fails with a FK violation
    and the event is lost. Existing catalog rows are never overwritten —
    ON CONFLICT DO NOTHING keeps the import pipeline authoritative.

    Each meta may contain: id, title, artist, album, genre, duration_ms,
    colors (list[str]). Missing fields fall back to safe defaults.
    Returns the number of rows inserted.
    """
    # Dedupe by id, keep first occurrence.
    seen: dict[str, dict] = {}
    for m in metas:
        sid = str(m.get("id") or m.get("song_id") or "").strip()[:64]
        if not sid or sid in seen:
            continue
        seen[sid] = m
    if not seen:
        return 0

    from helpers import colors_from_title

    rows: list[dict] = []
    for sid, m in seen.items():
        title = _clean_str(m.get("title") or "Unknown")
        artist = _clean_str(m.get("artist") or "Unknown")
        album = _clean_str(m.get("album") or artist)
        genre = _clean_str(m.get("genre") or "", 128)
        duration_ms = 0
        try:
            duration_ms = int(m.get("duration_ms") or m.get("song_duration_ms") or 0)
        except (TypeError, ValueError):
            duration_ms = 0
        colors = m.get("colors") if isinstance(m.get("colors"), list) and len(m.get("colors")) == 2 else None
        if not colors:
            try:
                colors = colors_from_title(title or sid)
            except Exception:
                colors = ["#6d28d9", "#db2777"]
        duration_s = duration_ms // 1000 if duration_ms > 0 else 0
        rows.append({
            "id": sid,
            "title": title,
            "artist": artist,
            "album": album,
            "genre": genre,
            "duration": f"{duration_s // 60}:{duration_s % 60:02d}" if duration_s else "",
            "duration_ms": duration_ms,
            "colors": colors,
        })

    async with SessionLocal() as session:
        # Fast path: skip IDs that already exist.
        existing = (
            await session.execute(
                select(Song.id).where(Song.id.in_([r["id"] for r in rows]))
            )
        ).scalars().all()
        existing_set = set(existing)
        missing = [r for r in rows if r["id"] not in existing_set]
        if not missing:
            return 0
        await session.execute(
            text("""
                INSERT INTO songs (id, title, artist, album, genre, duration, duration_ms, colors)
                VALUES (:id, :title, :artist, :album, :genre, :duration, :duration_ms, :colors)
                ON CONFLICT (id) DO NOTHING
            """),
            missing,
        )
        await session.commit()
        return len(missing)
