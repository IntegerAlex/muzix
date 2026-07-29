"""Recommendation repository: data queries for recommendation engine."""
from collections import defaultdict
from datetime import datetime, timezone
from sqlalchemy import select, func, case
from db import SessionLocal
from models import ListeningEvent, Song, Album, Artist, UserLike


async def get_user_interactions(user_id: str, since: datetime | None = None) -> list[dict]:
    """Get user listening events with weights for collaborative filtering."""
    if since is None:
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.song_id,
            ListeningEvent.event_type,
            ListeningEvent.completion_percentage,
            ListeningEvent.duration_played_ms,
            ListeningEvent.song_duration_ms,
            ListeningEvent.started_at,
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.started_at >= since,
            ListeningEvent.song_id.is_not(None),
        ).order_by(ListeningEvent.started_at.desc())
        result = await session.execute(stmt)
        rows = result.all()
    
    interactions = []
    for r in rows:
        weight = _compute_weight(r.event_type, r.completion_percentage, r.duration_played_ms, r.song_duration_ms)
        interactions.append({
            "song_id": r.song_id,
            "weight": weight,
            "event_type": r.event_type,
            "started_at": r.started_at.isoformat(),
        })
    return interactions


def _compute_weight(event_type: str, completion_pct: int, duration_ms: int, song_duration_ms: int | None) -> float:
    """Compute interaction weight based on event type and completion."""
    if event_type == "skip":
        return -1.0
    if event_type == "complete":
        return 1.0
    if event_type == "play":
        if completion_pct >= 80:
            return 0.8
        if completion_pct >= 50:
            return 0.5
        if completion_pct >= 20:
            return 0.2
        return 0.1
    return 0.3


async def get_all_user_interactions() -> list[dict]:
    """Get aggregated (user_id, song_id, weight) across all users. Aggregated at SQL level."""
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.user_id,
            ListeningEvent.song_id,
            func.sum(
                case(
                    (ListeningEvent.event_type == "complete", 1.0),
                    (ListeningEvent.event_type == "skip", -0.5),
                    (ListeningEvent.event_type == "play",
                     case(
                         (ListeningEvent.completion_percentage >= 80, 0.8),
                         (ListeningEvent.completion_percentage >= 50, 0.5),
                         (ListeningEvent.completion_percentage >= 20, 0.2),
                         else_=0.1,
                     )),
                    else_=0.3,
                )
            ).label("weight"),
        ).where(
            ListeningEvent.user_id.is_not(None),
            ListeningEvent.song_id.is_not(None),
        ).group_by(
            ListeningEvent.user_id,
            ListeningEvent.song_id,
        ).having(
            func.sum(
                case(
                    (ListeningEvent.event_type == "complete", 1.0),
                    (ListeningEvent.event_type == "skip", -0.5),
                    (ListeningEvent.event_type == "play",
                     case(
                         (ListeningEvent.completion_percentage >= 80, 0.8),
                         (ListeningEvent.completion_percentage >= 50, 0.5),
                         (ListeningEvent.completion_percentage >= 20, 0.2),
                         else_=0.1,
                     )),
                    else_=0.3,
                )
            ) > 0
        )
        result = await session.execute(stmt)
        rows = result.all()

    return [
        {"user_id": r.user_id, "song_id": r.song_id, "weight": float(r.weight)}
        for r in rows
    ]


async def get_song_features() -> dict[str, dict]:
    """Get song features for content-based filtering."""
    async with SessionLocal() as session:
        songs_result = await session.execute(select(Song))
        songs = songs_result.scalars().all()
        song_ids = [s.id for s in songs]
    
    if not song_ids:
        return {}
    
    async with SessionLocal() as session:
        albums_result = await session.execute(select(Album).where(Album.id.in_([s.album_id for s in songs if s.album_id])))
        albums = albums_result.scalars().all()
        albums_map = {a.id: a for a in albums}
    
    async with SessionLocal() as session:
        artists_result = await session.execute(select(Artist).where(Artist.id.in_([s.artist_id for s in songs if s.artist_id])))
        artists = artists_result.scalars().all()
        artists_map = {a.id: a for a in artists}
    
    features = {}
    for song in songs:
        album = albums_map.get(song.album_id)
        artist = artists_map.get(song.artist_id)
        features[song.id] = {
            "artist_id": song.artist_id,
            "album_id": song.album_id,
            "genre": album.genre if album else "",
            "artist_name": artist.name if artist else "",
            "album_title": album.title if album else "",
            "title": song.title,
            "colors": song.colors,
        }
    return features


