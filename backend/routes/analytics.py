"""Analytics routes: user listening stats and history."""
from fastapi import APIRouter, Depends, Query, Request
from helpers import success_resp, rate_limit, make_cached_response, get_current_user
from schemas import (
    Envelope,
    AnalyticsTopSongs,
    AnalyticsStats,
    AnalyticsRecentActivity,
    AnalyticsSkipRate,
    AnalyticsCompletionRate,
    AnalyticsDiscovery,
    AnalyticsArtistAffinity,
    AnalyticsListeningPatterns,
    AnalyticsTrends,
    AnalyticsCatalogExploration,
    AnalyticsQueueDropoff,
    AnalyticsSourceEffectiveness,
    AnalyticsBingeIndex,
    UNAUTHORIZED,
    RATE_LIMITED,
)
from services import analytics as analytics_svc

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get(
    "/user/top-songs",
    response_model=Envelope[AnalyticsTopSongs],
    summary="Top songs",
    description="Return the user's most-played songs for a given period. Cached with ETag. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_top_songs(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_top_songs(user.id, period, limit)
    body = success_resp(data=data, message="Top songs retrieved")
    return make_cached_response(body, request)


@router.get(
    "/user/stats",
    response_model=Envelope[AnalyticsStats],
    summary="Listening stats",
    description="Return aggregate listening statistics (total hours, plays, unique songs/artists, sessions). Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_stats(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_stats(user.id, period)
    return success_resp(data=data, message="Stats retrieved")


@router.get(
    "/user/recent-activity",
    response_model=Envelope[AnalyticsRecentActivity],
    summary="Recent activity",
    description="Return the user's recent listening activity (with song metadata). Cached with ETag. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_recent_activity(request: Request, limit: int = 20, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    base = str(request.base_url).rstrip("/")
    data = await analytics_svc.get_recent_activity(user.id, min(limit, 100), base)
    body = success_resp(data=data, message="Recent activity retrieved", meta={"limit": min(limit, 100)})
    return make_cached_response(body, request)


@router.get(
    "/user/skip-rate",
    response_model=Envelope[AnalyticsSkipRate],
    summary="Skip rate per song",
    description="Return skip-rate metrics for the user's most-played songs. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_skip_rate(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_skip_rate(user.id, period, limit)
    return success_resp(data=data, message="Skip rate retrieved")


@router.get(
    "/user/completion-rate",
    response_model=Envelope[AnalyticsCompletionRate],
    summary="Completion rate per song",
    description="Return completion-rate metrics for the user's most-played songs. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_completion_rate(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_completion_rate(user.id, period, limit)
    return success_resp(data=data, message="Completion rate retrieved")


@router.get(
    "/user/discovery",
    response_model=Envelope[AnalyticsDiscovery],
    summary="Discovery metrics",
    description="Return how many new artists, genres, and songs the user discovered in a period. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_discovery(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_discovery_metrics(user.id, period)
    return success_resp(data=data, message="Discovery metrics retrieved")


@router.get(
    "/user/artist-affinity",
    response_model=Envelope[AnalyticsArtistAffinity],
    summary="Artist affinity",
    description="Return per-artist affinity scores (play count, total listening time). Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_artist_affinity(request: Request, period: str = "month", limit: int = 50, user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_artist_affinity(user.id, period, limit)
    return success_resp(data=data, message="Artist affinity retrieved")


@router.get(
    "/user/listening-patterns",
    response_model=Envelope[AnalyticsListeningPatterns],
    summary="Listening patterns",
    description="Return hourly and day-of-week listening distributions. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_listening_patterns(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_listening_patterns(user.id, period)
    return success_resp(data=data, message="Listening patterns retrieved")


@router.get(
    "/user/trends",
    response_model=Envelope[AnalyticsTrends],
    summary="Trend analysis",
    description="Compare current and previous period stats with percentage changes. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_trends(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_trend_analysis(user.id, period)
    return success_resp(data=data, message="Trend analysis retrieved")


@router.get(
    "/user/catalog-exploration",
    response_model=Envelope[AnalyticsCatalogExploration],
    summary="Catalog exploration",
    description="Return what fraction of the total catalog the user has listened to. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_catalog_exploration(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_catalog_exploration(user.id, period)
    return success_resp(data=data, message="Catalog exploration retrieved")


@router.get(
    "/user/queue-dropoff",
    response_model=Envelope[AnalyticsQueueDropoff],
    summary="Queue drop-off",
    description="Return where users stop listening in their queue (by position). Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_queue_dropoff(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_queue_dropoff(user.id, period)
    return success_resp(data=data, message="Queue dropoff retrieved")


@router.get(
    "/user/source-effectiveness",
    response_model=Envelope[AnalyticsSourceEffectiveness],
    summary="Source effectiveness",
    description="Return how effective different play sources (home, search, etc.) are at driving engagement. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_source_effectiveness(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_source_effectiveness(user.id, period)
    return success_resp(data=data, message="Source effectiveness retrieved")


@router.get(
    "/user/binge-index",
    response_model=Envelope[AnalyticsBingeIndex],
    summary="Binge index",
    description="Return a 0–100 score indicating binge-listening tendency. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_user_binge_index(request: Request, period: str = "month", user=Depends(get_current_user)):
    rate_limit(request, max_requests=30, window=60)
    data = await analytics_svc.get_binge_index(user.id, period)
    return success_resp(data=data, message="Binge index retrieved")
