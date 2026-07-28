"""
Muzix local sync script.

Reads ID3 tags from local MP3s, uploads them to a PRIVATE Cloudflare R2 bucket,
and writes metadata rows into the PostgreSQL `songs` table.

Usage:
    uv run python sync.py

This MVP syncs ONE hardcoded test file. Edit TEST_MP3 to point at your file.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from mutagen.mp3 import MP3
from mutagen.easyid3 import EasyID3
import boto3
from botocore.client import Config

from db import SessionLocal
from models import Song

load_dotenv()

# ---------------------------------------------------------------------------
# Config / env
# ---------------------------------------------------------------------------
TEST_MP3 = os.getenv("TEST_MP3", "/path/to/your/test-song.mp3")

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

S3_ENDPOINT = R2_PUBLIC_URL or f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"


def get_r2():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def extract_tags(path: str) -> dict:
    audio = MP3(path, ID3=EasyID3)
    duration_ms = int((audio.info.length or 0) * 1000)
    duration = _format_duration(audio.info.length or 0)
    return {
        "title": (audio.get("title") or [Path(path).stem])[0],
        "artist": (audio.get("artist") or ["Unknown Artist"])[0],
        "album": (audio.get("album") or ["Unknown Album"])[0],
        "duration": duration,
        "duration_ms": duration_ms,
    }


def _format_duration(seconds: float) -> str:
    total = int(seconds)
    m, s = divmod(total, 60)
    return f"{m:02d}:{s:02d}"


async def main() -> None:
    path = Path(TEST_MP3)
    if not path.exists():
        raise SystemExit(f"Test MP3 not found: {path}. Set TEST_MP3 env var or edit sync.py.")

    print(f"[1/4] Reading tags from {path.name} ...")
    tags = extract_tags(str(path))
    object_key = f"songs/{path.stem}.mp3"
    tags["r2_object_key"] = object_key
    print(f"      title={tags['title']!r} artist={tags['artist']!r} dur={tags['duration']}")

    print(f"[2/4] Uploading to R2 bucket '{R2_BUCKET}' as {object_key} ...")
    r2 = get_r2()
    r2.upload_file(
        str(path),
        R2_BUCKET,
        object_key,
        ExtraArgs={"ContentType": "audio/mpeg"},
    )

    print("[3/4] Inserting metadata into PostgreSQL ...")
    async with SessionLocal() as session:
        song = Song(
            title=tags["title"],
            artist=tags["artist"],
            album=tags["album"],
            duration=tags["duration"],
            duration_ms=tags["duration_ms"],
            r2_object_key=object_key,
        )
        session.add(song)
        await session.commit()
        await session.refresh(song)
        print(f"[4/4] Done. Inserted song id={song.id}")


if __name__ == "__main__":
    asyncio.run(main())
