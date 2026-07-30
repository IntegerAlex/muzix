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
    base = str(request.base_url).rstrip("/")
    if user:
        recent, picks, mood = await asyncio.gather(
            analytics_svc.get_recent_activity(user.id, 5, base),
            rec_svc.get_recommendations(user.id, 5, base),
            mood_svc.compute_mood(user.id),
        )

    def _add_thumbnail(song: dict | None) -> dict | None:
        if song and song.get("id") and not song.get("imageUrl"):
            return {**song, "imageUrl": f"{base}/thumbnails/{song['id']}.jpg"}
        return song

    recent["items"] = [
        {**item, "song": _add_thumbnail(item.get("song"))}
        for item in recent.get("items", [])
    ]
    picks = [
        {**pick, "imageUrl": f"{base}/thumbnails/{pick['id']}.jpg"}
        for pick in picks
        if pick.get("id")
    ]

    return success_resp(
        data={
            "recentActivity": recent["items"],
            "topPicks": picks,
            "mood": mood,
        },
        message="Home data retrieved",
    )
