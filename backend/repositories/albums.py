"""Album repository: database operations for albums."""
from sqlalchemy import select, func
from db import SessionLocal
from models import Album


async def get_album(album_id: str) -> Album | None:
    async with SessionLocal() as session:
        return await session.get(Album, album_id)


async def list_albums(limit: int, offset: int) -> list[Album]:
    async with SessionLocal() as session:
        result = await session.execute(select(Album).limit(limit).offset(offset))
        return list(result.scalars().all())


async def count_albums() -> int:
    async with SessionLocal() as session:
        result = await session.execute(select(func.count(Album.id)))
        return result.scalar() or 0
