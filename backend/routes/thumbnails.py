"""Thumbnail route: serve thumbnails from R2 as raw images."""
from fastapi import APIRouter, Request
from fastapi.responses import Response
from helpers import rate_limit
from services import thumbnails as thumb_svc

router = APIRouter(tags=["thumbnails"])


@router.get(
    "/thumbnails/{filename}",
    summary="Get thumbnail",
    description="Serve an album or song thumbnail from R2. Returns raw image bytes with Cache-Control: max-age=86400, immutable. Rate-limited to 120 req/60 s.",
)
async def serve_thumbnail(filename: str, request: Request):
    rate_limit(request, max_requests=120, window=60)
    content, content_type = await thumb_svc.get_thumbnail(filename)
    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400, immutable",
        },
    )
