"""Shared helpers: response format, rate limiting, caching, validation, serialization, auth."""
from __future__ import annotations

import hashlib
import json
import re
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Literal

import jwt
from fastapi import Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from config import (
    ACCESS_TOKEN_EXPIRY_HOURS,
    JWT_ALGORITHM,
    REFRESH_TOKEN_EXPIRY_DAYS,
    JWT_SECRET,
    MAX_EMAIL_LEN,
    MAX_PASSWORD_LEN,
    MAX_TITLE_LEN,
    MAX_SONGS_PER_PLAYLIST,
)
from crypto import hash_password, verify_password
from db import SessionLocal
from models import Song, Album, Artist, Playlist, User

# ---------------------------------------------------------------------------
# Standard API response
# ---------------------------------------------------------------------------

def success_resp(data=None, message="Success", meta=None) -> dict:
    return {
        "status": "success",
        "data": data if data is not None else [],
        "message": message,
        "meta": meta or {},
    }


def pagination_meta(total: int, limit: int, offset: int) -> dict:
    page = (offset // limit) + 1 if limit > 0 else 1
    total_pages = max(1, (total + limit - 1) // limit) if limit > 0 else 1
    return {
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "page": page,
            "total_pages": total_pages,
            "next_page": offset + limit < total,
            "prev_page": offset > 0,
        }
    }


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

_rate_limit: dict[str, list[float]] = defaultdict(list)
_rate_limit_last_cleanup: float = 0.0


def _client_ip(request: Request) -> str:
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
        stale = [k for k, v in _rate_limit.items() if not v or (v and now - v[-1] > window)]
        for k in stale:
            del _rate_limit[k]


def rate_limit(request: Request, max_requests: int = 30, window: int = 60):
    ip = _client_ip(request)
    check_rate_limit(f"{ip}:{request.url.path}", max_requests, window)


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

def compute_etag(data: dict | list) -> str:
    serialized = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()[:32]


def make_cached_response(body: dict, request: Request) -> JSONResponse:
    if_none_match = request.headers.get("If-None-Match")
    if not if_none_match:
        etag = compute_etag(body.get("data"))
        return JSONResponse(content=body, headers={"ETag": f'"{etag}"', "Cache-Control": "public, max-age=60, stale-while-revalidate=300"})
    raw_data = body.get("data")
    etag = compute_etag(raw_data)
    cache_headers = {"ETag": f'"{etag}"', "Cache-Control": "public, max-age=60, stale-while-revalidate=300"}
    if if_none_match.strip('"') == etag:
        raise HTTPException(status_code=304, headers=cache_headers)
    return JSONResponse(content=body, headers=cache_headers)


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def validate_email(email: str) -> str:
    email = email.strip().lower()
    if len(email) > MAX_EMAIL_LEN or not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Invalid email format")
    return email


def validate_password(password: str) -> None:
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
# JWT helpers
# ---------------------------------------------------------------------------

def create_token(user_id: str, expiry_delta: timedelta) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + expiry_delta, "iat": datetime.now(timezone.utc)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def create_refresh_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRY_DAYS), "type": "refresh"},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


async def get_current_user(authorization: str | None = Header(None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    async with SessionLocal() as session:
        user = await session.get(User, payload.get("sub"))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        session.expunge(user)
        return user


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def serialize_song(song: Song, base_url: str = "", brief: bool = False) -> dict:
    result = {
        "id": str(song.id),
        "title": song.title,
        "artist": song.artist,
        "artistId": song.artist_id,
        "album": song.album,
        "albumId": song.album_id,
        "duration": song.duration,
        "durationMs": song.duration_ms,
        "track": song.track,
        "colors": song.colors or [],
        "imageUrl": f"{base_url}/thumbnails/{song.id}.jpg",
        "audioUrl": None,
    }
    if not brief:
        result["lyrics"] = song.lyrics
        result["r2_object_key"] = song.r2_object_key
    return result


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


def serialize_playlist(playlist: Playlist) -> dict:
    return {
        "id": playlist.id,
        "title": playlist.title,
        "colors": playlist.colors or [],
        "songIds": playlist.song_ids or [],
    }


# ---------------------------------------------------------------------------
# Color generation
# ---------------------------------------------------------------------------

def colors_from_title(title: str) -> list[str]:
    import colorsys
    h = hashlib.md5(title.encode()).hexdigest()
    hue1 = int(h[:3], 16) % 360
    hue2 = (hue1 + 40 + int(h[3:6], 16) % 60) % 360
    r1, g1, b1 = colorsys.hls_to_rgb(hue1 / 360, 0.5, 0.65)
    r2, g2, b2 = colorsys.hls_to_rgb(hue2 / 360, 0.5, 0.65)
    return [
        f"#{int(r1*255):02x}{int(g1*255):02x}{int(b1*255):02x}",
        f"#{int(r2*255):02x}{int(g2*255):02x}{int(b2*255):02x}",
    ]
