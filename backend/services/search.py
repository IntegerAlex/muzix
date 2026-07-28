"""Search service: full-text search across songs, albums, artists."""
from sqlalchemy import select, func
from db import SessionLocal
from models import Song, Album, Artist
from helpers import serialize_song, serialize_album, serialize_artist


async def search(query: str, base_url: str) -> dict:
    async with SessionLocal() as session:
        if query.strip():
            tsquery = func.plainto_tsquery("english", query)
            songs = (await session.execute(select(Song).where(Song.fts.op("@@")(tsquery)).limit(50))).scalars().all()
            albums = (await session.execute(select(Album).where(Album.fts.op("@@")(tsquery)).limit(50))).scalars().all()
            artists = (await session.execute(select(Artist).where(Artist.fts.op("@@")(tsquery)).limit(50))).scalars().all()
        else:
            songs = (await session.execute(select(Song).limit(50))).scalars().all()
            albums = (await session.execute(select(Album).limit(50))).scalars().all()
            artists = (await session.execute(select(Artist).limit(50))).scalars().all()
    return {
        "songs": [serialize_song(s, base_url, brief=True) for s in songs],
        "albums": [serialize_album(a, base_url) for a in albums],
        "artists": [serialize_artist(a) for a in artists],
    }
