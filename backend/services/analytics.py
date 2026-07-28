"""Analytics service: user listening statistics and history."""
from repositories import listening_events as event_repo


async def get_top_songs(user_id: str, period: str, limit: int) -> dict:
    items = await event_repo.get_top_songs(user_id, period, limit)
    return {"period": period, "items": items}


async def get_stats(user_id: str, period: str) -> dict:
    stats = await event_repo.get_stats(user_id, period)
    total_ms = stats["total_ms"]
    sessions = stats["sessions"]
    return {
        "period": period,
        "total_listening_ms": total_ms,
        "total_listening_hours": round(total_ms / 3600000, 1),
        "total_plays": stats["total_plays"],
        "unique_songs": stats["unique_songs"],
        "unique_artists": stats["unique_artists"],
        "sessions": sessions,
        "avg_session_ms": round(total_ms / sessions, 1) if sessions > 0 else 0,
    }


async def get_recent_activity(user_id: str, limit: int) -> dict:
    items = await event_repo.get_recent_activity(user_id, limit)
    return {"items": items}
