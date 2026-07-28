"""Artist repository: database operations for artists."""
from sqlalchemy import select, func
from db import SessionLocal
from models import Artist


async def get_artist(artist_id: str) -> Artist | None:
    async with SessionLocal() as session:
        return await session.get(Artist, artist_id)


async def list_artists(limit: int, offset: int) -> list[Artist]:
    async with SessionLocal() as session:
        result = await session.execute(select(Artist).limit(limit).offset(offset))
        return list(result.scalars().all())


async def count_artists() -> int:
    async with SessionLocal() as session:
        result = await session.execute(select(func.count(Artist.id)))
        return result.scalar() or 0


async def search_artists(query: str, limit: int = 50) -> list[Artist]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Artist).where(Artist.name.ilike(f"%{query}%")).limit(limit)
        )
        return list(result.scalars().all())
