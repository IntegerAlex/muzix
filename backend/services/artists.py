"""Artist service: business logic for artists."""
from fastapi import HTTPException
from repositories import artists as artist_repo
from helpers import serialize_artist


async def get_artist(artist_id: str) -> dict:
    artist = await artist_repo.get_artist(artist_id)
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    return serialize_artist(artist)


async def list_artists(limit: int, offset: int) -> tuple[list[dict], int]:
    total = await artist_repo.count_artists()
    artists = await artist_repo.list_artists(limit, offset)
    return [serialize_artist(a) for a in artists], total
