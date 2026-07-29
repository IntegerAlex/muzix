"""
Import any artist's full discography from Genius + YouTube.

Pipeline:
  1. Fetch all songs + lyrics from Genius via lyricsgenius
  2. Search YouTube for each song, download audio via yt-dlp
  3. Upload audio + thumbnails to Cloudflare R2
  4. Insert songs/albums/artists into PostgreSQL

Usage:
    export GENIUS_API_TOKEN=your_token
    uv run python import_karan_aujla.py "Karan Aujla"
    uv run python import_karan_aujla.py "The Weeknd"
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from botocore.client import Config
from dotenv import load_dotenv
from lyricsgenius import Genius
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

if len(sys.argv) < 2:
    print("Usage: uv run python import_karan_aujla.py <artist_name>")
    sys.exit(1)

ARTIST_NAME = sys.argv[1]
ARTIST_SLUG = re.sub(r"[^a-z0-9]+", "-", ARTIST_NAME.lower()).strip("-")

ASSETS = Path(__file__).parent / "assets"
AUDIO_DIR = ASSETS / "audio"
THUMB_DIR = ASSETS / "thumbnails"
INFO_DIR = ASSETS / "info"

R2_BUCKET = os.getenv("R2_BUCKET")
S3_ENDPOINT = (os.getenv("R2_PUBLIC_URL") or
               f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com")

r2 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
    region_name="auto",
    config=Config(signature_version="s3v4"),
)

MAX_WORKERS = 4


def log(severity: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    icon = {"OK": "✓", "WARN": "⚠", "ERROR": "✗", "INFO": "•"}.get(severity, " ")
    print(f"[{ts}] [{icon}] {msg}")


# ---------------------------------------------------------------------------
# Step 1: Fetch from Genius
# ---------------------------------------------------------------------------

def fetch_artist_songs() -> list[dict]:
    token = os.getenv("GENIUS_API_TOKEN")
    if not token:
        log("ERROR", "GENIUS_API_TOKEN not set")
        sys.exit(1)

    genius = Genius(token)
    genius.verbose = False
    genius.remove_section_headers = True
    genius.skip_non_songs = True
    genius.excluded_terms = ["(Remix)", "(Live)", "(Instrumental)", "(Sped Up)", "(Slowed)"]

    log("INFO", f"Searching Genius for '{ARTIST_NAME}'...")
    artist = genius.search_artist(ARTIST_NAME, max_songs=0)
    artist_id = artist.api_path.split("/")[-1] if artist.api_path else "?"
    log("OK", f"Found: {artist.name} (id={artist_id})")

    genre = "Pop"
    try:
        import requests
        from bs4 import BeautifulSoup
        from difflib import SequenceMatcher

        def clean_tag(tag: str, artist_name: str) -> bool:
            tag_lower = tag.lower()
            name_lower = artist_name.lower()
            if tag_lower == name_lower:
                return False
            if re.match(r"^\d{4}s?$", tag_lower):
                return False
            if tag_lower in name_lower.split():
                return False
            if tag_lower.replace(" ", "") == name_lower.replace(" ", ""):
                return False
            name_words = name_lower.split()
            if all(w in tag_lower for w in name_words):
                return False
            if SequenceMatcher(None, tag_lower, name_lower.replace(" ", "")).ratio() > 0.8:
                return False
            return True

        def pick_genre_from_mb(tags: list[str], artist_name: str) -> str | None:
            for tag in tags:
                if clean_tag(tag, artist_name):
                    return tag
            return None

        def scrape_wikipedia_genre(artist_name: str) -> str | None:
            slug = artist_name.replace(" ", "_")
            url = f"https://en.wikipedia.org/wiki/{slug}"
            try:
                r = requests.get(url, headers={"User-Agent": "Muzix/1.0"}, timeout=10)
                if r.status_code != 200:
                    return None
                soup = BeautifulSoup(r.text, "html.parser")
                infobox = soup.find("table", class_="infobox")
                if not infobox:
                    return None
                for row in infobox.find_all("tr"):
                    th = row.find("th")
                    if th and "genre" in th.get_text().lower():
                        td = row.find("td")
                        if td:
                            genres = [a.get_text(strip=True) for a in td.find_all("a")]
                            for g in genres:
                                if g and clean_tag(g, artist_name):
                                    return g
                return None
            except Exception:
                return None

        headers = {"User-Agent": "Muzix/1.0"}
        r = requests.get(
            "https://musicbrainz.org/ws/2/artist/",
            params={"query": f"artist:{ARTIST_NAME}", "fmt": "json"},
            headers=headers,
            timeout=10,
        )
        if r.status_code == 200:
            artists_data = r.json().get("artists", [])
            if artists_data:
                mbid = artists_data[0].get("id")
                if mbid:
                    r2 = requests.get(
                        f"https://musicbrainz.org/ws/2/artist/{mbid}",
                        params={"fmt": "json", "inc": "tags"},
                        headers=headers,
                        timeout=10,
                    )
                    if r2.status_code == 200:
                        tags = [t.get("name", "") for t in r2.json().get("tags", [])]
                        genre = pick_genre_from_mb(tags, ARTIST_NAME) or "Pop"

        if genre == "Pop":
            genre = scrape_wikipedia_genre(ARTIST_NAME) or "Pop"
    except Exception:
        pass

    log("OK", f"Genre: {genre}")

    # Get song list from API (fast, no lyrics)
    log("INFO", "Fetching song list from Genius API...")
    raw_songs = []
    page = 1
    while True:
        result = genius.artist_songs(artist_id, per_page=50, page=page, sort="popularity")
        batch = result.get("songs", []) if isinstance(result, dict) else (result or [])
        if not batch:
            break
        raw_songs.extend(batch)
        log("INFO", f"  Page {page}: {len(batch)} songs (total: {len(raw_songs)})")
        if len(batch) < 50:
            break
        page += 1

    log("OK", f"Got {len(raw_songs)} song entries")

    # Fetch lyrics in parallel
    log("INFO", f"Fetching lyrics for {len(raw_songs)} songs ({MAX_WORKERS} workers)...")
    songs = []
    lyrics_ok = 0

    def fetch_lyrics(entry: dict) -> dict | None:
        title = re.sub(r"\s*\(.*?\)\s*", "", entry.get("title", "")).strip()
        if not title:
            return None
        sid = entry.get("id")
        url = entry.get("url", "")
        lyrics = ""
        image_url = entry.get("song_art_image_url", "") or ""
        if url:
            try:
                g = Genius(token)
                g.verbose = False
                g.remove_section_headers = True
                lyrics = g.lyrics(song_url=url) or ""
            except Exception:
                pass
        return {
            "title": title,
            "genius_title": entry.get("title", ""),
            "lyrics": lyrics,
            "image_url": image_url,
            "genius_id": sid,
            "genius_url": url,
        }

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(fetch_lyrics, entry): entry for entry in raw_songs}
        done = 0
        for f in as_completed(futures):
            done += 1
            result = f.result()
            if result:
                songs.append(result)
                if result["lyrics"]:
                    lyrics_ok += 1
            if done % 20 == 0 or done == len(raw_songs):
                log("INFO", f"  Lyrics: {done}/{len(raw_songs)} (ok={lyrics_ok})")

    log("OK", f"Lyrics fetched for {lyrics_ok}/{len(songs)} songs")
    return songs


# ---------------------------------------------------------------------------
# Step 2: Download from YouTube
# ---------------------------------------------------------------------------

def download_song(song: dict, idx: int, total: int) -> dict | None:
    query = f"{song['title']} {ARTIST_NAME} audio"
    log("INFO", f"[{idx}/{total}] Searching: '{query}'")

    try:
        result = subprocess.run(
            [
                "yt-dlp",
                "--print", "%(id)s",
                "--print", "%(title)s",
                "--print", "%(duration)s",
                "--print", "%(uploader)s",
                "--default-search", "ytsearch1",
                "--no-playlist", "--no-warnings",
                f"ytsearch1:{query}",
            ],
            capture_output=True, text=True, timeout=120,
        )
    except subprocess.TimeoutExpired:
        log("WARN", f"[{idx}/{total}] Search timed out: {song['title']}")
        return None
    except FileNotFoundError:
        log("ERROR", "yt-dlp not found. Install: pip install yt-dlp")
        sys.exit(1)

    if result.returncode != 0:
        log("WARN", f"[{idx}/{total}] No YouTube result: {song['title']}")
        return None

    lines = result.stdout.strip().split("\n")
    if len(lines) < 4:
        return None

    vid_id = lines[0]
    yt_title = lines[1]
    duration = int(lines[2])

    if duration < 30 or duration > 600:
        log("WARN", f"[{idx}/{total}] Skip '{yt_title}' ({duration}s out of range)")
        return None

    audio_path = AUDIO_DIR / f"{vid_id}.mp3"

    if not audio_path.exists():
        log("INFO", f"[{idx}/{total}] Downloading: {vid_id} ({duration}s)")
        r = subprocess.run(
            [
                "yt-dlp",
                "--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K",
                "-o", str(AUDIO_DIR / "%(id)s.%(ext)s"),
                "--no-playlist", "--no-warnings", "--quiet",
                f"https://www.youtube.com/watch?v={vid_id}",
            ],
            timeout=300, check=False,
        )
        if r.returncode != 0 or not audio_path.exists():
            log("ERROR", f"[{idx}/{total}] Download failed: {vid_id}")
            return None

    # Thumbnail
    thumb_path = THUMB_DIR / f"{vid_id}.jpg"
    if not thumb_path.exists():
        subprocess.run(
            [
                "yt-dlp",
                "--write-thumbnail", "--convert-thumbnails", "jpg", "--skip-download",
                "-o", str(THUMB_DIR / "%(id)s.%(ext)s"),
                "--no-playlist", "--no-warnings", "--quiet",
                f"https://www.youtube.com/watch?v={vid_id}",
            ],
            timeout=60, check=False,
        )

    # Info JSON
    info_path = INFO_DIR / f"{vid_id}.info.json"
    if not info_path.exists():
        subprocess.run(
            [
                "yt-dlp",
                "--write-info-json", "--skip-download",
                "-o", str(INFO_DIR / "%(id)s.%(ext)s"),
                "--no-playlist", "--no-warnings", "--quiet",
                f"https://www.youtube.com/watch?v={vid_id}",
            ],
            timeout=60, check=False,
        )

    return {
        "vid_id": vid_id,
        "title": song["title"],
        "duration": duration,
        "lyrics": song.get("lyrics", ""),
        "image_url": song.get("image_url", ""),
        "audio_path": audio_path,
        "thumb_path": thumb_path if thumb_path.exists() else None,
    }


# ---------------------------------------------------------------------------
# Step 3: Upload to R2
# ---------------------------------------------------------------------------

def upload_r2(local_path: Path, key: str, content_type: str):
    with open(local_path, "rb") as f:
        r2.put_object(Bucket=R2_BUCKET, Key=key, Body=f, ContentType=content_type)


# ---------------------------------------------------------------------------
# Step 4: Insert into PostgreSQL
# ---------------------------------------------------------------------------

async def insert_db(songs: list[dict]):
    log("INFO", "Inserting into PostgreSQL...")
    from db import DATABASE_URL
    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0

    colors = ["#6d28d9", "#db2777"]
    album_id = ARTIST_SLUG

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO artists (id, name, colors, album_ids)
                VALUES (:id, :name, :colors, :album_ids)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
            """),
            {"id": ARTIST_SLUG, "name": ARTIST_NAME, "colors": colors, "album_ids": []},
        )

        await conn.execute(
            text("""
                INSERT INTO albums (id, title, artist, artist_id, year, genre, colors, song_ids)
                VALUES (:id, :title, :artist, :artist_id, :year, :genre, :colors, :song_ids)
                ON CONFLICT (id) DO UPDATE SET song_ids = EXCLUDED.song_ids
            """),
            {
                "id": album_id,
                "title": ARTIST_NAME,
                "artist": ARTIST_NAME,
                "artist_id": ARTIST_SLUG,
                "year": 2024,
                "genre": genre,
                "colors": colors,
                "song_ids": [s["vid_id"] for s in songs],
            },
        )

        inserted = 0
        for s in songs:
            dur_min = s["duration"] // 60
            dur_sec = s["duration"] % 60
            try:
                await conn.execute(
                    text("""
                        INSERT INTO songs (
                            id, title, artist, artist_id,
                            album, album_id, duration, duration_ms,
                            lyrics, r2_object_key, colors
                        ) VALUES (
                            :id, :title, :artist, :artist_id,
                            :album, :album_id, :duration, :duration_ms,
                            :lyrics, :r2_object_key, :colors
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            title = EXCLUDED.title,
                            r2_object_key = EXCLUDED.r2_object_key
                    """),
                    {
                        "id": s["vid_id"],
                        "title": s["title"],
                        "artist": ARTIST_NAME,
                        "artist_id": ARTIST_SLUG,
                        "album": ARTIST_NAME,
                        "album_id": album_id,
                        "genre": genre,
                        "duration": f"{dur_min}:{dur_sec:02d}",
                        "duration_ms": s["duration"] * 1000,
                        "lyrics": s.get("lyrics"),
                        "r2_object_key": f"audio/{s['vid_id']}.mp3",
                        "colors": colors,
                    },
                )
                inserted += 1
            except Exception as e:
                log("ERROR", f"DB insert failed for {s['vid_id']}: {e}")

        log("OK", f"Inserted {inserted}/{len(songs)} songs")
    await engine.dispose()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    log("INFO", "=" * 55)
    log("INFO", "KARAN AUJLA DISCOGRAPHY IMPORTER")
    log("INFO", "=" * 55)

    for d in [AUDIO_DIR, THUMB_DIR, INFO_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    # Step 1: Genius
    log("INFO", "")
    log("INFO", "STEP 1/4: Fetch from Genius")
    songs = fetch_artist_songs()
    if not songs:
        log("ERROR", "No songs found")
        sys.exit(1)

    # Step 2: Download
    log("INFO", "")
    log("INFO", f"STEP 2/4: Download from YouTube ({MAX_WORKERS} workers)")
    downloaded = []
    total = len(songs)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(download_song, s, i + 1, total): s
                   for i, s in enumerate(songs)}
        done = 0
        for f in as_completed(futures):
            done += 1
            result = f.result()
            if result:
                downloaded.append(result)

    log("OK", f"Downloaded {len(downloaded)}/{total} songs")
    if not downloaded:
        log("ERROR", "No songs downloaded. Aborting.")
        sys.exit(1)

    # Step 3: R2
    log("INFO", "")
    log("INFO", f"STEP 3/4: Upload to R2 ({len(downloaded)} files)")
    ok = 0
    for i, s in enumerate(downloaded, 1):
        try:
            upload_r2(s["audio_path"], f"audio/{s['vid_id']}.mp3", "audio/mpeg")
            if s["thumb_path"]:
                upload_r2(s["thumb_path"], f"thumbnails/{s['vid_id']}.jpg", "image/jpeg")
            ok += 1
            if i % 10 == 0 or i == len(downloaded):
                log("OK", f"  R2 progress: {i}/{len(downloaded)}")
        except Exception as e:
            log("ERROR", f"  R2 upload failed for {s['vid_id']}: {e}")
    log("OK", f"Uploaded {ok}/{len(downloaded)} songs to R2")

    # Step 4: DB
    log("INFO", "")
    log("INFO", "STEP 4/4: Insert into database")
    asyncio.run(insert_db(downloaded))

    log("INFO", "")
    log("OK", f"IMPORT COMPLETE: {len(downloaded)} songs")
    log("INFO", "=" * 55)


if __name__ == "__main__":
    main()
