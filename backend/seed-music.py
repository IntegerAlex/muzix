"""
seed-music.py — Match yt-dlp downloaded tracks to YouTube metadata,
fix R2 keys, fetch lyrics, insert into DB.

Run:  uv run python -u seed-music.py
      uv run python -u seed-music.py --fix-r2-only   # just fix R2 keys (copy+delete)
      uv run python -u seed-music.py --skip-upload   # only update DB + lyrics
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import aiohttp
import boto3
from botocore.client import Config
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from models import Base
from db import DATABASE_URL

load_dotenv()

ASSETS = Path(__file__).parent / "assets"
AUDIO_DIR = ASSETS / "info"
THUMB_DIR = ASSETS / "thumbnails"

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")
S3_ENDPOINT = R2_PUBLIC_URL or f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

LRCLIB_BASE = "https://lrclib.net/api"
USER_AGENT = "Muzix/1.0"
ARTIST_NAME = "The Weeknd"
ARTIST_ID = "the-weeknd"

WEEKND_PLAYLISTS = [
    ("Starboy", "https://youtube.com/playlist?list=PLK2zhq9oy0K4yxwMmBPsXQ3NvaQSxw6rY"),
    ("Beauty Behind The Madness", "https://youtube.com/playlist?list=PLK2zhq9oy0K77FKXvjTO9h4-LA68NnjcJ"),
    ("Dawn FM", "https://youtube.com/playlist?list=PLWGXKDxW301QZrzSl7hLzdYakFdayHC4l"),
    ("My Dear Melancholy", "https://youtube.com/playlist?list=PL_ZnCc_3LyhmmRtyCepS0L6T4JUc2wkrV"),
]

FILENAME_RE = re.compile(r"^(\d+)-(.*)\.webm$")
SUFFIX_RE = re.compile(r"\s*\(Official (Lyric ?Video|Audio|Music Video|Visualizer)\)\s*", re.I)
ARTIST_PREFIX_RE = re.compile(r"^" + re.escape(ARTIST_NAME) + r"\s*[-–—]\s*", re.I)
PUNCT_RE = re.compile(r"[^\w\s]")


def log(msg: str):
    print(msg, flush=True)


def clean_title(raw: str) -> str:
    t = SUFFIX_RE.sub("", raw)
    t = ARTIST_PREFIX_RE.sub("", t)
    return t.strip().lower()


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", PUNCT_RE.sub(" ", s)).strip().lower()


def title_match(file_title: str, entry_title: str) -> bool:
    a = normalize(clean_title(file_title))
    b = normalize(clean_title(entry_title))
    if a == b:
        return True
    if len(a) >= 4 and len(b) >= 4 and (a in b or b in a):
        return True
    return False


def _colors_from_title(title: str) -> list[str]:
    import colorsys, hashlib
    h = hashlib.md5(title.encode()).hexdigest()
    hue1 = int(h[:3], 16) % 360
    hue2 = (hue1 + 40 + int(h[3:6], 16) % 60) % 360
    r1, g1, b1 = colorsys.hls_to_rgb(hue1 / 360, 0.5, 0.65)
    r2, g2, b2 = colorsys.hls_to_rgb(hue2 / 360, 0.5, 0.65)
    return [
        f"#{int(r1*255):02x}{int(g1*255):02x}{int(b1*255):02x}",
        f"#{int(r2*255):02x}{int(g2*255):02x}{int(b2*255):02x}",
    ]


def get_r2_client():
    return boto3.client(
        "s3", endpoint_url=S3_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto", config=Config(signature_version="s3v4"),
    )


def fetch_playlist_entries() -> list[dict]:
    all_entries = []
    seen_ids = set()
    for album_name, url in WEEKND_PLAYLISTS:
        log(f"[yt-dlp] Fetching playlist: {album_name}")
        result = subprocess.run(
            ["yt-dlp", "--flat-playlist", "--dump-json", url],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            log(f"  ERROR: {result.stderr.strip()}")
            continue
        count = 0
        for line in result.stdout.strip().splitlines():
            if not line:
                continue
            data = json.loads(line)
            vid = data.get("id")
            if vid and vid not in seen_ids:
                seen_ids.add(vid)
                all_entries.append({
                    "id": vid,
                    "title": data.get("title", ""),
                    "playlist_index": data.get("playlist_index"),
                    "album": album_name,
                })
                count += 1
        log(f"  → {count} entries")
    return all_entries


def match_webm_files(entries: list[dict]) -> tuple[list[dict], list[Path]]:
    webm_files = sorted(AUDIO_DIR.glob("*.webm"))
    log(f"\n[files] Found {len(webm_files)} .webm files")

    matched = []
    unmatched = list(webm_files)

    for entry in entries:
        etitle = entry["title"]
        best = None
        for f in unmatched:
            m = FILENAME_RE.match(f.name)
            if not m:
                continue
            ftitle = m.group(2)
            if title_match(ftitle, etitle):
                best = f
                break

        if best:
            log(f"  ✓ #{entry['playlist_index']} '{etitle}' → {best.name}")
            matched.append({**entry, "file": best})
            unmatched.remove(best)
        else:
            log(f"  ✗ #{entry['playlist_index']} '{etitle}' → NO MATCH")
            matched.append({**entry, "file": None})

    if unmatched:
        log(f"\n[files] Unmatched ({len(unmatched)}):")
        for f in unmatched:
            log(f"  {f.name}")

    return matched, unmatched


def build_songs_data(matched: list[dict]) -> list[dict]:
    songs_data = []
    for entry in matched:
        af = entry["file"]
        if not af or not af.exists():
            continue
        duration_ms = get_duration_ms(af)
        songs_data.append({
            "id": entry["id"],
            "title": entry["title"],
            "artist": ARTIST_NAME,
            "artist_id": ARTIST_ID,
            "album": entry.get("album", "The Weeknd"),
            "album_id": entry.get("album", "").lower().replace(" ", "-"),
            "duration": f"{duration_ms // 60000}:{(duration_ms // 1000) % 60:02d}",
            "duration_ms": duration_ms,
            "colors": _colors_from_title(entry["title"]),
            "lyrics": None,
            "r2_object_key": f"audio/{entry['id']}.mp3",
            "track": entry["playlist_index"],
            "file": af,
        })
    return songs_data


def fix_r2_keys(songs_data: list[dict]):
    """Fix wrong R2 keys from previous bad run: copy existing audio to correct key, delete old."""
    r2 = get_r2_client()
    expected_keys = {s["r2_object_key"] for s in songs_data}
    existing_keys = set()

    log("\nListing existing R2 audio objects...")
    try:
        paginator = r2.get_paginator("list_objects_v2")
        pages = paginator.paginate(Bucket=R2_BUCKET, Prefix="audio/")
        for page in pages:
            for obj in page.get("Contents", []):
                existing_keys.add(obj["Key"])
    except Exception as e:
        log(f"  ERROR listing R2: {e}")
        return

    log(f"  Found {len(existing_keys)} existing, {len(expected_keys)} expected")

    stale = existing_keys - expected_keys
    if stale:
        log(f"\nDeleting {len(stale)} stale (non-Weeknd) R2 objects...")
        for key in sorted(stale):
            log(f"  DELETE {key}")
            r2.delete_object(Bucket=R2_BUCKET, Key=key)

    log(f"\nUploading {len(songs_data)} Weeknd audio files with correct content...")
    for s in songs_data:
        key = s["r2_object_key"]
        af = s["file"]
        log(f"  UPLOAD {key} ({af.name})")
        r2.upload_file(str(af), R2_BUCKET, key, ExtraArgs={"ContentType": "audio/webm"})

    log(f"\nR2 fix complete. Deleted {len(stale)}, uploaded {len(songs_data)}")


def download_thumbnail(vid: str) -> Path | None:
    dest = THUMB_DIR / f"{vid}.jpg"
    if dest.exists():
        return dest
    urls = [
        f"https://img.youtube.com/vi/{vid}/maxresdefault.jpg",
        f"https://img.youtube.com/vi/{vid}/hqdefault.jpg",
    ]
    import urllib.request
    for url in urls:
        try:
            urllib.request.urlretrieve(url, str(dest))
            if dest.exists() and dest.stat().st_size > 1000:
                return dest
            if dest.exists():
                dest.unlink()
        except Exception:
            continue
    return None


async def _fetch(api: str, session: aiohttp.ClientSession, **params) -> dict | list | None:
    for attempt in range(3):
        try:
            async with session.get(
                f"{LRCLIB_BASE}/{api}", params=params,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 429:
                    retry_after = int(resp.headers.get("Retry-After", 2))
                    await asyncio.sleep(retry_after)
                    continue
                if resp.status == 404:
                    return None
                if resp.status != 200 and attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return await resp.json()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
    return None


def _extract_lyrics(data):
    if not data:
        return None
    l = data.get("plainLyrics") or data.get("syncedLyrics")
    return l.strip() if l else None


async def fetch_lyrics(session, track_name, artist_name, duration):
    result = await _fetch("get", session, track_name=track_name, artist_name=artist_name, duration=duration)
    lyrics = _extract_lyrics(result)
    if lyrics:
        return lyrics
    result = await _fetch("search", session, q=f"{artist_name} {track_name}")
    if isinstance(result, list):
        for entry in result:
            if entry.get("artistName", "").lower() == artist_name.lower():
                lyrics = _extract_lyrics(entry)
                if lyrics:
                    return lyrics
        for entry in result:
            lyrics = _extract_lyrics(entry)
            if lyrics:
                return lyrics
    elif isinstance(result, dict):
        lyrics = _extract_lyrics(result)
        if lyrics:
            return lyrics
    return None


def get_duration_ms(file_path: Path) -> int:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(file_path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return int(float(result.stdout.strip()) * 1000)
    except Exception:
        pass
    return 0


async def main():
    if not R2_BUCKET:
        log("ERROR: R2_BUCKET not set")
        sys.exit(1)
    if not DATABASE_URL:
        log("ERROR: DATABASE_URL not set")
        sys.exit(1)

    fix_r2_only = "--fix-r2-only" in sys.argv
    skip_upload = "--skip-upload" in sys.argv
    THUMB_DIR.mkdir(parents=True, exist_ok=True)

    log("=" * 60)
    log("Fetching playlist metadata from YouTube...")
    log("=" * 60)
    entries = fetch_playlist_entries()
    log(f"Total unique entries: {len(entries)}")

    log("\n" + "=" * 60)
    log("Matching .webm files to playlist entries (by title)")
    log("=" * 60)
    matched, extra = match_webm_files(entries)
    log(f"\nMatched: {sum(1 for m in matched if m['file'])}/{len(matched)}")

    songs_data = build_songs_data(matched)
    log(f"\nSongs data built: {len(songs_data)} songs")

    if fix_r2_only:
        fix_r2_keys(songs_data)
        return

    if not skip_upload:
        fix_r2_keys(songs_data)

        log("\n" + "=" * 60)
        log("Downloading + uploading thumbnails to R2")
        log("=" * 60)
        r2 = get_r2_client()
        thumb_count = 0
        for s in songs_data:
            thumb = download_thumbnail(s["id"])
            if thumb:
                try:
                    r2.upload_file(str(thumb), R2_BUCKET, f"thumbnails/{s['id']}.jpg",
                                   ExtraArgs={"ContentType": "image/jpeg"})
                    thumb_count += 1
                    log(f"  ✓ thumbnails/{s['id']}.jpg")
                except Exception as e:
                    log(f"  ✗ thumbnail upload failed: {e}")
            else:
                log(f"  ✗ no thumbnail for {s['id']}")
            await asyncio.sleep(0.1)
        log(f"\nUploaded {thumb_count} thumbnails")
    else:
        log("SKIP-UPLOAD mode (R2 + thumbnails unchanged)")

    log("\n" + "=" * 60)
    log(f"Fetching lyrics from LRCLIB for {len(songs_data)} songs")
    log("=" * 60)

    async with aiohttp.ClientSession(headers={"User-Agent": USER_AGENT}) as session:
        for i, s in enumerate(songs_data):
            clean = clean_title(s["title"])
            log(f"  [{i+1}/{len(songs_data)}] '{s['title']}'")
            lyrics = await fetch_lyrics(session, track_name=clean, artist_name=s["artist"],
                                        duration=s["duration_ms"] // 1000)
            s["lyrics"] = lyrics
            log(f"    {'✓' if lyrics else '✗'}")
            if i < len(songs_data) - 1:
                await asyncio.sleep(0.3)

    lyrics_count = sum(1 for s in songs_data if s["lyrics"])
    log(f"\nLyrics: {lyrics_count}/{len(songs_data)}")

    log("\n" + "=" * 60)
    log("Inserting into database")
    log("=" * 60)

    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        await conn.execute(
            text("""INSERT INTO artists (id, name, colors, album_ids)
                     VALUES (:id, :name, :colors, :album_ids)
                     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name"""),
            {"id": ARTIST_ID, "name": ARTIST_NAME,
             "colors": ["#6d28d9", "#db2777"],
             "album_ids": list(set(s["album_id"] for s in songs_data))},
        )
        log("  ✓ Artist")

        albums: dict[str, list[str]] = {}
        for s in songs_data:
            albums.setdefault(s["album_id"], []).append(s["id"])

        for aid, song_ids in albums.items():
            album_title = next(s["album"] for s in songs_data if s["album_id"] == aid)
            await conn.execute(
                text("""INSERT INTO albums (id, title, artist, artist_id, year, genre, colors, song_ids)
                         VALUES (:id, :title, :artist, :artist_id, :year, :genre, :colors, :song_ids)
                         ON CONFLICT (id) DO UPDATE SET song_ids=EXCLUDED.song_ids"""),
                {"id": aid, "title": album_title, "artist": ARTIST_NAME, "artist_id": ARTIST_ID,
                 "year": 2024, "genre": "R&B", "colors": ["#6d28d9", "#db2777"],
                 "song_ids": song_ids},
            )
        log(f"  ✓ {len(albums)} album(s)")

        for s in songs_data:
            await conn.execute(
                text("""INSERT INTO songs (id, title, artist, artist_id, album, album_id,
                         duration, duration_ms, lyrics, r2_object_key, colors, track)
                         VALUES (:id, :title, :artist, :artist_id, :album, :album_id,
                                 :duration, :duration_ms, :lyrics, :r2_object_key, :colors, :track)
                         ON CONFLICT (id) DO UPDATE SET
                           title=EXCLUDED.title, lyrics=EXCLUDED.lyrics,
                           r2_object_key=EXCLUDED.r2_object_key"""),
                {k: s[k] for k in ("id", "title", "artist", "artist_id", "album", "album_id",
                                   "duration", "duration_ms", "lyrics", "r2_object_key",
                                   "colors", "track")},
            )
        log(f"  ✓ {len(songs_data)} songs")

        all_ids = [s["id"] for s in songs_data]
        await conn.execute(
            text("""INSERT INTO playlists (id, title, colors, song_ids)
                     VALUES (:id, :title, :colors, :song_ids)
                     ON CONFLICT (id) DO UPDATE SET song_ids=EXCLUDED.song_ids"""),
            {"id": "weeknd-discography", "title": "The Weeknd — Full Discography",
             "colors": ["#6d28d9", "#db2777"], "song_ids": all_ids},
        )
        log("  ✓ Playlist")

    await engine.dispose()
    log(f"\n{'=' * 60}")
    log(f"DONE! {len(songs_data)} songs, {lyrics_count} lyrics")
    log(f"{'=' * 60}")


if __name__ == "__main__":
    asyncio.run(main())
