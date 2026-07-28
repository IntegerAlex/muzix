"""Playlist service: business logic for playlists."""
import uuid
from fastapi import HTTPException
from config import MAX_TITLE_LEN, MAX_SONGS_PER_PLAYLIST
from repositories import playlists as playlist_repo
from helpers import serialize_playlist
from models import Playlist, User


def _check_owner(playlist: Playlist, user: User) -> None:
    if playlist.owner_id and playlist.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Playlist not found")


async def create_playlist(title: str, song_ids: list[str], user: User) -> dict:
    playlist = Playlist(
        id=str(uuid.uuid4()),
        owner_id=user.id,
        title=title[:MAX_TITLE_LEN] if title else "",
        colors=["#6d28d9", "#db2777"],
        song_ids=song_ids[:MAX_SONGS_PER_PLAYLIST],
    )
    await playlist_repo.create_playlist(playlist)
    return serialize_playlist(playlist)


async def list_playlists(user: User, limit: int, offset: int) -> tuple[list[dict], int]:
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    total = await playlist_repo.count_playlists(user.id)
    playlists = await playlist_repo.list_playlists(user.id, limit, offset)
    return [serialize_playlist(p) for p in playlists], total


async def get_playlist(playlist_id: str, user: User) -> dict:
    playlist = await playlist_repo.get_playlist(playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    _check_owner(playlist, user)
    return serialize_playlist(playlist)


async def update_playlist(playlist_id: str, title: str, song_ids: list[str], user: User) -> dict:
    playlist = await playlist_repo.get_playlist(playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    _check_owner(playlist, user)
    playlist.title = title
    playlist.song_ids = song_ids[:MAX_SONGS_PER_PLAYLIST]
    await playlist_repo.update_playlist(playlist)
    return serialize_playlist(playlist)


async def delete_playlist(playlist_id: str, user: User) -> None:
    playlist = await playlist_repo.get_playlist(playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    _check_owner(playlist, user)
    await playlist_repo.delete_playlist(playlist)


async def add_song(playlist_id: str, song_id: str, user: User) -> dict:
    playlist = await playlist_repo.get_playlist(playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    _check_owner(playlist, user)
    if playlist.song_ids is None:
        playlist.song_ids = []
    if song_id not in playlist.song_ids:
        playlist.song_ids = playlist.song_ids + [song_id]
    await playlist_repo.update_playlist(playlist)
    return serialize_playlist(playlist)


async def remove_song(playlist_id: str, song_id: str, user: User) -> dict:
    playlist = await playlist_repo.get_playlist(playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    _check_owner(playlist, user)
    if playlist.song_ids and song_id in playlist.song_ids:
        playlist.song_ids = [s for s in playlist.song_ids if s != song_id]
    await playlist_repo.update_playlist(playlist)
    return serialize_playlist(playlist)
