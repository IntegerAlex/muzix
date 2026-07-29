"""Share routes: generate share links and resolve share tokens."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from helpers import success_resp, rate_limit, check_rate_limit, _client_ip, get_current_user
from services import share as share_svc

router = APIRouter()


class ShareGenerate(BaseModel):
    content_type: str
    content_id: str
    selected_lyrics_lines: list[int] | None = None


@router.post("/generate")
async def generate_share(body: ShareGenerate, request: Request, user=Depends(get_current_user)):
    check_rate_limit(f"share:{user.id}", max_requests=10, window=60)
    base_url = str(request.base_url).rstrip("/")
    lyrics = None
    if body.content_type == "lyrics" and body.selected_lyrics_lines:
        from services.songs import get_song_lyrics
        song_lyrics = await get_song_lyrics(body.content_id)
        if song_lyrics:
            lines = song_lyrics.split("\n") if isinstance(song_lyrics, str) else song_lyrics
            lyrics = [lines[i] for i in body.selected_lyrics_lines if i < len(lines)]

    data = await share_svc.create_share(
        user_id=user.id,
        content_type=body.content_type,
        content_id=body.content_id,
        base_url=base_url,
        lyrics=lyrics,
        selected_lyrics_lines=body.selected_lyrics_lines,
    )
    return success_resp(data=data, message="Share link generated")


@router.get("/{share_token}")
async def resolve_share(share_token: str, request: Request):
    rate_limit(request, max_requests=30, window=60)
    data = await share_svc.get_share_by_token(share_token)
    if data is None:
        return success_resp(data={}, message="Share link not found or expired")
    return success_resp(data=data, message="Share link resolved")
