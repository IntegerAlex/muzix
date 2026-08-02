"""Share routes: generate share links and resolve share tokens."""
import os
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict

from helpers import success_resp, rate_limit_async, get_current_user
from schemas import Envelope, ShareCreated, ShareResolved, UNAUTHORIZED, RATE_LIMITED, NOT_FOUND, VALIDATION_ERROR
from services import share as share_svc

router = APIRouter(tags=["share"])

WEB_URL = os.getenv("WEB_URL", "https://muzix.gossorg.in")


class ShareGenerate(BaseModel):
    content_type: str
    content_id: str
    selected_lyrics_lines: list[int] | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "content_type": "song",
                    "content_id": "abc-123",
                    "selected_lyrics_lines": None,
                }
            ]
        }
    )


@router.post(
    "/generate",
    response_model=Envelope[ShareCreated],
    summary="Generate share link",
    description=(
        "Create a shareable link for a song, album, artist, playlist, or lyrics excerpt. "
        "Valid for 30 days. Rate-limited to 10 requests per minute. Requires JWT."
    ),
    responses={**UNAUTHORIZED, **RATE_LIMITED, **NOT_FOUND, **VALIDATION_ERROR},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def generate_share(body: ShareGenerate, request: Request, user=Depends(get_current_user)):
    await rate_limit_async(request, max_requests=10, window=60)
    data = await share_svc.create_share(
        user_id=user.id,
        content_type=body.content_type,
        content_id=body.content_id,
        base_url=WEB_URL,
        selected_lyrics_lines=body.selected_lyrics_lines,
    )
    return success_resp(data=data, message="Share link generated")


@router.get(
    "/{share_token}",
    response_model=Envelope[ShareResolved],
    summary="Resolve share link",
    description="Resolve a share token to its content metadata. Returns 404-style empty data if the token is invalid or expired.",
    responses={**RATE_LIMITED},
)
async def resolve_share(share_token: str, request: Request):
    data = await share_svc.get_share_by_token(share_token)
    if data is None:
        return success_resp(data={}, message="Share link not found or expired")
    return success_resp(data=data, message="Share link resolved")
