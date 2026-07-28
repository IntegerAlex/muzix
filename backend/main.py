"""
Muzix FastAPI backend.

Run locally:
    uv run python migrate.py
    uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import json
import os
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.client import Config
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import SessionLocal
from models import Song, Album, Artist, Playlist

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
        raise Exception("304")

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
async def stream(song_id: str) -> dict:
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
