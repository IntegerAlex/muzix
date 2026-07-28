"""
Muzix FastAPI backend.

Run locally:
    uv run python migrate.py
    uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import json
import os
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
from fastapi import Depends, FastAPI, HTTPException, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db import SessionLocal
from models import Song, Album, Artist, Playlist, User, ListeningEvent, UserSession, UserLike

load_dotenv()

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

CORS_ORIGINS = [
    o.strip() for o in (os.getenv("CORS_ORIGINS") or "http://localhost:8081,http://localhost:3000").split(",")
]

ASSETS_DIR = Path(__file__).parent / "assets"
AUDIO_DIR = ASSETS_DIR / "audio"
THUMB_DIR = ASSETS_DIR / "thumbnails"
INFO_DIR = ASSETS_DIR / "info"

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

app = FastAPI(title="Muzix API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if AUDIO_DIR.exists():
    app.mount("/assets/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")
if THUMB_DIR.exists():
    app.mount("/assets/thumbnails", StaticFiles(directory=str(THUMB_DIR)), name="thumbnails")


async def _get_session() -> AsyncSession:
    return SessionLocal()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class AuthRegister(BaseModel):
    email: str
    password: str
    displayName: str = ""


class AuthLogin(BaseModel):
    email: str
    password: str

@app.post("/auth/register")
async def register(body: AuthRegister, request: Request) -> dict:
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    async with SessionLocal() as session:
        existing = await session.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Email already registered")
        user = User(
            id=str(uuid.uuid4()),
            email=body.email,
            password_hash=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
            display_name=body.displayName,
        )
        session.add(user)
        await session.commit()
        token = jwt.encode({"sub": user.id, "exp": datetime.now(timezone.utc) + timedelta(days=7)}, JWT_SECRET)
        return {"token": token, "user": user.to_dict()}


@app.post("/auth/login")
async def login(body: AuthLogin, request: Request) -> dict:
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password required")
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.email == body.email))
        user = result.scalar_one_or_none()
        if not user or not bcrypt.checkpw(body.password.encode(), user.password_hash.encode()):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = jwt.encode({"sub": user.id, "exp": datetime.now(timezone.utc) + timedelta(days=7)}, JWT_SECRET)
        return {"token": token, "user": user.to_dict()}


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
# Likes
# ---------------------------------------------------------------------------

@app.post("/likes/{song_id}")
async def like_song(song_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        existing = await session.execute(
            select(UserLike).where(UserLike.user_id == user.id, UserLike.song_id == song_id)
        )
        if existing.scalar_one_or_none():
            return {"status": "already_liked"}
        like = UserLike(id=str(uuid.uuid4()), user_id=user.id, song_id=song_id)
        session.add(like)
        await session.commit()
    return {"status": "liked"}


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
# Playlists CRUD
# ---------------------------------------------------------------------------

class PlaylistCreate(BaseModel):
    title: str
    songIds: list[str] = []


@app.post("/playlists")
async def create_playlist(body: PlaylistCreate, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = Playlist(
            id=str(uuid.uuid4()),
            title=body.title,
            colors=["#6d28d9", "#db2777"],
            song_ids=body.songIds,
        )
        session.add(playlist)
        await session.commit()
    return serialize_playlist(playlist)


@app.put("/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, body: PlaylistCreate, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
        playlist.title = body.title
        playlist.song_ids = body.songIds
        await session.commit()
    return serialize_playlist(playlist)


@app.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
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
        if playlist.song_ids is None:
            playlist.song_ids = []
        if song_id not in playlist.song_ids:
            playlist.song_ids = playlist.song_ids + [song_id]
        await session.commit()
    return serialize_playlist(playlist)


@app.delete("/playlists/{playlist_id}/songs/{song_id}")
async def remove_song_from_playlist(playlist_id: str, song_id: str, user: User = Depends(_get_current_user)):
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail="Playlist not found")
        if playlist.song_ids and song_id in playlist.song_ids:
            playlist.song_ids = [s for s in playlist.song_ids if s != song_id]
        await session.commit()
    return serialize_playlist(playlist)


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

def serialize_song(song: Song) -> dict:
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
        "imageUrl": f"http://localhost:8000/thumbnails/{song.id}.jpg",
        "r2_object_key": song.r2_object_key,
        "audioUrl": None,
    }


def serialize_album(album: Album) -> dict:
    return {
        "id": album.id,
        "title": album.title,
        "artist": album.artist,
        "artistId": album.artist_id,
        "year": album.year,
        "genre": album.genre,
        "colors": album.colors or [],
        "imageUrl": f"http://localhost:8000/thumbnails/{album.id}.jpg",
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
# List endpoints (paginated)
# ---------------------------------------------------------------------------

@app.get("/songs")
async def list_songs(request: Request, response: Response, limit: int = 100, offset: int = 0) -> list[dict]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Song).limit(max(1, min(limit, 500))).offset(max(0, offset))
        )
        songs = [serialize_song(s) for s in result.scalars().all()]
        return make_cached_response(songs, request, response)


@app.get("/songs/{song_id}")
async def get_song(song_id: str, request: Request, response: Response) -> dict:
    async with SessionLocal() as session:
        song = await session.get(Song, song_id)
        if song is None:
            raise HTTPException(status_code=404, detail="Song not found")
        data = serialize_song(song)
        return make_cached_response(data, request, response)


@app.get("/albums")
async def list_albums(request: Request, response: Response, limit: int = 100, offset: int = 0) -> list[dict]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Album).limit(max(1, min(limit, 500))).offset(max(0, offset))
        )
        albums = [serialize_album(a) for a in result.scalars().all()]
        return make_cached_response(albums, request, response)


@app.get("/albums/{album_id}")
async def get_album(album_id: str, request: Request, response: Response) -> dict:
    async with SessionLocal() as session:
        album = await session.get(Album, album_id)
        if album is None:
            raise HTTPException(status_code=404, detail="Album not found")
        data = serialize_album(album)
        return make_cached_response(data, request, response)


@app.get("/artists")
async def list_artists(request: Request, response: Response, limit: int = 100, offset: int = 0) -> list[dict]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Artist).limit(max(1, min(limit, 500))).offset(max(0, offset))
        )
        artists = [serialize_artist(a) for a in result.scalars().all()]
        return make_cached_response(artists, request, response)


@app.get("/artists/{artist_id}")
async def get_artist(artist_id: str, request: Request, response: Response) -> dict:
    async with SessionLocal() as session:
        artist = await session.get(Artist, artist_id)
        if artist is None:
            raise HTTPException(status_code=404, detail="Artist not found")
        data = serialize_artist(artist)
        return make_cached_response(data, request, response)


@app.get("/playlists")
async def list_playlists(request: Request, response: Response, limit: int = 100, offset: int = 0) -> list[dict]:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Playlist).limit(max(1, min(limit, 500))).offset(max(0, offset))
        )
        playlists = [serialize_playlist(p) for p in result.scalars().all()]
        return make_cached_response(playlists, request, response)


@app.get("/playlists/{playlist_id}")
async def get_playlist(playlist_id: str, request: Request, response: Response) -> dict:
    async with SessionLocal() as session:
        playlist = await session.get(Playlist, playlist_id)
        if playlist is None:
            raise HTTPException(status_code=404, detail="Playlist not found")
        data = serialize_playlist(playlist)
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
async def serve_thumbnail(filename: str):
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


# ---------------------------------------------------------------------------
# Telemetry / Analytics
# ---------------------------------------------------------------------------

class TelemetryEventIn(BaseModel):
    song_id: str
    session_id: str
    event_type: str = "play"
    started_at: str  # ISO timestamp
    ended_at: str | None = None
    duration_played_ms: int = 0
    song_duration_ms: int | None = None
    completion_percentage: int = 0
    source: str | None = None  # playlist, album, artist, search, radio, queue
    source_id: str | None = None
    position_in_queue: int | None = None
    device_type: str = "web"
    app_version: str | None = None


class SessionStartIn(BaseModel):
    session_id: str
    device_type: str = "web"
    app_version: str | None = None
    platform: str | None = None
    entry_source: str | None = None


class SessionEndIn(BaseModel):
    session_id: str
    exit_reason: str | None = None  # user_close, crash, background, timeout


async def _get_optional_user(authorization: str | None = Header(None)) -> User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
    async with SessionLocal() as session:
        return await session.get(User, payload.get("sub"))


@app.post("/telemetry/events")
async def record_telemetry_event(
    events: list[TelemetryEventIn],
    user: User | None = Depends(_get_optional_user),
):
    """Batch insert listening events. Auth optional."""
    if not user:
        return {"status": "ok", "skipped": True}
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
    user: User | None = Depends(_get_optional_user),
):
    if not user:
        return {"status": "ok", "skipped": True}
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
    user: User | None = Depends(_get_optional_user),
):
    if not user:
        return {"status": "ok", "skipped": True}
    async with SessionLocal() as session:
        result = await session.execute(
            select(UserSession).where(UserSession.id == data.session_id, UserSession.user_id == user.id)
        )
        sess = result.scalar_one_or_none()
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        sess.ended_at = datetime.utcnow()
        sess.exit_reason = data.exit_reason
        await session.commit()
    return {"status": "ok"}


# Analytics queries
@app.get("/analytics/user/top-songs")
async def get_user_top_songs(
    period: str = "month",  # day, week, month, year, all
    limit: int = 50,
    user: User = Depends(_get_current_user),
):
    async with SessionLocal() as session:
        # Calculate time window
        now = datetime.utcnow()
        if period == "day":
            since = now - timedelta(days=1)
        elif period == "week":
            since = now - timedelta(weeks=1)
        elif period == "month":
            since = now - timedelta(days=30)
        elif period == "year":
            since = now - timedelta(days=365)
        else:
            since = datetime(1970, 1, 1)
        
        # Get play counts per song
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
        
        # Get song details
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
    user: User = Depends(_get_current_user),
):
    async with SessionLocal() as session:
        now = datetime.utcnow()
        if period == "day":
            since = now - timedelta(days=1)
        elif period == "week":
            since = now - timedelta(weeks=1)
        elif period == "month":
            since = now - timedelta(days=30)
        elif period == "year":
            since = now - timedelta(days=365)
        else:
            since = datetime(1970, 1, 1)

        # Single combined query for all play aggregates
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

        # Unique artists (requires join)
        artists_result = await session.execute(
            select(func.count(func.distinct(Song.artist_id)))
            .select_from(ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id))
            .where(*base_filter)
        )
        unique_artists = artists_result.scalar() or 0

        # Sessions (broader filter — no event_type constraint)
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
    user: User = Depends(_get_current_user),
):
    async with SessionLocal() as session:
        stmt = select(ListeningEvent).where(
            ListeningEvent.user_id == user.id,
        ).order_by(ListeningEvent.started_at.desc()).limit(limit)
        
        result = await session.execute(stmt)
        events = result.scalars().all()
        
        # Get song details
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
