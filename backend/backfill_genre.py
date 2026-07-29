"""
Backfill genre for existing songs using MusicBrainz + Wikipedia scraping.

Falls back to web sources since Genius does not expose artist tags
via its public API or web pages for these artists.
"""
from __future__ import annotations

import asyncio
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from db import DATABASE_URL

load_dotenv()

MUSICBRAINZ_UA = "Muzix/1.0 (https://muzix.app)"
SCRAPE_DELAY = 0.3
API_DELAY = 1.0


def log(severity: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    icon = {"OK": "✓", "WARN": "⚠", "ERROR": "✗", "INFO": "•"}.get(severity, " ")
    print(f"[{ts}] [{icon}] {msg}")


def musicbrainz_search_artist(name: str) -> str | None:
    url = "https://musicbrainz.org/ws/2/artist/"
    params = {"query": f"artist:{name}", "fmt": "json"}
    headers = {"User-Agent": MUSICBRAINZ_UA}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        artists = data.get("artists", [])
        if not artists:
            return None
        return artists[0].get("id")
    except Exception:
        return None


def musicbrainz_artist_tags(mbid: str) -> list[str]:
    url = f"https://musicbrainz.org/ws/2/artist/{mbid}"
    params = {"fmt": "json", "inc": "tags"}
    headers = {"User-Agent": MUSICBRAINZ_UA}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        if r.status_code != 200:
            return []
        data = r.json()
        tags = [t.get("name", "") for t in data.get("tags", [])]
        return [t for t in tags if t]
    except Exception:
        return []


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
        r = requests.get(url, headers={"User-Agent": MUSICBRAINZ_UA}, timeout=10)
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


async def fetch_artists() -> list[dict]:
    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    async with engine.begin() as conn:
        result = await conn.execute(
            text("""
                SELECT DISTINCT s.artist_id, s.artist
                FROM songs s
                WHERE s.artist_id IS NOT NULL AND s.artist_id != ''
                ORDER BY s.artist_id
            """)
        )
        artists = [{"artist_id": row[0], "artist": row[1]} for row in result.fetchall()]
    await engine.dispose()
    return artists


async def backfill(artists: list[dict]):
    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    updated = 0
    skipped = 0

    async with engine.begin() as conn:
        for a in artists:
            artist_id = a["artist_id"]
            artist_name = a["artist"]
            genre = "Unknown"

            mbid = musicbrainz_search_artist(artist_name)
            time.sleep(API_DELAY)
            if mbid:
                tags = musicbrainz_artist_tags(mbid)
                time.sleep(API_DELAY)
                genre = pick_genre_from_mb(tags, artist_name) or "Unknown"

            if genre == "Unknown":
                genre = scrape_wikipedia_genre(artist_name) or "Unknown"

            try:
                result = await conn.execute(
                    text("""
                        UPDATE songs SET genre = :genre
                        WHERE artist_id = :artist_id
                    """),
                    {"genre": genre, "artist_id": artist_id},
                )
                await conn.execute(
                    text("""
                        UPDATE albums SET genre = :genre
                        WHERE artist_id = :artist_id
                    """),
                    {"genre": genre, "artist_id": artist_id},
                )
                count = result.rowcount
                if count > 0:
                    log("OK", f"{artist_name}: {genre} ({count} songs)")
                    updated += count
                else:
                    skipped += 1
            except Exception as e:
                log("ERROR", f"DB update failed for {artist_name}: {e}")
            time.sleep(SCRAPE_DELAY)

    await engine.dispose()
    log("OK", f"Updated {updated} songs, skipped {skipped} artists")


def main():
    log("INFO", "=" * 55)
    log("INFO", "GENRE BACKFILL (MusicBrainz + Wikipedia)")
    log("INFO", "=" * 55)

    artists = asyncio.run(fetch_artists())
    log("OK", f"Found {len(artists)} distinct artists")
    if not artists:
        return

    asyncio.run(backfill(artists))

    log("INFO", "")
    log("OK", "BACKFILL COMPLETE")
    log("INFO", "=" * 55)


if __name__ == "__main__":
    main()
