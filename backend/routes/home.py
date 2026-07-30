"""Home route: aggregated data for the home screen."""
import asyncio
from fastapi import APIRouter, Depends, Request
from helpers import success_resp, rate_limit, get_current_user_optional
from services import analytics as analytics_svc
from services import recommendations as rec_svc
from services import mood as mood_svc

router = APIRouter()


@router.get("/home")
async def get_home(request: Request, user=Depends(get_current_user_optional)):
    rate_limit(request, max_requests=30, window=60)
    recent = {"items": []}
    picks: list = []
    mood = {"label": "Neutral", "color": "#6b7280"}
    if user:
        recent, picks, mood = await asyncio.gather(
            analytics_svc.get_recent_activity(user.id, 5),
            rec_svc.get_recommendations(user.id, 5),
            mood_svc.compute_mood(user.id),
        )
    return success_resp(
        data={
            "recentActivity": recent["items"],
            "topPicks": picks,
            "mood": mood,
        },
        message="Home data retrieved",
    )
