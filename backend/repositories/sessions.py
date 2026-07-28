"""Session repository: database operations for user sessions."""
from datetime import datetime, timezone
from sqlalchemy import select, func
from db import SessionLocal
from models import UserSession, ListeningEvent


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

        # Calculate session metrics from listening events
        events_result = await session.execute(
            select(ListeningEvent).where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.session_id == session_id,
            )
        )
        events = events_result.scalars().all()

        total_ms = sum(e.duration_played_ms or 0 for e in events)
        songs_played = len(set(e.song_id for e in events if e.song_id))
        songs_completed = sum(1 for e in events if e.event_type == "complete")
        songs_skipped = sum(1 for e in events if e.event_type == "skip")
        unique_songs = len(set(e.song_id for e in events if e.song_id))

        sess.ended_at = datetime.now(timezone.utc)
        sess.exit_reason = exit_reason
        sess.total_listening_ms = total_ms
        sess.songs_played = songs_played
        sess.songs_completed = songs_completed
        sess.songs_skipped = songs_skipped
        sess.unique_songs = unique_songs
        await session.commit()
        return True
