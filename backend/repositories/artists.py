"""Artist repository: database operations for artists."""
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from db import SessionLocal
from models import Artist


async def get_artist(artist_id: str) -> Artist | None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Artist).options(selectinload(Artist.albums)).where(Artist.id == artist_id)
        )
        return result.scalar_one_or_none()


async def list_artists(limit: int, offset: int) -> list[Artist]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Artist).options(selectinload(Artist.albums)).limit(limit).offset(offset)
        )
        return list(result.scalars().all())


async def count_artists() -> int:
    async with SessionLocal() as session:
        result = await session.execute(select(func.count(Artist.id)))
        return result.scalar() or 0


async def search_artists(query: str, limit: int = 50) -> list[Artist]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Artist).options(selectinload(Artist.albums)).where(Artist.name.ilike(f"%{query}%")).limit(limit)
        )
        return list(result.scalars().all())
