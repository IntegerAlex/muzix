"""Song repository: database operations for songs."""
from sqlalchemy import select, func
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
