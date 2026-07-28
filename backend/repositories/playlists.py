"""Playlist repository: database operations for playlists."""
from sqlalchemy import select, func
from db import SessionLocal
from models import Playlist, User


async def get_playlist(playlist_id: str) -> Playlist | None:
    async with SessionLocal() as session:
        return await session.get(Playlist, playlist_id)


async def list_playlists(owner_id: str, limit: int, offset: int) -> list[Playlist]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Playlist)
            .where(Playlist.owner_id == owner_id)
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())


async def count_playlists(owner_id: str) -> int:
    async with SessionLocal() as session:
        result = await session.execute(
            select(func.count(Playlist.id)).where(Playlist.owner_id == owner_id)
        )
        return result.scalar() or 0


async def create_playlist(playlist: Playlist) -> Playlist:
    async with SessionLocal() as session:
        session.add(playlist)
        await session.commit()
        return playlist


async def update_playlist(playlist: Playlist) -> Playlist:
    async with SessionLocal() as session:
        session.add(playlist)
        await session.commit()
        return playlist


async def delete_playlist(playlist: Playlist) -> None:
    async with SessionLocal() as session:
        await session.delete(playlist)
        await session.commit()
