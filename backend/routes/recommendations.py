"""Recommendation routes: personalized song recommendations."""
from fastapi import APIRouter, Depends, Request
from helpers import success_resp, rate_limit, get_current_user
from schemas import Envelope, RecommendationResult, ModelStatusOut, UNAUTHORIZED, RATE_LIMITED
from services import recommendations as rec_svc

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get(
    "/user/top-picks",
    response_model=Envelope[RecommendationResult],
    summary="Get recommendations",
    description=(
        "Personalised song recommendations using ALS collaborative filtering "
        "with content-based fallback. Returns up to 50 items plus model status. "
        "Requires JWT."
    ),
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_top_picks(request: Request, limit: int = 20, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    base = str(request.base_url).rstrip("/")
    items = await rec_svc.get_recommendations(user.id, min(limit, 50), base)
    meta = await rec_svc.get_model_status()
    return success_resp(data={"items": items, "meta": meta}, message="Recommendations retrieved")


@router.get(
    "/user/model-status",
    response_model=Envelope[ModelStatusOut],
    summary="Model status",
    description="Return the current recommendation model status (trained, version, user/item counts). Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_model_status(request: Request, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    meta = await rec_svc.get_model_status()
    return success_resp(data=meta, message="Model status retrieved")