async def get_user_features(user_id: str) -> dict:
    """Get aggregated user features from listening history."""
    interactions = await get_user_interactions(user_id)
    if not interactions:
        return {"top_artists": [], "top_genres": [], "avg_completion": 0.0}
    
    song_ids = list(set(i["song_id"] for i in interactions))
    async with SessionLocal() as session:
        songs_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
        songs = songs_result.scalars().all()
        songs_map = {s.id: s for s in songs}
    
    artist_counts = defaultdict(int)
    genre_counts = defaultdict(int)
    completion_sum = 0.0
    completion_count = 0
    
    album_ids = [s.album_id for s in songs if s.album_id]
    albums_map = {}
    if album_ids:
        async with SessionLocal() as session:
            albums_result = await session.execute(select(Album).where(Album.id.in_(album_ids)))
            for a in albums_result.scalars().all():
                albums_map[a.id] = a
    
    for interaction in interactions:
        song = songs_map.get(interaction["song_id"])
        if not song:
            continue
        if interaction["event_type"] == "complete":
            artist_counts[song.artist_id] += 2
            album = albums_map.get(song.album_id) if song.album_id else None
            if album:
                genre_counts[album.genre] += 2
            completion_sum += 100.0
            completion_count += 1
        elif interaction["event_type"] == "play":
            artist_counts[song.artist_id] += 1
            album = albums_map.get(song.album_id) if song.album_id else None
            if album:
                genre_counts[album.genre] += 1
            completion_sum += interaction.get("completion_percentage", 0)
            completion_count += 1
    
    top_artists = sorted(artist_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    avg_completion = completion_sum / completion_count if completion_count > 0 else 0.0
    
    return {
        "top_artists": [aid for aid, _ in top_artists],
        "top_genres": [g for g, _ in top_genres],
        "avg_completion": avg_completion,
    }


async def get_user_liked_songs(user_id: str) -> set[str]:
    """Get set of song IDs the user has liked."""
    async with SessionLocal() as session:
        result = await session.execute(select(UserLike.song_id).where(UserLike.user_id == user_id))
        return {row[0] for row in result.all()}


async def get_popular_songs(limit: int = 20, since: datetime | None = None) -> list[dict]:
    """Get globally popular songs as fallback for new users."""
    if since is None:
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.song_id,
            func.count(ListeningEvent.id).label("play_count"),
            func.avg(ListeningEvent.completion_percentage).label("avg_completion"),
        ).where(
            ListeningEvent.started_at >= since,
            ListeningEvent.song_id.is_not(None),
        ).group_by(ListeningEvent.song_id).order_by(func.count(ListeningEvent.id).desc()).limit(limit)
        result = await session.execute(stmt)
        rows = result.all()
    
    song_ids = [r.song_id for r in rows if r.song_id]
    if not song_ids:
        return []
    
    async with SessionLocal() as session:
        songs_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
        songs = songs_result.scalars().all()
        songs_map = {s.id: s for s in songs}
    
    return [
        {
            "id": r.song_id,
            "title": songs_map[r.song_id].title if r.song_id in songs_map else "Unknown",
            "artist": songs_map[r.song_id].artist if r.song_id in songs_map else "Unknown",
            "album": songs_map[r.song_id].album if r.song_id in songs_map else "Unknown",
            "duration_ms": songs_map[r.song_id].duration_ms if r.song_id in songs_map else 0,
            "colors": songs_map[r.song_id].colors if r.song_id in songs_map else ["#6d28d9", "#db2777"],
        }
        for r in rows
        if r.song_id in songs_map
    ]
