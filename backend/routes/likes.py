"""Like routes: like/unlike songs, get likes."""
from fastapi import APIRouter, Depends, Request
from helpers import success_resp, make_cached_response, get_current_user
from services import likes as like_svc

router = APIRouter()


@router.post("/likes/{song_id}")
async def like_song(song_id: str, user=Depends(get_current_user)):
    result = await like_svc.like_song(user.id, song_id)
    return success_resp(data={}, message="Liked" if result == "liked" else "Already liked")


@router.delete("/likes/{song_id}")
async def unlike_song(song_id: str, user=Depends(get_current_user)):
    await like_svc.unlike_song(user.id, song_id)
    return success_resp(data={}, message="Unliked")


@router.get("/likes")
async def get_likes(request: Request, user=Depends(get_current_user)):
    data = await like_svc.get_likes(user.id)
    body = success_resp(data=data, message="Likes retrieved")
    return make_cached_response(body, request)
