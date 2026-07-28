"""
Seed the database with downloaded songs (yt-dlp assets).

Uploads audio + thumbnails to R2, then inserts songs/albums/artists into PostgreSQL.
Run:  uv run python seed.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.client import Config
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from models import Song, Album, Artist, Playlist, Base

load_dotenv()

ASSETS = Path(__file__).parent / "assets"
AUDIO_DIR = ASSETS / "audio"
THUMB_DIR = ASSETS / "thumbnails"
INFO_DIR = ASSETS / "info"

# R2 config
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

S3_ENDPOINT = R2_PUBLIC_URL or f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

r2 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)


def upload_to_r2(local_path: Path, key: str, content_type: str) -> str:
    """Upload a file to R2 and return the public URL."""
    print(f"  Upload: {key}")
    r2.upload_file(
        str(local_path),
        R2_BUCKET,
        key,
        ExtraArgs={"ContentType": content_type},
    )
    return f"{S3_ENDPOINT}/{R2_BUCKET}/{key}"


async def main():
    # Load info.json files
    info_files = sorted(INFO_DIR.glob("*.info.json"))
    if not info_files:
        print("No info.json files found in", INFO_DIR)
        sys.exit(1)

    print(f"Found {len(info_files)} songs")

    songs_data = []
    for info_file in info_files:
        data = json.loads(info_file.read_text())
        vid_id = data.get("id", info_file.stem.replace(".info", ""))

        # Upload audio
        audio_file = AUDIO_DIR / f"{vid_id}.mp3"
        thumb_file = THUMB_DIR / f"{vid_id}.jpg"

        audio_key = f"audio/{vid_id}.mp3"
        thumb_key = f"thumbnails/{vid_id}.jpg"

        if audio_file.exists():
            upload_to_r2(audio_file, audio_key, "audio/mpeg")
        else:
            print(f"  WARNING: No audio for {vid_id}")

        if thumb_file.exists():
            upload_to_r2(thumb_file, thumb_key, "image/jpeg")
        else:
            print(f"  WARNING: No thumbnail for {vid_id}")

        duration = int(data.get("duration", 0))
        title = data.get("title", "Unknown")
        artist = data.get("uploader", data.get("artist", "Unknown"))
        album = data.get("album", data.get("uploader", artist))

        songs_data.append({
            "id": vid_id,
            "title": title,
            "artist": artist,
            "artist_id": artist.lower().replace(" ", "-"),
            "album": album,
            "album_id": album.lower().replace(" ", "-"),
            "duration": f"{duration // 60}:{duration % 60:02d}",
            "duration_ms": duration * 1000,
            "colors": ["#6d28d9", "#db2777"],
        })

    # Insert into database using raw SQL (avoids asyncpg prepared statement caching issues)
    print("\nInserting into database...")
    from db import DATABASE_URL
    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0

    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS songs CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS albums CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS artists CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS playlists CASCADE"))

    # Fresh connection for create + inserts
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Insert artists
        for s in songs_data:
            await conn.execute(
                text("INSERT INTO artists (id, name, colors, album_ids) VALUES (:id, :name, :colors, :album_ids) ON CONFLICT DO NOTHING"),
                {"id": s["artist_id"], "name": s["artist"], "colors": s["colors"], "album_ids": []},
            )

        # Build album song lists
        album_songs: dict[str, list[str]] = {}
        for s in songs_data:
            album_songs.setdefault(s["album_id"], []).append(s["id"])

        # Insert albums
        for aid, song_ids in album_songs.items():
            first = next(s for s in songs_data if s["album_id"] == aid)
            await conn.execute(
                text("INSERT INTO albums (id, title, artist, artist_id, year, genre, colors, song_ids) VALUES (:id, :title, :artist, :artist_id, :year, :genre, :colors, :song_ids) ON CONFLICT DO NOTHING"),
                {"id": aid, "title": first["album"], "artist": first["artist"], "artist_id": first["artist_id"], "year": 2024, "genre": "Electronic", "colors": first["colors"], "song_ids": song_ids},
            )

        # Insert songs
        for s in songs_data:
            await conn.execute(
                text("INSERT INTO songs (id, title, artist, artist_id, album, album_id, duration, duration_ms, r2_object_key, colors) VALUES (:id, :title, :artist, :artist_id, :album, :album_id, :duration, :duration_ms, :r2_object_key, :colors) ON CONFLICT DO NOTHING"),
                {"id": s["id"], "title": s["title"], "artist": s["artist"], "artist_id": s["artist_id"], "album": s["album"], "album_id": s["album_id"], "duration": s["duration"], "duration_ms": s["duration_ms"], "r2_object_key": f"audio/{s['id']}.mp3", "colors": s["colors"]},
            )

        # Create playlist
        all_ids = [s["id"] for s in songs_data]
        await conn.execute(
            text("INSERT INTO playlists (id, title, colors, song_ids) VALUES (:id, :title, :colors, :song_ids) ON CONFLICT DO NOTHING"),
            {"id": "ncs-favorites", "title": "NCS Favorites", "colors": ["#1DB954", "#0b1020"], "song_ids": all_ids},
        )

    await engine.dispose()
    print(f"\nDone! Inserted {len(songs_data)} songs")
    print("Test: curl http://localhost:8000/songs | python3 -m json.tool | head -20")


if __name__ == "__main__":
    asyncio.run(main())
