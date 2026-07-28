"""
Muzix FastAPI backend.

Run locally:
    uv run python migrate.py
    uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import json
import os
import re
import uuid
import hashlib
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bcrypt
import boto3
import jwt
from botocore.client import Config
from dotenv import load_dotenv
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException, Header, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.types import ASGIApp, Receive, Scope, Send

from db import SessionLocal
from models import Song, Album, Artist, Playlist, User, ListeningEvent, UserSession, UserLike

load_dotenv()

# ---------------------------------------------------------------------------
# Security constants
# ---------------------------------------------------------------------------
ACCESS_TOKEN_EXPIRY_HOURS = 24
REFRESH_TOKEN_EXPIRY_DAYS = 30
MAX_STRING_FIELD = 512
MAX_PASSWORD_LEN = 128
MAX_EMAIL_LEN = 320
MAX_TITLE_LEN = 512
MAX_SONGS_PER_PLAYLIST = 500

# ---------------------------------------------------------------------------
# Rate limiting (per-IP, sliding window)
# ---------------------------------------------------------------------------
_rate_limit: dict[str, list[float]] = defaultdict(list)
_rate_limit_last_cleanup: float = 0.0


def _client_ip(request: Request) -> str:
    """Extract real client IP, respecting forwarded headers behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(key: str, max_requests: int = 10, window: int = 60):
    global _rate_limit_last_cleanup
    now = time.time()
    _rate_limit[key] = [t for t in _rate_limit[key] if now - t < window]
    if len(_rate_limit[key]) >= max_requests:
        raise HTTPException(status_code=429, detail="Too many requests")
    _rate_limit[key].append(now)
    if now - _rate_limit_last_cleanup > 60:
        _rate_limit_last_cleanup = now
        stale_keys = [k for k, v in _rate_limit.items() if not v or now - v[-1] > window * 2]
        for k in stale_keys:
            del _rate_limit[k]


def rate_limit(request: Request, max_requests: int = 30, window: int = 60):
    """Convenience wrapper that keys on client IP + request path."""
    ip = _client_ip(request)
    path = request.url.path
    check_rate_limit(f"{ip}:{path}", max_requests, window)


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

CORS_ORIGINS = [
    o.strip() for o in (os.getenv("CORS_ORIGINS") or "http://localhost:8081,http://localhost:3000").split(",")
]
CORS_ORIGIN_SET = set(CORS_ORIGINS)

ASSETS_DIR = Path(__file__).parent / "assets"
AUDIO_DIR = ASSETS_DIR / "audio"
THUMB_DIR = ASSETS_DIR / "thumbnails"
INFO_DIR = ASSETS_DIR / "info"


def _colors_from_title(title: str) -> list[str]:
    """Generate two deterministic colors from a title string."""
    import colorsys
    h = hashlib.md5(title.encode()).hexdigest()
    hue1 = int(h[:3], 16) % 360
    hue2 = (hue1 + 40 + int(h[3:6], 16) % 60) % 360
    r1, g1, b1 = colorsys.hls_to_rgb(hue1 / 360, 0.5, 0.65)
    r2, g2, b2 = colorsys.hls_to_rgb(hue2 / 360, 0.5, 0.65)
    return [
        f'#{int(r1*255):02x}{int(g1*255):02x}{int(b1*255):02x}',
        f'#{int(r2*255):02x}{int(g2*255):02x}{int(b2*255):02x}',
    ]


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
S3_ENDPOINT = R2_PUBLIC_URL or f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

r2 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)

# ---------------------------------------------------------------------------
# App + Security Middleware (single combined ASGI middleware to avoid
# BaseHTTPMiddleware stacking issues in Starlette)
# ---------------------------------------------------------------------------
app = FastAPI(title="Muzix API", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy": "default-src 'self'",
}


def _origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    return origin in CORS_ORIGIN_SET


