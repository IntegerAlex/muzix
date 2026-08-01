"""Recommendation repository: data queries for recommendation engine."""
from collections import defaultdict
from datetime import datetime, timezone
from sqlalchemy import select, func, case
from db import SessionLocal
from models import ListeningEvent, Song, Album, Artist, UserLike


async def get_all_user_interactions(since: datetime | None = None) -> list[dict]:
    """Get aggregated (user_id, song_id, weight) across all users. Aggregated at SQL level."""
    if since is None:
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
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
            ListeningEvent.started_at >= since,
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


async def get_song_features(song_ids: list[str] | None = None) -> dict[str, dict]:
    """Get song features for content-based filtering."""
    async with SessionLocal() as session:
        if song_ids:
            songs_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
        else:
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
            "duration_ms": song.duration_ms,
            "colors": song.colors,
        }
    return features


async def get_user_features(user_id: str) -> dict:
    """Get aggregated user features from listening history."""
    since = datetime(1970, 1, 1, tzinfo=timezone.utc)
    async with SessionLocal() as session:
        stmt = select(
            Song.artist_id,
            Album.genre,
            func.sum(case(
                (ListeningEvent.event_type == "complete", 2),
                (ListeningEvent.event_type == "play", 1),
                else_=0,
            )).label("artist_weight"),
            func.sum(case(
                (ListeningEvent.event_type == "complete", 2),
                (ListeningEvent.event_type == "play", 1),
                else_=0,
            )).label("genre_weight"),
            func.sum(case(
                (ListeningEvent.event_type == "complete", 100.0),
                (ListeningEvent.event_type == "play", ListeningEvent.completion_percentage),
                else_=0,
            )).label("completion_sum"),
            func.sum(case(
                (ListeningEvent.event_type.in_(["complete", "play"]), 1),
                else_=0,
            )).label("completion_count"),
        ).join(
            Song, ListeningEvent.song_id == Song.id
        ).join(
            Album, Song.album_id == Album.id
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.started_at >= since,
            ListeningEvent.song_id.is_not(None),
        ).group_by(
            Song.artist_id, Album.genre
        )
        result = await session.execute(stmt)
        rows = result.all()

    artist_counts = defaultdict(int)
    genre_counts = defaultdict(int)
    completion_sum = 0.0
    completion_count = 0

    for row in rows:
        artist_counts[row.artist_id] += row.artist_weight
        genre_counts[row.genre] += row.genre_weight
        completion_sum += row.completion_sum
        completion_count += row.completion_count

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


async def get_popular_songs(limit: int = 20, since: datetime | None = None, base_url: str = "") -> list[dict]:
    """Get globally popular songs as fallback for new users."""
    if since is None:
        since = datetime(1970, 1, 1, tzinfo=timezone.utc)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.song_id,
            func.count(ListeningEvent.id).label("play_count"),
            Song.title,
            Song.artist,
            Song.album,
            Song.duration_ms,
            Song.colors,
        ).join(
            Song, ListeningEvent.song_id == Song.id
        ).where(
            ListeningEvent.started_at >= since,
            ListeningEvent.song_id.is_not(None),
        ).group_by(
            ListeningEvent.song_id, Song.title, Song.artist, Song.album, Song.duration_ms, Song.colors
        ).order_by(func.count(ListeningEvent.id).desc()).limit(limit)
        result = await session.execute(stmt)
        rows = result.all()

    return [
        {
            "id": r.song_id,
            "title": r.title if r.title else "Unknown",
            "artist": r.artist if r.artist else "Unknown",
            "album": r.album if r.album else "Unknown",
            "duration_ms": r.duration_ms if r.duration_ms else 0,
            "colors": r.colors if r.colors else ["#6d28d9", "#db2777"],
            "imageUrl": f"{base_url}/thumbnails/{r.song_id}.jpg",
        }
        for r in rows
    ]
