"""Album routes: list and get albums."""
from fastapi import APIRouter, Request
from helpers import success_resp, rate_limit, pagination_meta, make_cached_response
from services import albums as album_svc

router = APIRouter()


@router.get("/albums")
async def list_albums(request: Request, limit: int = 20, offset: int = 0):
    rate_limit(request, max_requests=60, window=60)
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    base = str(request.base_url).rstrip("/")
    items, total = await album_svc.list_albums(limit, offset, base)
    body = success_resp(data=items, message="Albums retrieved", meta=pagination_meta(total, limit, offset))
    return make_cached_response(body, request)


@router.get("/albums/{album_id}")
async def get_album(album_id: str, request: Request):
    rate_limit(request, max_requests=60, window=60)
    base = str(request.base_url).rstrip("/")
    data = await album_svc.get_album(album_id, base)
    body = success_resp(data=data, message="Album retrieved")
    return make_cached_response(body, request)
