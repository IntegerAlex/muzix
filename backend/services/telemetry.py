"""Telemetry service: record listening events, manage sessions."""
import uuid
from fastapi import HTTPException
from models import UserSession
from repositories import listening_events as event_repo, sessions as session_repo


async def record_events(user_id: str, events: list[dict]) -> int:
    if len(events) > 100:
        raise HTTPException(status_code=400, detail="Batch size limited to 100 events")
    return await event_repo.record_events(user_id, events)


async def record_duration(user_id: str, song_id: str, delta_ms: int) -> None:
    if delta_ms <= 0:
        return
    await event_repo.upsert_duration(user_id, song_id, delta_ms)


async def start_session(user_id: str, data: dict) -> None:
    sess = UserSession(
        id=data["session_id"],
        user_id=user_id,
        device_type=data.get("device_type", "web"),
        app_version=data.get("app_version"),
        platform=data.get("platform"),
        entry_source=data.get("entry_source"),
    )
    await session_repo.create_session(sess)


async def end_session(user_id: str, session_id: str, exit_reason: str | None) -> None:
    ended = await session_repo.end_session(session_id, user_id, exit_reason)
    if not ended:
        raise HTTPException(status_code=404, detail="Session not found")
