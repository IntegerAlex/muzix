"""Listening event repository: database operations for telemetry/analytics."""
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from db import SessionLocal
from models import ListeningEvent, Song


async def record_events(user_id: str, events: list[dict]) -> int:
    async with SessionLocal() as session:
        objs = [
            ListeningEvent(
                id=str(uuid.uuid4()),
                user_id=user_id,
                song_id=e["song_id"],
                session_id=e["session_id"],
                event_type=e.get("event_type", "play"),
                started_at=datetime.fromisoformat(e["started_at"].replace("Z", "+00:00")),
                ended_at=datetime.fromisoformat(e["ended_at"].replace("Z", "+00:00")) if e.get("ended_at") else None,
                duration_played_ms=e.get("duration_played_ms", 0),
                song_duration_ms=e.get("song_duration_ms"),
                completion_percentage=e.get("completion_percentage", 0),
                source=e.get("source"),
                source_id=e.get("source_id"),
                position_in_queue=e.get("position_in_queue"),
                device_type=e.get("device_type", "web"),
                app_version=e.get("app_version"),
            )
            for e in events
        ]
        session.add_all(objs)
        await session.commit()
    return len(events)


def _since_from_period(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "day":
        return now - timedelta(days=1)
    elif period == "week":
        return now - timedelta(weeks=1)
    elif period == "month":
        return now - timedelta(days=30)
    elif period == "year":
        return now - timedelta(days=365)
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


async def get_top_songs(user_id: str, period: str, limit: int) -> list[dict]:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.song_id,
            func.count(ListeningEvent.id).label("play_count"),
            func.sum(ListeningEvent.duration_played_ms).label("total_ms"),
            func.count(func.distinct(ListeningEvent.session_id)).label("sessions"),
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.event_type == "play",
            ListeningEvent.started_at >= since,
        ).group_by(ListeningEvent.song_id).order_by(func.count(ListeningEvent.id).desc()).limit(limit)

        result = await session.execute(stmt)
        rows = result.all()

        song_ids = [r.song_id for r in rows if r.song_id]
        songs_map = {}
        if song_ids:
            song_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
            for s in song_result.scalars().all():
                songs_map[s.id] = {
                    "id": s.id, "title": s.title, "artist": s.artist,
                    "album": s.album, "duration_ms": s.duration_ms, "colors": s.colors,
                }

        return [
            {
                "song": songs_map.get(r.song_id, {"id": r.song_id, "title": "Unknown"}),
                "play_count": r.play_count,
                "total_listening_ms": r.total_ms,
                "sessions": r.sessions,
            }
            for r in rows if r.song_id
        ]


async def get_stats(user_id: str, period: str) -> dict:
    since = _since_from_period(period)
    base_filter = (
        ListeningEvent.user_id == user_id,
        ListeningEvent.event_type == "play",
        ListeningEvent.started_at >= since,
    )
    async with SessionLocal() as session:
        stats_result = await session.execute(
            select(
                func.coalesce(func.sum(ListeningEvent.duration_played_ms), 0).label("total_ms"),
                func.count(func.distinct(ListeningEvent.song_id)).label("unique_songs"),
                func.count(ListeningEvent.id).label("total_plays"),
            ).where(*base_filter)
        )
        stats = stats_result.one()

        artists_result = await session.execute(
            select(func.count(func.distinct(Song.artist_id)))
            .select_from(ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id))
            .where(*base_filter)
        )
        unique_artists = artists_result.scalar() or 0

        sessions_result = await session.execute(
            select(func.count(func.distinct(ListeningEvent.session_id))).where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.started_at >= since,
            )
        )
        sessions = sessions_result.scalar() or 0
        total_ms = int(stats.total_ms)

        return {
            "total_ms": total_ms,
            "total_plays": stats.total_plays,
            "unique_songs": stats.unique_songs,
            "unique_artists": unique_artists,
            "sessions": sessions,
        }


async def get_recent_activity(user_id: str, limit: int) -> list[dict]:
    async with SessionLocal() as session:
        stmt = select(ListeningEvent).where(
            ListeningEvent.user_id == user_id,
        ).order_by(ListeningEvent.started_at.desc()).limit(limit)

        result = await session.execute(stmt)
        events = result.scalars().all()

        song_ids = list(set(e.song_id for e in events if e.song_id))
        songs_map = {}
        if song_ids:
            song_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
            for s in song_result.scalars().all():
                songs_map[s.id] = {
                    "id": s.id, "title": s.title, "artist": s.artist,
                    "album": s.album, "colors": s.colors,
                }

        items = [
            {
                "id": e.id,
                "song_id": e.song_id,
                "song": songs_map.get(e.song_id),
                "event_type": e.event_type,
                "started_at": e.started_at.isoformat(),
                "duration_played_ms": e.duration_played_ms,
                "completion_percentage": e.completion_percentage,
                "source": e.source,
            }
            for e in events
        ]
        return items
