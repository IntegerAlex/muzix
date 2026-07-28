"""Session repository: database operations for user sessions."""
from datetime import datetime, timezone
from sqlalchemy import select, func
from db import SessionLocal
from models import UserSession, ListeningEvent, Song


async def create_session(session_data: UserSession) -> None:
    async with SessionLocal() as session:
        session.add(session_data)
        await session.commit()


async def end_session(session_id: str, user_id: str, exit_reason: str | None) -> bool:
    async with SessionLocal() as session:
        result = await session.execute(
            select(UserSession).where(UserSession.id == session_id, UserSession.user_id == user_id)
        )
        sess = result.scalar_one_or_none()
        if not sess:
            return False

        agg = await session.execute(
            select(
                func.coalesce(func.sum(ListeningEvent.duration_played_ms), 0).label("total_ms"),
                func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "play").label("songs_played"),
                func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "complete").label("songs_completed"),
                func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "skip").label("songs_skipped"),
                func.count(func.distinct(ListeningEvent.song_id)).label("unique_songs"),
            ).where(
                ListeningEvent.session_id == session_id,
                ListeningEvent.user_id == user_id,
            )
        )
        row = agg.one()

        unique_artists_result = await session.execute(
            select(func.count(func.distinct(Song.artist_id)))
            .select_from(ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id))
            .where(
                ListeningEvent.session_id == session_id,
                ListeningEvent.user_id == user_id,
            )
        )
        unique_artists = unique_artists_result.scalar() or 0

        sess.ended_at = datetime.now(timezone.utc)
        sess.exit_reason = exit_reason
        sess.total_listening_ms = int(row.total_ms)
        sess.songs_played = row.songs_played
        sess.songs_completed = row.songs_completed
        sess.songs_skipped = row.songs_skipped
        sess.unique_songs = row.unique_songs
        sess.unique_artists = unique_artists

        await session.commit()
        return True
