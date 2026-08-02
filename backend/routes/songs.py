"""Song routes: list and get songs."""
from fastapi import APIRouter, Request
from helpers import success_resp, rate_limit, pagination_meta, cached_catalog_response
from services import songs as song_svc

router = APIRouter()


@router.get("/songs")
async def list_songs(request: Request, limit: int = 20, offset: int = 0):
    rate_limit(request, max_requests=60, window=60)
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    base = str(request.base_url).rstrip("/")
    items, total = await song_svc.list_songs(limit, offset, base)
    body = success_resp(data=items, message="Songs retrieved", meta=pagination_meta(total, limit, offset))
    return await cached_catalog_response("catalog", f"songs?limit={limit}&offset={offset}", body, request)


@router.get("/songs/{song_id}")
async def get_song(song_id: str, request: Request):
    rate_limit(request, max_requests=60, window=60)
    base = str(request.base_url).rstrip("/")
    data = await song_svc.get_song(song_id, base)
    body = success_resp(data=data, message="Song retrieved")
    return await cached_catalog_response("catalog", f"songs/{song_id}", body, request)
