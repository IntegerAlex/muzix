"""
Muzix database migration.

Creates all tables (idempotent — safe to run repeatedly).

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

# Bump when the schema changes. migrate() runs all DDL below only when the
# recorded version is older, then records the new version atomically — so a
# normal restart costs one round-trip (~1s) instead of a full DDL pass.
MIGRATION_VERSION = 2


async def _current_version(conn) -> int:
    """Return the recorded schema version (0 when never migrated)."""
    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
    )
    row = (await conn.execute(text("SELECT MAX(version) FROM schema_migrations"))).scalar()
    return row or 0


async def migrate() -> None:
    url = _async_url(os.getenv("DATABASE_URL", ""))
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        current = await _current_version(conn)
        if current >= MIGRATION_VERSION:
            print(f"Migration up-to-date (version {current}). Skipping.")
            return

        # ----- users (must be first — referenced by FKs) -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    display_name TEXT NOT NULL DEFAULT ''
                );
                """
            )
        )

        # ----- refresh_tokens -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL UNIQUE,
                    family_id TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    is_revoked BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);")
        )
        # Fix legacy TEXT is_revoked column → BOOLEAN (idempotent)
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'refresh_tokens'::regclass
                    AND attname = 'is_revoked'
                    AND atttypid = 'text'::regtype
                ) THEN
                    ALTER TABLE refresh_tokens
                        ALTER COLUMN is_revoked DROP DEFAULT,
                        ALTER COLUMN is_revoked TYPE BOOLEAN USING (is_revoked = '1'),
                        ALTER COLUMN is_revoked SET DEFAULT FALSE;
                END IF;
            END $$;
        """))

        # ----- pg_trgm for fuzzy search -----
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON artists USING gin (name gin_trgm_ops);")
        )

        # ----- songs -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS songs (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL DEFAULT '',
                    artist TEXT NOT NULL DEFAULT '',
                    artist_id TEXT,
                    album TEXT NOT NULL DEFAULT '',
                    album_id TEXT,
                    duration TEXT NOT NULL DEFAULT '',
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    track INTEGER,
                    lyrics TEXT,
                    r2_object_key TEXT,
                    colors TEXT[] NOT NULL DEFAULT '{}',
                    fts TSVECTOR
                );
                """
            )
        )
        await conn.execute(
            text(
                """
                ALTER TABLE songs
                    ADD COLUMN IF NOT EXISTS artist_id TEXT,
                    ADD COLUMN IF NOT EXISTS album_id TEXT,
                    ADD COLUMN IF NOT EXISTS track INTEGER,
                    ADD COLUMN IF NOT EXISTS genre TEXT NOT NULL DEFAULT '',
                    ADD COLUMN IF NOT EXISTS lyrics TEXT,
                    ADD COLUMN IF NOT EXISTS colors TEXT[] NOT NULL DEFAULT '{}';
                """
            )
        )
        # Convert computed fts to plain TSVECTOR if it still exists as computed
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'songs'::regclass AND attname = 'fts'
                    AND attgenerated = 's'
                ) THEN
                    DROP INDEX IF EXISTS songs_fts_idx;
                    ALTER TABLE songs DROP COLUMN fts;
                    ALTER TABLE songs ADD COLUMN fts TSVECTOR;
                END IF;
            END $$;
        """))
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS songs_fts_idx ON songs USING GIN (fts);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs(artist_id);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_songs_album_id ON songs(album_id);")
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
                );
                """
            )
        )
        # Convert computed fts to plain TSVECTOR first (must precede DROP artist)
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'albums'::regclass AND attname = 'fts'
                    AND attgenerated = 's'
                ) THEN
                    DROP INDEX IF EXISTS albums_fts_idx;
                    ALTER TABLE albums DROP COLUMN fts;
                    ALTER TABLE albums ADD COLUMN fts TSVECTOR;
                END IF;
            END $$;
        """))
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS albums_fts_idx ON albums USING GIN (fts);")
        )
        # Drop denormalized artist column (safe now that fts is plain TSVECTOR)
        await conn.execute(text("ALTER TABLE albums DROP COLUMN IF EXISTS artist;"))
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums(artist_id);")
        )

        # ----- artists -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS artists (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    colors TEXT[] NOT NULL DEFAULT '{}',
                    fts TSVECTOR
                );
                """
            )
        )
        # Drop denormalized album_ids column if it still exists
        await conn.execute(text("ALTER TABLE artists DROP COLUMN IF EXISTS album_ids;"))
        # Convert computed fts to plain TSVECTOR if still computed
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'artists'::regclass AND attname = 'fts'
                    AND attgenerated = 's'
                ) THEN
                    DROP INDEX IF EXISTS artists_fts_idx;
                    ALTER TABLE artists DROP COLUMN fts;
                    ALTER TABLE artists ADD COLUMN fts TSVECTOR;
                END IF;
            END $$;
        """))
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS artists_fts_idx ON artists USING GIN (fts);")
        )
        # Add FK constraint on album.artist_id if not present
        await conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'albums_artist_id_fkey'
                ) THEN
                    ALTER TABLE albums ADD CONSTRAINT albums_artist_id_fkey
                        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL;
                END IF;
            END $$;
        """))

        # ----- song_artists (many-to-many junction) -----
        await conn.execute(
            text("""
                CREATE TABLE IF NOT EXISTS song_artists (
                    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (song_id, artist_id)
                );
            """)
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_song_artists_artist ON song_artists(artist_id);")
        )

        # ----- FTS trigger functions -----
        # Drop old triggers/functions first (idempotent)
        await conn.execute(text("DROP TRIGGER IF EXISTS trg_song_fts ON songs;"))
        await conn.execute(text("DROP TRIGGER IF EXISTS trg_album_fts ON albums;"))
        await conn.execute(text("DROP TRIGGER IF EXISTS trg_artist_fts ON artists;"))
        await conn.execute(text("DROP FUNCTION IF EXISTS update_song_fts();"))
        await conn.execute(text("DROP FUNCTION IF EXISTS update_album_fts();"))
        await conn.execute(text("DROP FUNCTION IF EXISTS update_artist_fts();"))

        await conn.execute(text("""
            CREATE FUNCTION update_song_fts() RETURNS trigger AS $$
            BEGIN
                NEW.fts := to_tsvector('english',
                    coalesce(NEW.title, '') || ' ' ||
                    coalesce(NEW.artist, '') || ' ' ||
                    coalesce(NEW.album, '')
                );
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))
        await conn.execute(text("""
            CREATE FUNCTION update_album_fts() RETURNS trigger AS $$
            DECLARE
                artist_name TEXT;
            BEGIN
                SELECT COALESCE(name, '') INTO artist_name FROM artists WHERE id = NEW.artist_id;
                NEW.fts := to_tsvector('english',
                    coalesce(NEW.title, '') || ' ' || artist_name
                );
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))
        await conn.execute(text("""
            CREATE FUNCTION update_artist_fts() RETURNS trigger AS $$
            BEGIN
                NEW.fts := to_tsvector('english', coalesce(NEW.name, ''));
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))

        # Attach triggers
        await conn.execute(text("""
            CREATE TRIGGER trg_song_fts
            BEFORE INSERT OR UPDATE OF title, artist, album ON songs
            FOR EACH ROW EXECUTE FUNCTION update_song_fts();
        """))
        await conn.execute(text("""
            CREATE TRIGGER trg_album_fts
            BEFORE INSERT OR UPDATE OF title, artist_id ON albums
            FOR EACH ROW EXECUTE FUNCTION update_album_fts();
        """))
        await conn.execute(text("""
            CREATE TRIGGER trg_artist_fts
            BEFORE INSERT OR UPDATE OF name ON artists
            FOR EACH ROW EXECUTE FUNCTION update_artist_fts();
        """))

        # Backfill fts only for rows whose fts is stale / NULL. Rows are also
        # maintained by the triggers above, so this is a no-op on restarts of a
        # populated DB — avoiding a full-table to_tsvector() scan on every boot.
        await conn.execute(text("""
            UPDATE songs SET fts = to_tsvector('english',
                coalesce(title, '') || ' ' ||
                coalesce(artist, '') || ' ' ||
                coalesce(album, '')
            ) WHERE fts IS NULL;
        """))
        await conn.execute(text("""
            UPDATE albums a SET fts = to_tsvector('english',
                coalesce(a.title, '') || ' ' || coalesce(ar.name, '')
            ) FROM artists ar WHERE ar.id = a.artist_id AND a.fts IS NULL;
        """))
        await conn.execute(text("""
            UPDATE artists SET fts = to_tsvector('english', coalesce(name, ''))
            WHERE fts IS NULL;
        """))

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
        await conn.execute(
            text("ALTER TABLE playlists ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists(owner_id);")
        )

        # ----- playlist_songs (association table) -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS playlist_songs (
                    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL DEFAULT 0,
                    added_at TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (playlist_id, song_id)
                );
                """
            )
        )

        # ----- listening_events -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS listening_events (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    song_id TEXT REFERENCES songs(id) ON DELETE SET NULL,
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
                    app_version TEXT
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
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_listening_events_user_event_started ON listening_events (user_id, event_type, started_at);")
        )
        await conn.execute(
            text("ALTER TABLE listening_events ADD COLUMN IF NOT EXISTS hour_of_day INTEGER;")
        )
        await conn.execute(
            text("ALTER TABLE listening_events ADD COLUMN IF NOT EXISTS day_of_week INTEGER;")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_listening_events_hour ON listening_events (hour_of_day);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_listening_events_dow ON listening_events (day_of_week);")
        )

        # ----- user_sessions -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
                    exit_reason TEXT
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

        # ----- song_durations (persistent per-user listening time accumulator) -----
        await conn.execute(text("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'song_durations_song_id_fkey'
                ) THEN
                    ALTER TABLE song_durations DROP CONSTRAINT song_durations_song_id_fkey;
                END IF;
            END $$;
        """))
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS song_durations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    song_id TEXT NOT NULL,
                    total_ms BIGINT NOT NULL DEFAULT 0,
                    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, song_id)
                );
                """
            )
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_song_durations_user ON song_durations(user_id);")
        )

        # ----- shares -----
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS shares (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    content_type TEXT NOT NULL,
                    content_id TEXT NOT NULL,
                    title TEXT,
                    artist TEXT,
                    image_url TEXT,
                    lyrics TEXT,
                    selected_lyrics_lines INTEGER[],
                    share_token TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL
                );
                """
            )
        )
        await conn.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_token ON shares(share_token);")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);")
        )

        # Record the applied version atomically with all DDL above.
        await conn.execute(
            text("INSERT INTO schema_migrations (version) VALUES (:v)"),
            {"v": MIGRATION_VERSION},
        )

    await engine.dispose()
    print(f"Migration complete: all tables ready (version {MIGRATION_VERSION}).")


if __name__ == "__main__":
    asyncio.run(migrate())
