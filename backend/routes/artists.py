"""Artist routes: list and get artists."""
from fastapi import APIRouter, Request
from helpers import success_resp, rate_limit, pagination_meta, make_cached_response
from services import artists as artist_svc

router = APIRouter()


@router.get("/artists")
async def list_artists(request: Request, limit: int = 100, offset: int = 0):
    rate_limit(request, max_requests=60, window=60)
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    items, total = await artist_svc.list_artists(limit, offset)
    body = success_resp(data=items, message="Artists retrieved", meta=pagination_meta(total, limit, offset))
    return make_cached_response(body, request)


@router.get("/artists/{artist_id}")
async def get_artist(artist_id: str, request: Request):
    rate_limit(request, max_requests=60, window=60)
    data = await artist_svc.get_artist(artist_id)
    body = success_resp(data=data, message="Artist retrieved")
    return make_cached_response(body, request)
