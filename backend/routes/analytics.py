"""Analytics routes: user listening stats and history."""
from fastapi import APIRouter, Depends, Request
from helpers import success_resp, rate_limit, get_current_user
from services import analytics as analytics_svc

router = APIRouter(prefix="/analytics")


@router.get("/user/top-songs")
async def get_user_top_songs(period: str = "month", limit: int = 50, request: Request = None, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_top_songs(user.id, period, limit)
    return success_resp(data=data, message="Top songs retrieved")


@router.get("/user/stats")
async def get_user_stats(period: str = "month", request: Request = None, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_stats(user.id, period)
    return success_resp(data=data, message="Stats retrieved")


@router.get("/user/recent-activity")
async def get_recent_activity(limit: int = 20, request: Request = None, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_recent_activity(user.id, min(limit, 100))
    return success_resp(data=data, message="Recent activity retrieved", meta={"limit": min(limit, 100)})
