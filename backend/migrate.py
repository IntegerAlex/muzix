"""
Muzix database migration.

Creates the `songs`, `albums`, `artists`, and `playlists` tables if they do not
already exist, and adds any missing columns to an existing `songs` table
(idempotent — safe to run repeatedly).

Usage:
    uv run python migrate.py
"""
from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from db import _async_url

load_dotenv()


async def migrate() -> None:
    url = _async_url(os.getenv("DATABASE_URL", ""))
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        # ----- songs -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS songs (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL DEFAULT '',
                    artist TEXT NOT NULL DEFAULT '',
                    artist_id TEXT NOT NULL DEFAULT '',
                    album TEXT NOT NULL DEFAULT '',
                    album_id TEXT NOT NULL DEFAULT '',
                    duration TEXT NOT NULL DEFAULT '',
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    track INTEGER,
                    lyrics TEXT,
                    r2_object_key TEXT,
                    r2_object_url TEXT,
                    colors TEXT[] NOT NULL DEFAULT '{}',
                    fts TSVECTOR
                        GENERATED ALWAYS AS (
                            to_tsvector('english',
                                coalesce(title,'') || ' ' ||
                                coalesce(artist,'') || ' ' ||
                                coalesce(album,''))
                        ) STORED
                );
                """
            )
        )
        # Add columns that may be missing on a pre-existing songs table.
        for col, ddl in [
            ("artist_id", "TEXT NOT NULL DEFAULT ''"),
            ("album_id", "TEXT NOT NULL DEFAULT ''"),
            ("track", "INTEGER"),
            ("lyrics", "TEXT"),
            ("colors", "TEXT[] NOT NULL DEFAULT '{}'"),
        ]:
            await conn.execute(
                text(f"ALTER TABLE songs ADD COLUMN IF NOT EXISTS {col} {ddl};")
            )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS songs_fts_idx ON songs USING GIN (fts);")
        )

        # ----- albums -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS albums (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL DEFAULT '',
                    artist TEXT NOT NULL DEFAULT '',
                    artist_id TEXT NOT NULL DEFAULT '',
                    year INTEGER NOT NULL DEFAULT 0,
                    genre TEXT NOT NULL DEFAULT '',
                    colors TEXT[] NOT NULL DEFAULT '{}',
                    song_ids TEXT[] NOT NULL DEFAULT '{}',
                    fts TSVECTOR
                        GENERATED ALWAYS AS (
                            to_tsvector('english',
                                coalesce(title,'') || ' ' || coalesce(artist,''))
                        ) STORED
                );
                """
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS albums_fts_idx ON albums USING GIN (fts);")
        )

        # ----- artists -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS artists (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    colors TEXT[] NOT NULL DEFAULT '{}',
                    album_ids TEXT[] NOT NULL DEFAULT '{}',
                    fts TSVECTOR
                        GENERATED ALWAYS AS (
                            to_tsvector('english', coalesce(name,''))
                        ) STORED
                );
                """
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS artists_fts_idx ON artists USING GIN (fts);")
        )

        # ----- playlists -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS playlists (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                    title TEXT NOT NULL DEFAULT '',
                    colors TEXT[] NOT NULL DEFAULT '{}',
                    song_ids TEXT[] NOT NULL DEFAULT '{}'
                );
                """
            )
        )
        # Add owner_id column if missing on pre-existing table
        await conn.execute(
            text("ALTER TABLE playlists ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists(owner_id);")
        )

        # ----- listening_events -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS listening_events (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    song_id TEXT,
                    session_id TEXT NOT NULL,
                    event_type TEXT NOT NULL DEFAULT 'play',
                    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    ended_at TIMESTAMP WITH TIME ZONE,
                    duration_played_ms INTEGER NOT NULL DEFAULT 0,
                    song_duration_ms INTEGER,
                    completion_percentage INTEGER NOT NULL DEFAULT 0,
                    source TEXT,
                    source_id TEXT,
                    position_in_queue INTEGER,
                    device_type TEXT,
                    app_version TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE SET NULL
                );
                """
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_listening_events_user_started ON listening_events (user_id, started_at);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_listening_events_song_started ON listening_events (song_id, started_at);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_listening_events_session ON listening_events (session_id, started_at);")
        )

        # ----- user_sessions -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                    ended_at TIMESTAMP WITH TIME ZONE,
                    total_listening_ms BIGINT NOT NULL DEFAULT 0,
                    songs_played INTEGER NOT NULL DEFAULT 0,
                    songs_completed INTEGER NOT NULL DEFAULT 0,
                    songs_skipped INTEGER NOT NULL DEFAULT 0,
                    unique_songs INTEGER NOT NULL DEFAULT 0,
                    unique_artists INTEGER NOT NULL DEFAULT 0,
                    device_type TEXT,
                    app_version TEXT,
                    platform TEXT,
                    entry_source TEXT,
                    exit_reason TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_user_sessions_user_started ON user_sessions (user_id, started_at);")
        )

        # ----- user_likes -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_likes (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, song_id)
                );
                """
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_user_likes_user ON user_likes(user_id);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_user_likes_song ON user_likes(song_id);")
        )

    await engine.dispose()
    print("Migration complete: songs, albums, artists, playlists, listening_events, user_sessions, user_likes are ready.")


if __name__ == "__main__":
    asyncio.run(migrate())
