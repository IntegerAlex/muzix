"""Telemetry routes: record events, manage sessions."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Literal

from helpers import success_resp, get_current_user
from schemas import Envelope, TelemetryRecorded, DurationRecorded, UNAUTHORIZED, RATE_LIMITED
from services import telemetry as tel_svc

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


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

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "song_id": "abc-123",
                    "session_id": "sess-456",
                    "event_type": "play",
                    "started_at": "2025-01-15T12:00:00Z",
                    "ended_at": None,
                    "duration_played_ms": 0,
                    "song_duration_ms": 240000,
                    "completion_percentage": 0,
                    "source": "home",
                    "source_id": None,
                    "position_in_queue": 0,
                    "device_type": "web",
                    "app_version": "1.0.0",
                }
            ]
        }
    )

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

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "session_id": "sess-456",
                    "device_type": "web",
                    "app_version": "1.0.0",
                    "platform": "browser",
                    "entry_source": "home",
                }
            ]
        }
    )

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("session_id must not be empty")
        return v[:128]


class SessionEndIn(BaseModel):
    session_id: str
    exit_reason: str | None = None

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"session_id": "sess-456", "exit_reason": "user_exit"}]
        }
    )

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("session_id must not be empty")
        return v[:128]


class DurationIn(BaseModel):
    song_id: str
    duration_ms: int

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"song_id": "abc-123", "duration_ms": 120000}]
        }
    )

    @field_validator("song_id")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be empty")
        return v[:128]


@router.post(
    "/events",
    response_model=Envelope[TelemetryRecorded],
    summary="Record telemetry events",
    description=(
        "Batch-record playback events (play, pause, complete, skip, seek). "
        "Maximum 50 events per request. Requires JWT."
    ),
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def record_telemetry_event(events: list[TelemetryEventIn], user=Depends(get_current_user)):
    if len(events) > 50:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Maximum 50 events per request")
    recorded = await tel_svc.record_events(user.id, [e.model_dump() for e in events])
    return success_resp(data={"recorded": recorded}, message="Events recorded")


@router.post(
    "/session/start",
    response_model=Envelope[dict],
    summary="Start listening session",
    description="Record the start of a listening session. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def start_session(data: SessionStartIn, user=Depends(get_current_user)):
    await tel_svc.start_session(user.id, data.model_dump())
    return success_resp(data={}, message="Session started")


@router.post(
    "/session/end",
    response_model=Envelope[dict],
    summary="End listening session",
    description="Record the end of a listening session. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def end_session(data: SessionEndIn, user=Depends(get_current_user)):
    await tel_svc.end_session(user.id, data.session_id, data.exit_reason)
    return success_resp(data={}, message="Session ended")


@router.post(
    "/duration",
    response_model=Envelope[DurationRecorded],
    summary="Record song duration",
    description="Record accumulated listening duration for a song. Requires JWT.",
    responses={**UNAUTHORIZED, **RATE_LIMITED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def record_duration(data: DurationIn, user=Depends(get_current_user)):
    await tel_svc.record_duration(user.id, data.song_id, data.duration_ms)
    return success_resp(data={"recorded_ms": data.duration_ms})
