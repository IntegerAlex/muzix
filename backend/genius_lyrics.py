"""
Fetch lyrics from Genius API and populate Muzix database with The Weeknd's discography.

Requires:
- GENIUS_API_TOKEN (from https://genius.com/api-clients)
- SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET (for discography, optional - can use MusicBrainz instead)

Run: uv run python genius_lyrics.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import aiohttp
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from db import DATABASE_URL
from models import Artist, Album, Song, Base

load_dotenv()

GENIUS_API_TOKEN = os.getenv("GENIUS_API_TOKEN")
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")

ARTIST_NAME = "The Weeknd"
ARTIST_ID = "the-weeknd"

HEADERS = {
    "Authorization": f"Bearer {GENIUS_API_TOKEN}",
    "User-Agent": "Muzix/1.0 (+https://github.com/yourproject)",
}

GENIUS_BASE = "https://api.genius.com"
SPOTIFY_AUTH_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"

session: aiohttp.ClientSession | None = None
spotify_token: str | None = None


async def get_session() -> aiohttp.ClientSession:
    global session
    if session is None or session.closed:
        session = aiohttp.ClientSession(headers=HEADERS)
    return session


async def close_session():
    global session
    if session and not session.closed:
        await session.close()


async def get_spotify_token() -> str | None:
    global spotify_token
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return None
    if spotify_token:
        return spotify_token

    s = await get_session()
    auth = aiohttp.BasicAuth(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
    async with s.post(SPOTIFY_AUTH_URL, data={"grant_type": "client_credentials"}, auth=auth) as resp:
        if resp.status == 200:
            data = await resp.json()
            spotify_token = data["access_token"]
            return spotify_token
    return None


async def search_genius_artist(query: str) -> dict | None:
    """Search for artist on Genius."""
    s = await get_session()
    async with s.get(f"{GENIUS_BASE}/search", params={"q": query}) as resp:
        if resp.status == 200:
            data = await resp.json()
            hits = data.get("response", {}).get("hits", [])
            for hit in hits:
                if hit["result"]["primary_artist"]["name"].lower() == query.lower():
                    return hit["result"]["primary_artist"]
    return None


async def get_artist_songs_genius(artist_id: int, max_pages: int = 10) -> list[dict]:
    """Get all songs for an artist from Genius."""
    s = await get_session()
    all_songs = []
    page = 1

    while page <= max_pages:
        async with s.get(
            f"{GENIUS_BASE}/artists/{artist_id}/songs",
            params={"page": page, "per_page": 50, "sort": "popularity"},
        ) as resp:
            if resp.status != 200:
                break
            data = await resp.json()
            songs = data.get("response", {}).get("songs", [])
            if not songs:
                break
            all_songs.extend(songs)
            if not data.get("response", {}).get("next_page"):
                break
            page += 1
            await asyncio.sleep(0.2)

    return all_songs


async def get_song_lyrics(song_url: str) -> str | None:
    """Scrape lyrics from Genius song page."""
    s = await get_session()
    async with s.get(song_url) as resp:
        if resp.status != 200:
            return None
        html = await resp.text()

    match = re.search(r'<div class="Lyrics__Container[^"]*">(.*?)</div>', html, re.DOTALL)
    if not match:
        match = re.search(r'<div class="lyrics">(.*?)</div>', html, re.DOTALL)
    if not match:
        return None

    lyrics = match.group(1)
    lyrics = re.sub(r'<br\s*/?>', '\n', lyrics)
    lyrics = re.sub(r'<[^>]+>', '', lyrics)
    lyrics = re.sub(r'\n{3,}', '\n\n', lyrics)
    return lyrics.strip()


async def get_spotify_artist_id() -> str | None:
    """Get The Weeknd's Spotify artist ID."""
    token = await get_spotify_token()
    if not token:
        return None

    s = await get_session()
    headers = {"Authorization": f"Bearer {token}"}
    async with s.get(
        f"{SPOTIFY_API_BASE}/search",
        headers=headers,
        params={"q": ARTIST_NAME, "type": "artist", "limit": 1},
    ) as resp:
        if resp.status == 200:
            data = await resp.json()
            artists = data.get("artists", {}).get("items", [])
            if artists:
                return artists[0]["id"]
    return None


