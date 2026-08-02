"""Artist routes: list and get artists."""
from fastapi import APIRouter, Request
from helpers import success_resp, rate_limit, pagination_meta, cached_catalog_response
from schemas import Envelope, ArtistOut, RATE_LIMITED
from services import artists as artist_svc

router = APIRouter(tags=["artists"])


@router.get(
    "/artists",
    response_model=Envelope[list[ArtistOut]],
    summary="List artists",
    description="Return a paginated list of artists. Cached with ETag/Redis (60 s).",
    responses={**RATE_LIMITED},
)
async def list_artists(request: Request, limit: int = 20, offset: int = 0):
    rate_limit(request, max_requests=60, window=60)
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    items, total = await artist_svc.list_artists(limit, offset)
    body = success_resp(data=items, message="Artists retrieved", meta=pagination_meta(total, limit, offset))
    return await cached_catalog_response("catalog", f"artists?limit={limit}&offset={offset}", body, request)


@router.get(
    "/artists/{artist_id}",
    response_model=Envelope[ArtistOut],
    summary="Get artist",
    description="Return artist details including album IDs. Cached with ETag/Redis.",
    responses={**RATE_LIMITED},
)
async def get_artist(artist_id: str, request: Request):
    rate_limit(request, max_requests=60, window=60)
    data = await artist_svc.get_artist(artist_id)
    body = success_resp(data=data, message="Artist retrieved")
    return await cached_catalog_response("catalog", f"artists/{artist_id}", body, request)
