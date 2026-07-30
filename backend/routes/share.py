"""Share routes: generate share links and resolve share tokens."""
import os
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from helpers import success_resp, check_rate_limit, get_current_user
from services import share as share_svc

router = APIRouter()

WEB_URL = os.getenv("WEB_URL", "https://muzix.gossorg.in")


class ShareGenerate(BaseModel):
    content_type: str
    content_id: str
    selected_lyrics_lines: list[int] | None = None


@router.post("/generate")
async def generate_share(body: ShareGenerate, user=Depends(get_current_user)):
    check_rate_limit(f"share:{user.id}", max_requests=10, window=60)
    data = await share_svc.create_share(
        user_id=user.id,
        content_type=body.content_type,
        content_id=body.content_id,
        base_url=WEB_URL,
        selected_lyrics_lines=body.selected_lyrics_lines,
    )
    return success_resp(data=data, message="Share link generated")


@router.get("/{share_token}")
async def resolve_share(share_token: str, request: Request):
    data = await share_svc.get_share_by_token(share_token)
    if data is None:
        return success_resp(data={}, message="Share link not found or expired")
    return success_resp(data=data, message="Share link resolved")
