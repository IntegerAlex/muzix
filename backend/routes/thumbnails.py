"""Thumbnail route: serve thumbnails from R2 as base64."""
from fastapi import APIRouter, Request
from helpers import success_resp, rate_limit
from services import thumbnails as thumb_svc

router = APIRouter()


@router.get("/thumbnails/{filename}")
async def serve_thumbnail(filename: str, request: Request):
    rate_limit(request, max_requests=120, window=60)
    data = await thumb_svc.get_thumbnail(filename)
    return success_resp(data=data, message="Thumbnail retrieved")
