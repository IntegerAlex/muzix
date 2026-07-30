"""Analytics routes: user listening stats and history."""
from fastapi import APIRouter, Depends, Query, Request
from helpers import success_resp, rate_limit, make_cached_response, get_current_user
from services import analytics as analytics_svc

router = APIRouter(prefix="/analytics")


@router.get("/user/top-songs")
async def get_user_top_songs(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_top_songs(user.id, period, limit)
    body = success_resp(data=data, message="Top songs retrieved")
    return make_cached_response(body, request)


@router.get("/user/stats")
async def get_user_stats(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_stats(user.id, period)
    return success_resp(data=data, message="Stats retrieved")


@router.get("/user/recent-activity")
async def get_recent_activity(request: Request, limit: int = 20, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_recent_activity(user.id, min(limit, 100))
    return success_resp(data=data, message="Recent activity retrieved", meta={"limit": min(limit, 100)})


@router.get("/user/skip-rate")
async def get_user_skip_rate(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_skip_rate(user.id, period, limit)
    return success_resp(data=data, message="Skip rate retrieved")


@router.get("/user/completion-rate")
async def get_user_completion_rate(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_completion_rate(user.id, period, limit)
    return success_resp(data=data, message="Completion rate retrieved")


@router.get("/user/discovery")
async def get_user_discovery(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_discovery_metrics(user.id, period)
    return success_resp(data=data, message="Discovery metrics retrieved")


@router.get("/user/artist-affinity")
async def get_user_artist_affinity(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_artist_affinity(user.id, period, limit)
    return success_resp(data=data, message="Artist affinity retrieved")


@router.get("/user/listening-patterns")
async def get_user_listening_patterns(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_listening_patterns(user.id, period)
    return success_resp(data=data, message="Listening patterns retrieved")


@router.get("/user/trends")
async def get_user_trends(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_trend_analysis(user.id, period)
    return success_resp(data=data, message="Trend analysis retrieved")


@router.get("/user/catalog-exploration")
async def get_user_catalog_exploration(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_catalog_exploration(user.id, period)
    return success_resp(data=data, message="Catalog exploration retrieved")


@router.get("/user/queue-dropoff")
async def get_user_queue_dropoff(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_queue_dropoff(user.id, period)
    return success_resp(data=data, message="Queue dropoff retrieved")


@router.get("/user/source-effectiveness")
async def get_user_source_effectiveness(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_source_effectiveness(user.id, period)
    return success_resp(data=data, message="Source effectiveness retrieved")


@router.get("/user/binge-index")
async def get_user_binge_index(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_binge_index(user.id, period)
    return success_resp(data=data, message="Binge index retrieved")
