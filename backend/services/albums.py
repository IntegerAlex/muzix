"""Album service: business logic for albums."""
from fastapi import HTTPException
from repositories import albums as album_repo
from helpers import serialize_album


async def get_album(album_id: str, base_url: str) -> dict:
    album = await album_repo.get_album(album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    return serialize_album(album, base_url)


async def list_albums(limit: int, offset: int, base_url: str) -> tuple[list[dict], int]:
    total = await album_repo.count_albums()
    albums = await album_repo.list_albums(limit, offset)
    return [serialize_album(a, base_url) for a in albums], total
