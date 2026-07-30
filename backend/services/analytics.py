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


async def get_recent_activity(user_id: str, limit: int, base_url: str = "") -> dict:
    items = await event_repo.get_recent_activity(user_id, limit, base_url)
    return {"items": items}


async def get_skip_rate(user_id: str, period: str, limit: int) -> dict:
    items = await event_repo.get_skip_rate(user_id, period, limit)
    return {"period": period, "items": items}


async def get_completion_rate(user_id: str, period: str, limit: int) -> dict:
    items = await event_repo.get_completion_rate(user_id, period, limit)
    return {"period": period, "items": items}


async def get_discovery_metrics(user_id: str, period: str) -> dict:
    return await event_repo.get_discovery_metrics(user_id, period)


async def get_artist_affinity(user_id: str, period: str, limit: int) -> dict:
    items = await event_repo.get_artist_affinity(user_id, period, limit)
    return {"period": period, "items": items}


async def get_listening_patterns(user_id: str, period: str) -> dict:
    return await event_repo.get_listening_patterns(user_id, period)


async def get_trend_analysis(user_id: str, period: str) -> dict:
    return await event_repo.get_trend_analysis(user_id, period)


async def get_catalog_exploration(user_id: str, period: str) -> dict:
    return await event_repo.get_catalog_exploration(user_id, period)


async def get_queue_dropoff(user_id: str, period: str) -> dict:
    return await event_repo.get_queue_dropoff(user_id, period)


async def get_source_effectiveness(user_id: str, period: str) -> dict:
    return await event_repo.get_source_effectiveness(user_id, period)


async def get_binge_index(user_id: str, period: str) -> dict:
    return await event_repo.get_binge_index(user_id, period)
