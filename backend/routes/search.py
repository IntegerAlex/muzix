"""Search route: full-text search."""
from fastapi import APIRouter, Query, Request
from helpers import success_resp, rate_limit, cached_catalog_response
from services import search as search_svc

router = APIRouter()


@router.get("/search")
async def search(request: Request, q: str = Query(default="", max_length=200)):
    rate_limit(request, max_requests=30, window=60)
    if not q.strip():
        return success_resp(data={"songs": [], "albums": [], "artists": []}, message="Search results")
    base = str(request.base_url).rstrip("/")
    data = await search_svc.search(q, base)
    body = success_resp(data=data, message="Search results")
    return await cached_catalog_response("catalog", f"search?q={q.lower().strip()}", body, request)
