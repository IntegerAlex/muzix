"""Session repository: database operations for user sessions."""
from datetime import datetime, timezone
from sqlalchemy import select
from db import SessionLocal
from models import UserSession


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
        sess.ended_at = datetime.now(timezone.utc)
        sess.exit_reason = exit_reason
        await session.commit()
        return True
