"""Home route: aggregated data for the home screen."""
import asyncio
from fastapi import APIRouter, Depends, Request
from helpers import success_resp, rate_limit, get_current_user_optional
from schemas import Envelope, HomeFeed, RATE_LIMITED
from services import analytics as analytics_svc
from services import recommendations as rec_svc
from services import mood as mood_svc

router = APIRouter(tags=["home"])


@router.get(
    "/home",
    response_model=Envelope[HomeFeed],
    summary="Get home feed",
    description=(
        "Aggregated home-screen data: recent activity, top picks (recommendations), "
        "and current mood. If authenticated, returns personalised results; otherwise "
        "returns empty lists with a neutral mood. Rate-limited to 30 req/60 s."
    ),
    responses={**RATE_LIMITED},
)
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

    seen_songs: set[str] = set()
    deduped: list = []
    for item in recent["items"]:
        sid = item.get("song_id")
        if sid and sid in seen_songs:
            continue
        if sid:
            seen_songs.add(sid)
        deduped.append(item)
    recent["items"] = deduped
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