async def get_spotify_albums(artist_id: str) -> list[dict]:
    """Get all albums for an artist from Spotify."""
    token = await get_spotify_token()
    if not token:
        return []

    s = await get_session()
    headers = {"Authorization": f"Bearer {token}"}
    all_albums = []
    url = f"{SPOTIFY_API_BASE}/artists/{artist_id}/albums"
    params = {"include_groups": "album,single,compilation", "limit": 50}

    while url:
        async with s.get(url, headers=headers, params=params) as resp:
            if resp.status != 200:
                break
            data = await resp.json()
            all_albums.extend(data.get("items", []))
            url = data.get("next")
            params = None

    return all_albums


async def get_spotify_album_tracks(album_id: str) -> list[dict]:
    """Get all tracks for an album from Spotify."""
    token = await get_spotify_token()
    if not token:
        return []

    s = await get_session()
    headers = {"Authorization": f"Bearer {token}"}
    all_tracks = []
    url = f"{SPOTIFY_API_BASE}/albums/{album_id}/tracks"
    params = {"limit": 50}

    while url:
        async with s.get(url, headers=headers, params=params) as resp:
            if resp.status != 200:
                break
            data = await resp.json()
            all_tracks.extend(data.get("items", []))
            url = data.get("next")
            params = None

    return all_tracks


@dataclass
class TrackData:
    id: str
    title: str
    artist: str
    artist_id: str
    album: str
    album_id: str
    duration_ms: int
    track_number: int | None
    lyrics: str | None
    release_year: int
    genre: str


def clean_lyrics(lyrics: str) -> str:
    """Clean up lyrics text."""
    lyrics = re.sub(r'\[.*?\]', '', lyrics)
    lyrics = re.sub(r'\n{3,}', '\n\n', lyrics)
    return lyrics.strip()


async def match_lyrics_to_tracks(tracks: list[TrackData], genius_songs: list[dict]) -> list[TrackData]:
    """Match Genius songs to Spotify tracks and fetch lyrics."""
    genius_map = {}
    for gs in genius_songs:
        title = gs["title"].lower()
        title = re.sub(r'\(.*?\)', '', title).strip()
        genius_map[title] = gs

    matched = []
    for track in tracks:
        clean_title = re.sub(r'\(.*?\)', '', track.title.lower()).strip()
        genius_song = genius_map.get(clean_title)

        if not genius_song:
            for gtitle, gs in genius_map.items():
                if clean_title in gtitle or gtitle in clean_title:
                    genius_song = gs
                    break

        lyrics = None
        if genius_song and genius_song.get("url"):
            print(f"  Fetching lyrics for: {track.title}")
            raw_lyrics = await get_song_lyrics(genius_song["url"])
            if raw_lyrics:
                lyrics = clean_lyrics(raw_lyrics)

        track.lyrics = lyrics
        matched.append(track)

    return matched


