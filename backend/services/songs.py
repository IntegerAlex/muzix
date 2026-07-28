"""Song service: business logic for songs."""
from fastapi import HTTPException
from repositories import songs as song_repo
from helpers import serialize_song


async def get_song(song_id: str, base_url: str) -> dict:
    song = await song_repo.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return serialize_song(song, base_url)


async def list_songs(limit: int, offset: int, base_url: str) -> tuple[list[dict], int]:
    total = await song_repo.count_songs()
    songs = await song_repo.list_songs(limit, offset)
    return [serialize_song(s, base_url) for s in songs], total
