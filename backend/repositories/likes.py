"""Like repository: database operations for user likes."""
import logging
import uuid
from sqlalchemy import select
from db import SessionLocal
from models import UserLike

logger = logging.getLogger("muzix.likes")


async def get_user_likes(user_id: str) -> list[str]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(UserLike.song_id).where(UserLike.user_id == user_id)
        )
        return result.scalars().all()


async def add_like(user_id: str, song_id: str) -> bool:
    """Returns True if liked, False if already exists."""
    async with SessionLocal() as session:
        try:
            like = UserLike(id=str(uuid.uuid4()), user_id=user_id, song_id=song_id)
            session.add(like)
            await session.commit()
            return True
        except Exception as exc:
            await session.rollback()
            logger.error("Failed to add like: %s", exc, exc_info=True)
            return False


async def remove_like(user_id: str, song_id: str) -> bool:
    """Returns True if removed, False if not found."""
    async with SessionLocal() as session:
        result = await session.execute(
            select(UserLike).where(UserLike.user_id == user_id, UserLike.song_id == song_id)
        )
        like = result.scalar_one_or_none()
        if like:
            await session.delete(like)
            await session.commit()
            return True
        return False
