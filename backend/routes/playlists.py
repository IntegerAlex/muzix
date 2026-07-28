"""Playlist routes: CRUD + song management."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, field_validator

from config import MAX_TITLE_LEN, MAX_SONGS_PER_PLAYLIST
from helpers import success_resp, rate_limit, pagination_meta, make_cached_response, get_current_user
from services import playlists as playlist_svc

router = APIRouter()


class PlaylistCreate(BaseModel):
    title: str
    songIds: list[str] = []

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return v[:MAX_TITLE_LEN] if v else ""

    @field_validator("songIds")
    @classmethod
    def validate_song_ids(cls, v: list[str]) -> list[str]:
        if len(v) > MAX_SONGS_PER_PLAYLIST:
            raise ValueError(f"Playlist cannot exceed {MAX_SONGS_PER_PLAYLIST} songs")
        return v[:MAX_SONGS_PER_PLAYLIST]


@router.post("/playlists")
async def create_playlist(body: PlaylistCreate, user=Depends(get_current_user)):
    data = await playlist_svc.create_playlist(body.title, body.songIds, user)
    return success_resp(data=data, message="Playlist created")


@router.get("/playlists")
async def list_playlists(request: Request, user=Depends(get_current_user), limit: int = 100, offset: int = 0):
    rate_limit(request, max_requests=60, window=60)
    items, total = await playlist_svc.list_playlists(user, limit, offset)
    body = success_resp(data=items, message="Playlists retrieved", meta=pagination_meta(total, max(1, min(limit, 500)), max(0, offset)))
    return make_cached_response(body, request)


@router.get("/playlists/{playlist_id}")
async def get_playlist(playlist_id: str, request: Request, user=Depends(get_current_user)):
    rate_limit(request, max_requests=60, window=60)
    data = await playlist_svc.get_playlist(playlist_id, user)
    body = success_resp(data=data, message="Playlist retrieved")
    return make_cached_response(body, request)


@router.put("/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, body: PlaylistCreate, user=Depends(get_current_user)):
    data = await playlist_svc.update_playlist(playlist_id, body.title, body.songIds, user)
    return success_resp(data=data, message="Playlist updated")


@router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user=Depends(get_current_user)):
    await playlist_svc.delete_playlist(playlist_id, user)
    return success_resp(data={}, message="Playlist deleted")


@router.post("/playlists/{playlist_id}/songs/{song_id}")
async def add_song_to_playlist(playlist_id: str, song_id: str, user=Depends(get_current_user)):
    data = await playlist_svc.add_song(playlist_id, song_id, user)
    return success_resp(data=data, message="Song added to playlist")


@router.delete("/playlists/{playlist_id}/songs/{song_id}")
async def remove_song_from_playlist(playlist_id: str, song_id: str, user=Depends(get_current_user)):
    data = await playlist_svc.remove_song(playlist_id, song_id, user)
    return success_resp(data=data, message="Song removed from playlist")
