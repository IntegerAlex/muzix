"""Like routes: like/unlike songs, get likes."""
from fastapi import APIRouter, Depends, Request
from helpers import success_resp, make_cached_response, get_current_user
from schemas import Envelope, LikesOut, UNAUTHORIZED, RATE_LIMITED
from services import likes as like_svc

router = APIRouter(tags=["likes"])


@router.post(
    "/likes/{song_id}",
    response_model=Envelope[dict],
    summary="Like a song",
    description="Add a song to the authenticated user's liked list. Idempotent — returns 'Already liked' if already present. Requires JWT.",
    responses={**UNAUTHORIZED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def like_song(song_id: str, user=Depends(get_current_user)):
    result = await like_svc.like_song(user.id, song_id)
    return success_resp(data={}, message="Liked" if result == "liked" else "Already liked")


@router.delete(
    "/likes/{song_id}",
    response_model=Envelope[dict],
    summary="Unlike a song",
    description="Remove a song from the authenticated user's liked list. Requires JWT.",
    responses={**UNAUTHORIZED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def unlike_song(song_id: str, user=Depends(get_current_user)):
    await like_svc.unlike_song(user.id, song_id)
    return success_resp(data={}, message="Unliked")


@router.get(
    "/likes",
    response_model=Envelope[LikesOut],
    summary="Get liked songs",
    description="Return the list of liked song IDs for the authenticated user. Cached with ETag. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_likes(request: Request, user=Depends(get_current_user)):
    data = await like_svc.get_likes(user.id)
    body = success_resp(data=data, message="Likes retrieved")
    return make_cached_response(body, request)
