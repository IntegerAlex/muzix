"""Recommendation routes: personalized song recommendations."""
from fastapi import APIRouter, Depends, Query, Request
from helpers import success_resp, rate_limit, get_current_user
from services import recommendations as rec_svc

router = APIRouter(prefix="/recommendations")


@router.get("/user/top-picks")
async def get_user_top_picks(request: Request, limit: int = 20, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    items = await rec_svc.get_recommendations(user.id, min(limit, 50))
    meta = await rec_svc.get_model_status()
    return success_resp(data=items, message="Recommendations retrieved", meta=meta)


@router.get("/user/model-status")
async def get_model_status(request: Request, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    meta = await rec_svc.get_model_status()
    return success_resp(data=meta, message="Model status retrieved")