async def build_weeknd_discography() -> list[TrackData]:
    """Build complete discography with lyrics."""
    print("Fetching The Weeknd's Spotify ID...")
    spotify_artist_id = await get_spotify_artist_id()
    if not spotify_artist_id:
        print("Failed to get Spotify artist ID. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET")
        sys.exit(1)

    print(f"Spotify Artist ID: {spotify_artist_id}")

    print("Fetching albums from Spotify...")
    albums = await get_spotify_albums(spotify_artist_id)
    print(f"Found {len(albums)} albums")

    all_tracks = []
    for album in albums:
        album_id = album["id"]
        album_name = album["name"]
        release_year = int(album["release_date"][:4]) if album.get("release_date") else 2024
        genre = album.get("genres", ["R&B"])[0] if album.get("genres") else "R&B"

        print(f"  Fetching tracks for: {album_name}")
        tracks = await get_spotify_album_tracks(album_id)

        for i, track in enumerate(tracks):
            all_tracks.append(TrackData(
                id=track["id"],
                title=track["name"],
                artist=ARTIST_NAME,
                artist_id=ARTIST_ID,
                album=album_name,
                album_id=album_id,
                duration_ms=track["duration_ms"],
                track_number=track.get("track_number"),
                lyrics=None,
                release_year=release_year,
                genre=genre,
            ))
        await asyncio.sleep(0.1)

    print(f"Total tracks: {len(all_tracks)}")

    print("Searching Genius for artist...")
    genius_artist = await search_genius_artist(ARTIST_NAME)
    if not genius_artist:
        print("Artist not found on Genius")
        return all_tracks

    print(f"Genius Artist ID: {genius_artist['id']}")
    print("Fetching all songs from Genius...")
    genius_songs = await get_artist_songs_genius(genius_artist["id"])
    print(f"Found {len(genius_songs)} songs on Genius")

    print("Matching lyrics to tracks...")
    matched = await match_lyrics_to_tracks(all_tracks, genius_songs)

    lyrics_count = sum(1 for t in matched if t.lyrics)
    print(f"Matched lyrics for {lyrics_count}/{len(matched)} tracks")

    return matched


async def insert_into_database(tracks: list[TrackData]):
    """Insert tracks, albums, artists into PostgreSQL."""
    print("\nInserting into database...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        colors = ["#6d28d9", "#db2777"]

        # Insert artist
        await conn.execute(
            text("INSERT INTO artists (id, name, colors, album_ids) VALUES (:id, :name, :colors, :album_ids) ON CONFLICT DO NOTHING"),
            {"id": ARTIST_ID, "name": ARTIST_NAME, "colors": colors, "album_ids": []},
        )

        # Group by album
        album_map: dict[str, dict] = {}
        for t in tracks:
            if t.album_id not in album_map:
                album_map[t.album_id] = {
                    "id": t.album_id,
                    "title": t.album,
                    "artist": t.artist,
                    "artist_id": t.artist_id,
                    "year": t.release_year,
                    "genre": t.genre,
                    "colors": colors,
                    "song_ids": [],
                }
            album_map[t.album_id]["song_ids"].append(t.id)

        # Insert albums
        for album in album_map.values():
            await conn.execute(
                text("""INSERT INTO albums (id, title, artist, artist_id, year, genre, colors, song_ids)
                        VALUES (:id, :title, :artist, :artist_id, :year, :genre, :colors, :song_ids)
                        ON CONFLICT DO NOTHING"""),
                album,
            )

        # Insert songs
        for t in tracks:
            duration_sec = t.duration_ms // 1000
            duration_str = f"{duration_sec // 60}:{duration_sec % 60:02d}"
            await conn.execute(
                text("""INSERT INTO songs (id, title, artist, artist_id, album, album_id, duration, duration_ms,
                                              track, lyrics, r2_object_key, colors)
                        VALUES (:id, :title, :artist, :artist_id, :album, :album_id, :duration, :duration_ms,
                                :track, :lyrics, :r2_object_key, :colors)
                        ON CONFLICT DO NOTHING"""),
                {
                    "id": t.id,
                    "title": t.title,
                    "artist": t.artist,
                    "artist_id": t.artist_id,
                    "album": t.album,
                    "album_id": t.album_id,
                    "duration": duration_str,
                    "duration_ms": t.duration_ms,
                    "track": t.track_number,
                    "lyrics": t.lyrics,
                    "r2_object_key": None,
                    "colors": colors,
                },
            )

    await engine.dispose()
    print("Database insert complete!")


async def main():
    if not GENIUS_API_TOKEN:
        print("ERROR: GENIUS_API_TOKEN not set in .env")
        print("Get one at: https://genius.com/api-clients")
        sys.exit(1)

    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        print("ERROR: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET not set in .env")
        print("Get them at: https://developer.spotify.com/dashboard")
        sys.exit(1)

    try:
        tracks = await build_weeknd_discography()
        await insert_into_database(tracks)
    finally:
        await close_session()


if __name__ == "__main__":
    asyncio.run(main())