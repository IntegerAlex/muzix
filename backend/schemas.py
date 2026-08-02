"""OpenAPI schemas: typed response models, envelopes, and documented catch-alls."""
from __future__ import annotations

from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field


T = TypeVar("T")


# ── Envelope / Error ────────────────────────────────────────────────────────


class Envelope(BaseModel, Generic[T]):
    """Standard success envelope wrapping every API response."""

    status: Literal["success"] = "success"
    data: T
    message: str
    meta: dict[str, Any] = Field(
        default_factory=dict,
        description="Response metadata; paginated endpoints include a 'pagination' key",
    )


class ErrorEnvelope(BaseModel):
    """Error envelope produced by the global exception handler.

    - 304 → status=failed, message="Not Modified"
    - 4xx → status=failed,  message=<detail>
    - 5xx → status=exception, message=<detail>
    """

    model_config = ConfigDict(extra="ignore")

    status: Literal["failed", "exception"]
    data: list[Any] = Field(default_factory=list)
    message: str
    meta: dict[str, Any] = Field(default_factory=dict)


# ── Common error responses (merge into route ``responses=``) ────────────────

UNAUTHORIZED = {
    401: {
        "model": ErrorEnvelope,
        "description": "Missing, expired, or invalid JWT token",
        "content": {
            "application/json": {
                "example": {
                    "status": "failed",
                    "data": [],
                    "message": "Missing or invalid token",
                    "meta": {},
                }
            }
        },
    }
}

RATE_LIMITED = {
    429: {
        "model": ErrorEnvelope,
        "description": "Rate limit exceeded",
        "content": {
            "application/json": {
                "example": {
                    "status": "failed",
                    "data": [],
                    "message": "Too many requests",
                    "meta": {},
                }
            }
        },
    }
}

NOT_FOUND = {
    404: {
        "model": ErrorEnvelope,
        "description": "Resource not found",
        "content": {
            "application/json": {
                "example": {
                    "status": "failed",
                    "data": [],
                    "message": "Song not found",
                    "meta": {},
                }
            }
        },
    }
}

VALIDATION_ERROR = {
    422: {
        "model": ErrorEnvelope,
        "description": "Request validation error",
        "content": {
            "application/json": {
                "example": {
                    "status": "failed",
                    "data": [],
                    "message": "Invalid email format",
                    "meta": {},
                }
            }
        },
    }
}

CONFLICT = {
    409: {
        "model": ErrorEnvelope,
        "description": "Resource conflict (e.g. duplicate email)",
        "content": {
            "application/json": {
                "example": {
                    "status": "failed",
                    "data": [],
                    "message": "Email already registered",
                    "meta": {},
                }
            }
        },
    }
}


# ── Health ──────────────────────────────────────────────────────────────────


class HealthStatus(BaseModel):
    status: str = Field(default="ok", examples=["ok"])
    time: str = Field(description="ISO 8601 UTC timestamp", examples=["2025-01-15T12:00:00Z"])


# ── Auth / User ─────────────────────────────────────────────────────────────


class UserOut(BaseModel):
    id: str = Field(description="UUID")
    email: str = Field(examples=["user@example.com"])
    displayName: str = Field(examples=["John"])


class AuthResult(BaseModel):
    token: str = Field(description="JWT access token (2-hour expiry)")
    refreshToken: str = Field(description="Opaque refresh token (30-day expiry)")
    user: UserOut


# ── Songs ───────────────────────────────────────────────────────────────────


class SongBrief(BaseModel):
    """Song without lyrics/R2 key — used in lists, search, recommendations."""

    id: str
    title: str
    artist: str
    artistId: str
    album: str
    albumId: str
    genre: str
    duration: str = Field(description="Human-readable, e.g. '3:45'")
    durationMs: int
    track: int | None = None
    colors: list[str] = Field(description="Two hex gradient colours")
    imageUrl: str = Field(description="/thumbnails/{id}.jpg")
    audioUrl: None = Field(default=None, description="Always null; use GET /stream/{song_id}")


class SongOut(SongBrief):
    """Full song including lyrics and R2 storage key."""

    lyrics: str | None = None
    r2_object_key: str | None = None


# ── Albums ──────────────────────────────────────────────────────────────────


class AlbumOut(BaseModel):
    id: str
    title: str
    artist: str
    artistId: str
    year: int
    genre: str
    colors: list[str]
    imageUrl: str
    songIds: list[str]


# ── Artists ─────────────────────────────────────────────────────────────────


class ArtistOut(BaseModel):
    id: str
    name: str
    colors: list[str]
    albumIds: list[str]


# ── Playlists ───────────────────────────────────────────────────────────────


class PlaylistOut(BaseModel):
    id: str
    title: str
    colors: list[str]
    songIds: list[str]


# ── Likes ───────────────────────────────────────────────────────────────────


class LikesOut(BaseModel):
    songIds: list[str]


# ── Stream ──────────────────────────────────────────────────────────────────


