"""Telemetry routes: record events, manage sessions."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from typing import Literal

from helpers import success_resp, get_current_user
from services import telemetry as tel_svc

router = APIRouter(prefix="/telemetry")


class TelemetryEventIn(BaseModel):
    song_id: str
    session_id: str
    event_type: Literal["play", "pause", "complete", "skip", "seek"] = "play"
    started_at: str
    ended_at: str | None = None
    duration_played_ms: int = 0
    song_duration_ms: int | None = None
    completion_percentage: int = 0
    source: str | None = None
    source_id: str | None = None
    position_in_queue: int | None = None
    device_type: str = "web"
    app_version: str | None = None

    @field_validator("song_id", "session_id")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v[:128]


class SessionStartIn(BaseModel):
    session_id: str
    device_type: str = "web"
    app_version: str | None = None
    platform: str | None = None
    entry_source: str | None = None

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("session_id must not be empty")
        return v[:128]


class SessionEndIn(BaseModel):
    session_id: str
    exit_reason: str | None = None

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("session_id must not be empty")
        return v[:128]


@router.post("/events")
async def record_telemetry_event(events: list[TelemetryEventIn], user=Depends(get_current_user)):
    recorded = await tel_svc.record_events(user.id, [e.model_dump() for e in events])
    return success_resp(data={"recorded": recorded}, message="Events recorded")


@router.post("/session/start")
async def start_session(data: SessionStartIn, user=Depends(get_current_user)):
    await tel_svc.start_session(user.id, data.model_dump())
    return success_resp(data={}, message="Session started")


@router.post("/session/end")
async def end_session(data: SessionEndIn, user=Depends(get_current_user)):
    await tel_svc.end_session(user.id, data.session_id, data.exit_reason)
    return success_resp(data={}, message="Session ended")