class SecurityMiddleware:
    """Combined CORS + security headers middleware as raw ASGI."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        origin = request.headers.get("origin")

        # --- Handle CORS preflight ---
        if request.method == "OPTIONS":
            if not _origin_allowed(origin):
                response = Response(status_code=403, content="Origin not allowed")
                await response(scope, receive, send)
                return
            response = Response(status_code=204)
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.headers["Access-Control-Max-Age"] = "600"
            await response(scope, receive, send)
            return

        # --- Wrap send to inject security + CORS headers ---
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                try:
                    existing = message.get("headers", [])
                    raw_headers: list[tuple[bytes, bytes]] = list(existing)
                    # Remove server header
                    raw_headers = [(k, v) for k, v in raw_headers if k != b"server"]
                    # Add security headers
                    for k, v in _SECURITY_HEADERS.items():
                        raw_headers.append((k.lower().encode(), v.encode()))
                    # Add CORS headers
                    if _origin_allowed(origin):
                        raw_headers.append((b"access-control-allow-origin", origin.encode()))
                        raw_headers.append((b"access-control-allow-credentials", b"true"))
                        vary = b""
                        for k, v in raw_headers:
                            if k == b"vary":
                                vary = v
                                break
                        if b"Origin" not in vary:
                            new_vary = (vary + b", Origin").strip(b", ") if vary else b"Origin"
                            raw_headers = [(k, v) for k, v in raw_headers if k != b"vary"]
                            raw_headers.append((b"vary", new_vary))
                    message["headers"] = raw_headers
                except Exception:
                    pass
            await send(message)

        await self.app(scope, receive, send_wrapper)


app.add_middleware(SecurityMiddleware)


# ---------------------------------------------------------------------------
# Static files (only in development)
# ---------------------------------------------------------------------------
if AUDIO_DIR.exists():
    app.mount("/assets/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")
if THUMB_DIR.exists():
    app.mount("/assets/thumbnails", StaticFiles(directory=str(THUMB_DIR)), name="thumbnails")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Input validation helpers
# ---------------------------------------------------------------------------
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def _validate_email(email: str) -> str:
    """Validate and normalize email. Raises HTTPException on failure."""
    email = email.strip().lower()
    if len(email) > MAX_EMAIL_LEN:
        raise HTTPException(status_code=422, detail="Invalid email")
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Invalid email format")
    return email


def _validate_password(password: str) -> None:
    """Enforce password complexity. Raises HTTPException on failure."""
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    if len(password) > MAX_PASSWORD_LEN:
        raise HTTPException(status_code=422, detail="Password too long")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=422, detail="Password must contain an uppercase letter")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=422, detail="Password must contain a lowercase letter")
    if not re.search(r"[0-9]", password):
        raise HTTPException(status_code=422, detail="Password must contain a digit")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class AuthRegister(BaseModel):
    email: str
    password: str
    displayName: str = ""

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("displayName")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        return v[:128] if v else ""


class AuthLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


def _create_token(user_id: str, expiry_delta: timedelta) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + expiry_delta, "iat": datetime.now(timezone.utc)},
        JWT_SECRET,
        algorithm="HS256",
    )


def _create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRY_DAYS), "type": "refresh"},
        JWT_SECRET,
        algorithm="HS256",
    )


@app.post("/auth/register")
async def register(body: AuthRegister, request: Request) -> dict:
    check_rate_limit(f"register:{_client_ip(request)}", max_requests=5, window=300)
    email = _validate_email(body.email)
    _validate_password(body.password)

    async with SessionLocal() as session:
        existing = await session.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            return {"detail": "Registration successful"}
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            password_hash=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
            display_name=body.displayName,
        )
        session.add(user)
        await session.commit()
        token = _create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
        refresh = _create_refresh_token(user.id)
        return {"token": token, "refreshToken": refresh, "user": user.to_dict()}


@app.post("/auth/login")
async def login(body: AuthLogin, request: Request) -> dict:
    check_rate_limit(f"login:{_client_ip(request)}", max_requests=10, window=60)
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    email = body.email.strip().lower()
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user or not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = _create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
        refresh = _create_refresh_token(user.id)
        return {"token": token, "refreshToken": refresh, "user": user.to_dict()}


@app.post("/auth/refresh")
async def refresh_token(body: dict, request: Request) -> dict:
    """Exchange a refresh token for a new access token."""
    refresh = body.get("refreshToken")
    if not refresh:
        raise HTTPException(status_code=400, detail="Refresh token required")
    try:
        payload = jwt.decode(refresh, JWT_SECRET, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    async with SessionLocal() as session:
        user = await session.get(User, payload.get("sub"))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        token = _create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
        new_refresh = _create_refresh_token(user.id)
        return {"token": token, "refreshToken": new_refresh}


async def _get_current_user(authorization: str | None = Header(None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    async with SessionLocal() as session:
        user = await session.get(User, payload.get("sub"))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user


@app.get("/auth/me")
async def get_me(user: User = Depends(_get_current_user)) -> dict:
    return user.to_dict()


# ---------------------------------------------------------------------------
# Likes (race-condition-safe via DB unique constraint + atomic ops)
# ---------------------------------------------------------------------------

@app.post("/likes/{song_id}")
async def like_song(song_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        try:
            like = UserLike(id=str(uuid.uuid4()), user_id=user.id, song_id=song_id)
            session.add(like)
            await session.commit()
            return {"status": "liked"}
        except Exception:
            await session.rollback()
            return {"status": "already_liked"}


@app.delete("/likes/{song_id}")
async def unlike_song(song_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        result = await session.execute(
            select(UserLike).where(UserLike.user_id == user.id, UserLike.song_id == song_id)
        )
        like = result.scalar_one_or_none()
        if like:
            await session.delete(like)
            await session.commit()
    return {"status": "unliked"}


@app.get("/likes")
async def get_likes(user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        result = await session.execute(
            select(UserLike).where(UserLike.user_id == user.id)
        )
        likes = result.scalars().all()
    return {"songIds": [like.song_id for like in likes]}


# ---------------------------------------------------------------------------
# Playlists CRUD (with ownership enforcement)
# ---------------------------------------------------------------------------

class PlaylistCreate(BaseModel):
    title: str
    songIds: list[str] = []

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return v[:MAX_TITLE_LEN] if v else ""

    @field_validator("songIds")
    @classmethod
    def validate_song_ids(cls, v: list[str]) -> list[str]:
        if len(v) > MAX_SONGS_PER_PLAYLIST:
            raise ValueError(f"Playlist cannot exceed {MAX_SONGS_PER_PLAYLIST} songs")
        return v[:MAX_SONGS_PER_PLAYLIST]


async def _get_owned_playlist(playlist_id: str, user: User) -> Playlist:
    """Fetch playlist and verify ownership. Raises 404 on not-found or not-owned."""
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.owner_id and playlist.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")
        return playlist


@app.post("/playlists")
async def create_playlist(body: PlaylistCreate, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = Playlist(
            id=str(uuid.uuid4()),
            owner_id=user.id,
            title=body.title,
            colors=["#6d28d9", "#db2777"],
            song_ids=body.songIds,
        )
        session.add(playlist)
        await session.commit()
    return _serialize_playlist(playlist)


@app.get("/playlists")
async def list_playlists(
    request: Request,
    response: Response,
    user: User = Depends(_get_current_user),
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    rate_limit(request, max_requests=60, window=60)
    async with SessionLocal() as session:
        result = await session.execute(
            select(Playlist)
            .where(Playlist.owner_id == user.id)
            .limit(max(1, min(limit, 500)))
            .offset(max(0, offset))
        )
        playlists = [_serialize_playlist(p) for p in result.scalars().all()]
        return make_cached_response(playlists, request, response)


@app.get("/playlists/{playlist_id}")
async def get_playlist(playlist_id: str, request: Request, response: Response, user: User = Depends(_get_current_user)) -> dict:
    rate_limit(request, max_requests=60, window=60)
    playlist = await _get_owned_playlist(playlist_id, user)
    data = _serialize_playlist(playlist)
    return make_cached_response(data, request, response)


@app.put("/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, body: PlaylistCreate, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.owner_id and playlist.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")
        playlist.title = body.title
        playlist.song_ids = body.songIds
        await session.commit()
    return _serialize_playlist(playlist)


@app.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.owner_id and playlist.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")
        await session.delete(playlist)
        await session.commit()
    return {"status": "deleted"}


@app.post("/playlists/{playlist_id}/songs/{song_id}")
async def add_song_to_playlist(playlist_id: str, song_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.owner_id and playlist.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.song_ids is None:
            playlist.song_ids = []
        if song_id not in playlist.song_ids:
            playlist.song_ids = playlist.song_ids + [song_id]
        await session.commit()
    return _serialize_playlist(playlist)


@app.delete("/playlists/{playlist_id}/songs/{song_id}")
async def remove_song_from_playlist(playlist_id: str, song_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.owner_id and playlist.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.song_ids and song_id in playlist.song_ids:
            playlist.song_ids = [s for s in playlist.song_ids if s != song_id]
        await session.commit()
    return _serialize_playlist(playlist)


# ---------------------------------------------------------------------------
# Caching helpers
# ---------------------------------------------------------------------------

def compute_etag(data: dict | list) -> str:
    serialized = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode()).hexdigest()[:32]


def make_cached_response(data: dict | list, request: Request, response: Response) -> dict | list:
    etag = compute_etag(data)
    response.headers["ETag"] = f'"{etag}"'
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"

    if_none_match = request.headers.get("If-None-Match")
    if if_none_match and if_none_match.strip('"') == etag:
        raise HTTPException(
            status_code=304,
            headers={"ETag": f'"{etag}"', "Cache-Control": "public, max-age=60, stale-while-revalidate=300"},
        )

    return data


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def serialize_song(song: Song, base_url: str = "") -> dict:
    return {
        "id": str(song.id),
        "title": song.title,
        "artist": song.artist,
        "artistId": song.artist_id,
        "album": song.album,
        "albumId": song.album_id,
        "duration": song.duration,
        "durationMs": song.duration_ms,
        "track": song.track,
        "lyrics": song.lyrics,
        "colors": song.colors or [],
        "imageUrl": f"{base_url}/thumbnails/{song.id}.jpg",
        "r2_object_key": song.r2_object_key,
        "audioUrl": None,
    }


def serialize_album(album: Album, base_url: str = "") -> dict:
    return {
        "id": album.id,
        "title": album.title,
        "artist": album.artist,
        "artistId": album.artist_id,
        "year": album.year,
        "genre": album.genre,
        "colors": album.colors or [],
        "imageUrl": f"{base_url}/thumbnails/{album.id}.jpg",
        "songIds": album.song_ids or [],
    }


def serialize_artist(artist: Artist) -> dict:
    return {
        "id": artist.id,
        "name": artist.name,
        "colors": artist.colors or [],
        "albumIds": artist.album_ids or [],
    }


def _serialize_playlist(playlist: Playlist) -> dict:
    return {
        "id": playlist.id,
        "title": playlist.title,
        "colors": playlist.colors or [],
        "songIds": playlist.song_ids or [],
    }


# ---------------------------------------------------------------------------
# List endpoints (paginated, rate-limited)
# ---------------------------------------------------------------------------

@app.get("/songs")
async def list_songs(request: Request, response: Response, limit: int = 100, offset: int = 0) -> list[dict]:
    rate_limit(request, max_requests=60, window=60)
    async with SessionLocal() as session:
        result = await session.execute(
            select(Song).limit(max(1, min(limit, 500))).offset(max(0, offset))
        )
        base = str(request.base_url).rstrip("/")
        songs = [serialize_song(s, base) for s in result.scalars().all()]
        return make_cached_response(songs, request, response)


@app.get("/songs/{song_id}")
async def get_song(song_id: str, request: Request, response: Response) -> dict:
    rate_limit(request, max_requests=60, window=60)
    async with SessionLocal() as session:
        song = await session.get(Song, song_id)
        if song is None:
            raise HTTPException(status_code=404, detail="Song not found")
        data = serialize_song(song, str(request.base_url).rstrip("/"))
        return make_cached_response(data, request, response)


@app.get("/albums")
async def list_albums(request: Request, response: Response, limit: int = 100, offset: int = 0) -> list[dict]:
    rate_limit(request, max_requests=60, window=60)
    async with SessionLocal() as session:
        result = await session.execute(
            select(Album).limit(max(1, min(limit, 500))).offset(max(0, offset))
        )
        base = str(request.base_url).rstrip("/")
        albums = [serialize_album(a, base) for a in result.scalars().all()]
        return make_cached_response(albums, request, response)


@app.get("/albums/{album_id}")
async def get_album(album_id: str, request: Request, response: Response) -> dict:
    rate_limit(request, max_requests=60, window=60)
    async with SessionLocal() as session:
        album = await session.get(Album, album_id)
        if album is None:
            raise HTTPException(status_code=404, detail="Album not found")
        data = serialize_album(album, str(request.base_url).rstrip("/"))
        return make_cached_response(data, request, response)


@app.get("/artists")
async def list_artists(request: Request, response: Response, limit: int = 100, offset: int = 0) -> list[dict]:
    rate_limit(request, max_requests=60, window=60)
    async with SessionLocal() as session:
        result = await session.execute(
            select(Artist).limit(max(1, min(limit, 500))).offset(max(0, offset))
        )
        artists = [serialize_artist(a) for a in result.scalars().all()]
        return make_cached_response(artists, request, response)


@app.get("/artists/{artist_id}")
async def get_artist(artist_id: str, request: Request, response: Response) -> dict:
    rate_limit(request, max_requests=60, window=60)
    async with SessionLocal() as session:
        artist = await session.get(Artist, artist_id)
        if artist is None:
            raise HTTPException(status_code=404, detail="Artist not found")
        data = serialize_artist(artist)
        return make_cached_response(data, request, response)


@app.get("/stream/{song_id}")
async def stream(song_id: str, user: User = Depends(_get_current_user)) -> dict:
    """Return a 1-hour presigned URL for the song's private R2 object."""
    async with SessionLocal() as session:
        song = await session.get(Song, song_id)
        if song is None:
            raise HTTPException(status_code=404, detail="Song not found")

        key = song.r2_object_key
        if not key:
            raise HTTPException(status_code=404, detail="Song has no R2 object key")

        try:
            url = r2.generate_presigned_url(
                "get_object",
                Params={"Bucket": R2_BUCKET, "Key": key},
                ExpiresIn=3600,
            )
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to generate stream URL")

        return {
            "id": str(song.id),
            "title": song.title,
            "artist": song.artist,
            "url": url,
            "expires_in": 3600,
        }