class StreamOut(BaseModel):
    id: str
    title: str
    artist: str
    url: str = Field(description="Presigned R2 URL (3600 s TTL)")
    expires_in: int = Field(default=3600, description="URL TTL in seconds")


# ── Share ───────────────────────────────────────────────────────────────────


class ShareCreated(BaseModel):
    share_token: str
    share_url: str
    content_type: str
    content_id: str
    title: str
    artist: str = ""
    image_url: str = ""
    expires_at: str = Field(description="ISO 8601 timestamp")


class ShareResolved(BaseModel):
    share_token: str
    share_url: str
    content_type: str
    content_id: str
    title: str
    artist: str = ""
    image_url: str = ""
    lyrics: list[str] | None = None
    selected_lyrics_lines: list[int] | None = None
    created_at: str
    expires_at: str


# ── Recommendations / Model ────────────────────────────────────────────────


class ModelStatusOut(BaseModel):
    trained: bool
    last_trained_at: str | None = None
    version: str
    num_users: int
    num_items: int


class RecommendationItem(BaseModel):
    id: str
    title: str
    artist: str
    album: str
    duration_ms: int
    colors: list[str]
    imageUrl: str


class RecommendationResult(BaseModel):
    items: list[RecommendationItem]
    meta: ModelStatusOut


# ── Mood ────────────────────────────────────────────────────────────────────


class MoodOut(BaseModel):
    label: str = Field(description="E.g. Energetic, Calm, Neutral")
    color: str = Field(description="Hex colour")


# ── Search ──────────────────────────────────────────────────────────────────


class SearchResult(BaseModel):
    songs: list[SongBrief]
    albums: list[AlbumOut]
    artists: list[ArtistOut]


# ── Home Feed ───────────────────────────────────────────────────────────────


class HomeFeed(BaseModel):
    """Aggregated home-screen data. recentActivity and topPicks contain
    heterogeneous song/telemetry shapes — documented via descriptions."""

    recentActivity: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Recent plays: [{song_id, song: SongBrief, played_at, duration_played_ms, …}]",
    )
    topPicks: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Recommended songs: [{id, title, artist, album, duration_ms, colors, imageUrl}]",
    )
    mood: MoodOut


# ── Telemetry ───────────────────────────────────────────────────────────────


class TelemetryRecorded(BaseModel):
    recorded: int = Field(description="Number of events persisted")


class DurationRecorded(BaseModel):
    recorded_ms: int


# ── Analytics (heterogeneous — each model documents its own shape) ──────────


class AnalyticsTopSongs(BaseModel):
    period: str
    items: list[dict[str, Any]] = Field(
        default_factory=list,
        description="[{song_id, title, artist, play_count, total_ms, …}]",
    )


class AnalyticsStats(BaseModel):
    period: str
    total_listening_ms: int
    total_listening_hours: float
    total_plays: int
    unique_songs: int
    unique_artists: int
    sessions: int
    avg_session_ms: float


class AnalyticsRecentActivity(BaseModel):
    items: list[dict[str, Any]] = Field(
        default_factory=list,
        description="[{song_id, song: SongBrief, played_at, duration_played_ms, …}]",
    )


class AnalyticsSkipRate(BaseModel):
    period: str
    items: list[dict[str, Any]] = Field(
        default_factory=list,
        description="[{song_id, title, skips, plays, skip_rate, …}]",
    )


class AnalyticsCompletionRate(BaseModel):
    period: str
    items: list[dict[str, Any]] = Field(
        default_factory=list,
        description="[{song_id, title, completions, plays, completion_rate, …}]",
    )


class AnalyticsDiscovery(BaseModel):
    new_artists: int
    new_genres: int
    new_songs: int
    total_unique_artists: int
    total_unique_genres: int


class AnalyticsArtistAffinity(BaseModel):
    period: str
    items: list[dict[str, Any]] = Field(
        default_factory=list,
        description="[{artist_id, name, play_count, total_ms, …}]",
    )


class AnalyticsListeningPatterns(BaseModel):
    hourly: list[dict[str, Any]] = Field(description="[{hour, count, total_ms}]")
    daily: list[dict[str, Any]] = Field(description="[{day, count, total_ms}]")


class AnalyticsTrends(BaseModel):
    current: dict[str, Any]
    previous: dict[str, Any]
    changes: dict[str, Any]


class AnalyticsCatalogExploration(BaseModel):
    unique_songs_played: int
    total_songs: int
    exploration_ratio: float = Field(description="0.0–1.0")
    unique_artists_played: int
    total_artists: int


class AnalyticsQueueDropoff(BaseModel):
    period: str
    items: list[dict[str, Any]] = Field(description="[{position, count, dropoff_rate}]")


class AnalyticsSourceEffectiveness(BaseModel):
    period: str
    items: list[dict[str, Any]] = Field(
        default_factory=list,
        description="[{source, plays, avg_duration_ms, completion_rate, …}]",
    )


class AnalyticsBingeIndex(BaseModel):
    period: str
    binge_index: float = Field(description="0–100")
    avg_session_length_songs: float
    long_sessions_ratio: float
