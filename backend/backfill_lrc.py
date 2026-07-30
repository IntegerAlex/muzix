"""
Backfill synced LRC lyrics from LRCLIB for existing songs.

Upgrades plain-text lyrics to synced LRC where available.
Skips songs that already have synced lyrics.

Usage:
    export DATABASE_URL=postgresql://user:pass@host/db
    uv run python backfill_lrc.py
"""
from __future__ import annotations

import asyncio
import os
import time
import threading

import requests
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import SessionLocal
from models import Song


_LRCLIB_LOCK = threading.Lock()
_LRCLIB_LAST = 0.0
_LRCLIB_DELAY = 0.35


def _lrclib_wait():
    global _LRCLIB_LAST
    with _LRCLIB_LOCK:
        now = time.time()
        wait = _LRCLIB_DELAY - (now - _LRCLIB_LAST)
        if wait > 0:
            time.sleep(wait)
        _LRCLIB_LAST = now


def fetch_lrc(song: Song) -> str | None:
    headers = {"User-Agent": "Muzix/1.0 (https://github.com/akshatm123/muzix)"}

    _lrclib_wait()
    try:
        params = {
            "artist_name": song.artist,
            "track_name": song.title,
            "album_name": song.album or "",
            "duration": str(song.duration_ms // 1000 if song.duration_ms else 0),
        }
        r = requests.get(
            "https://lrclib.net/api/get",
            params=params, headers=headers, timeout=15,
        )
        if r.status_code == 200:
            data = r.json()
            return data.get("syncedLyrics") or data.get("plainLyrics") or None
        elif r.status_code == 429:
            retry = int(r.headers.get("Retry-After", 5))
            print(f"  Rate limited, sleeping {retry}s")
            time.sleep(retry)
            r2 = requests.get(
                "https://lrclib.net/api/get",
                params=params, headers=headers, timeout=15,
            )
            if r2.status_code == 200:
                data = r2.json()
                return data.get("syncedLyrics") or data.get("plainLyrics") or None
    except Exception as e:
        print(f"  /api/get error for {song.title}: {e}")

    _lrclib_wait()
    try:
        params = {"q": f"{song.artist} {song.title}"}
        r = requests.get(
            "https://lrclib.net/api/search",
            params=params, headers=headers, timeout=10,
        )
        if r.status_code == 200:
            results = r.json()
            for res in results:
                if res.get("syncedLyrics"):
                    return res["syncedLyrics"]
            if results:
                return results[0].get("plainLyrics") or None
    except Exception as e:
        print(f"  /api/search error for {song.title}: {e}")

    return None


async def get_songs(db: AsyncSession) -> list[Song]:
    result = await db.execute(select(Song).where(Song.lyrics != None))
    return list(result.scalars().all())


async def main():
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        return

    songs = []
    async with SessionLocal() as db:
        songs = await get_songs(db)

    print(f"Found {len(songs)} songs with existing lyrics")

    updated = 0
    skipped = 0
    no_lrc = 0

    async with SessionLocal() as db:
        for i, song in enumerate(songs, 1):
            if song.lyrics and song.lyrics.startswith('['):
                skipped += 1
                continue

            print(f"[{i}/{len(songs)}] {song.title} - {song.artist}")
            lrc = fetch_lrc(song)

            if lrc and lrc != song.lyrics:
                song.lyrics = lrc
                db.add(song)
                updated += 1
                print(f"  Updated to LRC ({len(lrc)} chars)")
            elif not lrc:
                no_lrc += 1
                print(f"  - No synced lyrics available")
            else:
                skipped += 1

            if updated % 20 == 0:
                await db.commit()
                print(f"  ... committed {updated} updates")

        await db.commit()

    print(f"\nDone.")
    print(f"  Updated to LRC: {updated}")
    print(f"  Skipped (already LRC or unchanged): {skipped}")
    print(f"  No synced lyrics available: {no_lrc}")


if __name__ == "__main__":
    asyncio.run(main())