@app.get("/thumbnails/{filename}")
async def serve_thumbnail(filename: str, request: Request):
    rate_limit(request, max_requests=120, window=60)
    key = f"thumbnails/{filename}"
    try:
        obj = r2.get_object(Bucket=R2_BUCKET, Key=key)
        content = obj["Body"].read()
        ct = obj.get("ContentType", "image/jpeg")
        content_length = len(content)
        return Response(
            content=content,
            media_type=ct,
            headers={
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
                "Content-Length": str(content_length),
            },
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Thumbnail not found")


@app.get("/search")
async def search(request: Request, q: str = Query(default="", max_length=200)) -> dict:
    """Full-text search across songs, albums, and artists."""
    rate_limit(request, max_requests=30, window=60)
    base = str(request.base_url).rstrip("/")
    async with SessionLocal() as session:
        if q.strip():
            tsquery = func.plainto_tsquery("english", q)
            songs = (
                await session.execute(select(Song).where(Song.fts.op("@@")(tsquery)).limit(50))
            ).scalars().all()
            albums = (
                await session.execute(select(Album).where(Album.fts.op("@@")(tsquery)).limit(50))
            ).scalars().all()
            artists = (
                await session.execute(select(Artist).where(Artist.name.ilike(f"%{q}%")).limit(50))
            ).scalars().all()
        else:
            songs = (await session.execute(select(Song).limit(50))).scalars().all()
            albums = (await session.execute(select(Album).limit(50))).scalars().all()
            artists = (await session.execute(select(Artist).limit(50))).scalars().all()
        return {
            "songs": [serialize_song(s, base) for s in songs],
            "albums": [serialize_album(a, base) for a in albums],
            "artists": [serialize_artist(a) for a in artists],
        }


# ---------------------------------------------------------------------------
# Local assets (downloaded via yt-dlp)
# ---------------------------------------------------------------------------

def _load_local_songs() -> list[dict]:
    """Read info.json files and return serialized song list with local URLs."""
    if not INFO_DIR.exists():
        return []
    songs = []
    for info_file in sorted(INFO_DIR.glob("*.info.json")):
        try:
            data = json.loads(info_file.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        vid_id = data.get("id", info_file.stem.replace(".info", ""))
        title = data.get("title", "Unknown")
        artist = data.get("uploader", data.get("artist", "Unknown"))
        duration = int(data.get("duration", 0))
        thumbnail = data.get("thumbnail", "")

        # Parse chapters for album info or use uploader as album
        album = data.get("album", data.get("uploader", artist))
        description = data.get("description", "")

        songs.append({
            "id": vid_id,
            "title": title,
            "artist": artist,
            "artistId": artist.lower().replace(" ", "-"),
            "album": album,
            "albumId": album.lower().replace(" ", "-"),
            "duration": f"{duration // 60}:{duration % 60:02d}",
            "durationMs": duration * 1000,
            "track": None,
            "lyrics": None,
            "colors": _colors_from_title(title),
            "r2_object_key": None,
            "audioUrl": f"http://localhost:8000/assets/audio/{vid_id}.mp3",
            "thumbnailUrl": f"http://localhost:8000/assets/thumbnails/{vid_id}.jpg",
        })
    return songs


def _build_local_albums(songs: list[dict]) -> list[dict]:
    """Group songs into albums by artist."""
    album_map: dict[str, dict] = {}
    for s in songs:
        aid = s["albumId"]
        if aid not in album_map:
            album_map[aid] = {
                "id": aid,
                "title": s["album"],
                "artist": s["artist"],
                "artistId": s["artistId"],
                "year": 2024,
                "genre": "Electronic",
                "colors": _colors_from_title(s["album"]),
                "songIds": [],
            }
        album_map[aid]["songIds"].append(s["id"])
    return list(album_map.values())


def _build_local_artists(songs: list[dict]) -> list[dict]:
    """Group songs into artists."""
    artist_map: dict[str, dict] = {}
    for s in songs:
        aid = s["artistId"]
        if aid not in artist_map:
            artist_map[aid] = {
                "id": aid,
                "name": s["artist"],
                "colors": _colors_from_title(s["artist"]),
                "albumIds": [],
            }
        album_id = s["albumId"]
        if album_id not in artist_map[aid]["albumIds"]:
            artist_map[aid]["albumIds"].append(album_id)
    return list(artist_map.values())


@app.get("/local/songs")
async def local_songs(request: Request) -> list[dict]:
    rate_limit(request, max_requests=30, window=60)
    return _load_local_songs()


@app.get("/local/albums")
async def local_albums(request: Request) -> list[dict]:
    rate_limit(request, max_requests=30, window=60)
    songs = _load_local_songs()
    return _build_local_albums(songs)


@app.get("/local/artists")
async def local_artists(request: Request) -> list[dict]:
    rate_limit(request, max_requests=30, window=60)
    songs = _load_local_songs()
    return _build_local_artists(songs)


@app.get("/local/search")
async def local_search(request: Request, q: str = "") -> dict:
    rate_limit(request, max_requests=30, window=60)
    songs = _load_local_songs()
    if q.strip():
        ql = q.lower()
        songs = [s for s in songs if ql in s["title"].lower() or ql in s["artist"].lower()]
    albums = _build_local_albums(songs)
    artists = _build_local_artists(songs)
    return {"songs": songs, "albums": albums, "artists": artists}


# ---------------------------------------------------------------------------
# Telemetry / Analytics (auth required)
# ---------------------------------------------------------------------------

class TelemetryEventIn(BaseModel):
    song_id: str
    session_id: str
    event_type: Literal["play", "pause", "complete", "skip", "seek"] = "play"
    started_at: str  # ISO timestamp
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


@app.post("/telemetry/events")
async def record_telemetry_event(
    events: list[TelemetryEventIn],
    user: User = Depends(_get_current_user),
):
    """Batch insert listening events. Auth required."""
    if len(events) > 100:
        raise HTTPException(status_code=400, detail="Batch size limited to 100 events")
    async with SessionLocal() as session:
        for e in events:
            event = ListeningEvent(
                id=str(uuid.uuid4()),
                user_id=user.id,
                song_id=e.song_id,
                session_id=e.session_id,
                event_type=e.event_type,
                started_at=datetime.fromisoformat(e.started_at.replace("Z", "+00:00")),
                ended_at=datetime.fromisoformat(e.ended_at.replace("Z", "+00:00")) if e.ended_at else None,
                duration_played_ms=e.duration_played_ms,
                song_duration_ms=e.song_duration_ms,
                completion_percentage=e.completion_percentage,
                source=e.source,
                source_id=e.source_id,
                position_in_queue=e.position_in_queue,
                device_type=e.device_type,
                app_version=e.app_version,
            )
            session.add(event)
        await session.commit()
    return {"status": "ok", "recorded": len(events)}


@app.post("/telemetry/session/start")
async def start_session(
    data: SessionStartIn,
    user: User = Depends(_get_current_user),
):
    async with SessionLocal() as session:
        sess = UserSession(
            id=data.session_id,
            user_id=user.id,
            device_type=data.device_type,
            app_version=data.app_version,
            platform=data.platform,
            entry_source=data.entry_source,
        )
        session.add(sess)
        await session.commit()
    return {"status": "ok"}


@app.post("/telemetry/session/end")
async def end_session(
    data: SessionEndIn,
    user: User = Depends(_get_current_user),
):
    async with SessionLocal() as session:
        result = await session.execute(
            select(UserSession).where(UserSession.id == data.session_id, UserSession.user_id == user.id)
        )
        sess = result.scalar_one_or_none()
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        sess.ended_at = datetime.now(timezone.utc)
        sess.exit_reason = data.exit_reason
        await session.commit()
    return {"status": "ok"}


# Analytics queries
@app.get("/analytics/user/top-songs")
async def get_user_top_songs(
    period: str = "month",
    limit: int = 50,
    request: Request = None,
    user: User = Depends(_get_current_user),
):
    rate_limit(request, max_requests=30, window=60)
    async with SessionLocal() as session:
        now = datetime.now(timezone.utc)
        if period == "day":
            since = now - timedelta(days=1)
        elif period == "week":
            since = now - timedelta(weeks=1)
        elif period == "month":
            since = now - timedelta(days=30)
        elif period == "year":
            since = now - timedelta(days=365)
        else:
            since = datetime(1970, 1, 1, tzinfo=timezone.utc)

        stmt = select(
            ListeningEvent.song_id,
            func.count(ListeningEvent.id).label("play_count"),
            func.sum(ListeningEvent.duration_played_ms).label("total_ms"),
            func.count(func.distinct(ListeningEvent.session_id)).label("sessions"),
        ).where(
            ListeningEvent.user_id == user.id,
            ListeningEvent.event_type == "play",
            ListeningEvent.started_at >= since,
        ).group_by(ListeningEvent.song_id).order_by(func.count(ListeningEvent.id).desc()).limit(limit)

        result = await session.execute(stmt)
        rows = result.all()

        song_ids = [r.song_id for r in rows if r.song_id]
        songs_map = {}
        if song_ids:
            song_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
            for s in song_result.scalars().all():
                songs_map[s.id] = {
                    "id": s.id,
                    "title": s.title,
                    "artist": s.artist,
                    "album": s.album,
                    "duration_ms": s.duration_ms,
                    "colors": s.colors,
                }

        return {
            "period": period,
            "items": [
                {
                    "song": songs_map.get(r.song_id, {"id": r.song_id, "title": "Unknown"}),
                    "play_count": r.play_count,
                    "total_listening_ms": r.total_ms,
                    "sessions": r.sessions,
                }
                for r in rows if r.song_id
            ],
        }


@app.get("/analytics/user/stats")
async def get_user_stats(
    period: str = "month",
    request: Request = None,
    user: User = Depends(_get_current_user),
):
    rate_limit(request, max_requests=30, window=60)
    async with SessionLocal() as session:
        now = datetime.now(timezone.utc)
        if period == "day":
            since = now - timedelta(days=1)
        elif period == "week":
            since = now - timedelta(weeks=1)
        elif period == "month":
            since = now - timedelta(days=30)
        elif period == "year":
            since = now - timedelta(days=365)
        else:
            since = datetime(1970, 1, 1, tzinfo=timezone.utc)

        base_filter = (
            ListeningEvent.user_id == user.id,
            ListeningEvent.event_type == "play",
            ListeningEvent.started_at >= since,
        )
        stats_result = await session.execute(
            select(
                func.coalesce(func.sum(ListeningEvent.duration_played_ms), 0).label("total_ms"),
                func.count(func.distinct(ListeningEvent.song_id)).label("unique_songs"),
                func.count(ListeningEvent.id).label("total_plays"),
            ).where(*base_filter)
        )
        stats = stats_result.one()

        artists_result = await session.execute(
            select(func.count(func.distinct(Song.artist_id)))
            .select_from(ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id))
            .where(*base_filter)
        )
        unique_artists = artists_result.scalar() or 0

        sessions_result = await session.execute(
            select(func.count(func.distinct(ListeningEvent.session_id))).where(
                ListeningEvent.user_id == user.id,
                ListeningEvent.started_at >= since,
            )
        )
        sessions = sessions_result.scalar() or 0

        total_ms = int(stats.total_ms)

        return {
            "period": period,
            "total_listening_ms": total_ms,
            "total_listening_hours": round(total_ms / 3600000, 1),
            "total_plays": stats.total_plays,
            "unique_songs": stats.unique_songs,
            "unique_artists": unique_artists,
            "sessions": sessions,
            "avg_session_ms": round(total_ms / sessions, 1) if sessions > 0 else 0,
        }


@app.get("/analytics/user/recent-activity")
async def get_recent_activity(
    limit: int = 20,
    request: Request = None,
    user: User = Depends(_get_current_user),
):
    rate_limit(request, max_requests=30, window=60)
    async with SessionLocal() as session:
        stmt = select(ListeningEvent).where(
            ListeningEvent.user_id == user.id,
        ).order_by(ListeningEvent.started_at.desc()).limit(min(limit, 100))

        result = await session.execute(stmt)
        events = result.scalars().all()

        song_ids = list(set(e.song_id for e in events if e.song_id))
        songs_map = {}
        if song_ids:
            song_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
            for s in song_result.scalars().all():
                songs_map[s.id] = {
                    "id": s.id,
                    "title": s.title,
                    "artist": s.artist,
                    "album": s.album,
                    "colors": s.colors,
                }

        return {
            "items": [
                {
                    "id": e.id,
                    "song_id": e.song_id,
                    "song": songs_map.get(e.song_id),
                    "event_type": e.event_type,
                    "started_at": e.started_at.isoformat(),
                    "duration_played_ms": e.duration_played_ms,
                    "completion_percentage": e.completion_percentage,
                    "source": e.source,
                }
                for e in events
            ],
        }
