"""
SQLAlchemy ORM models for Muzix (PostgreSQL).

Matches the frontend data contract in services/types.ts:
  Song, Album, Artist, Playlist.

`colors` is a 2-tuple of hex strings used to render gradient covers (no remote
images). `song_ids` / `album_ids` are array references between entities.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Table, Text, ARRAY, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import relationship

from db import Base


# Junction table for song <> artist many-to-many (collaborations)
song_artists_table = Table(
    "song_artists", Base.metadata,
    Column("song_id", String(64), ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True),
    Column("artist_id", String(64), ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True),
    Column("position", Integer, nullable=False, default=0),
)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True)
    family_id = Column(String(64), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_revoked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(320), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    display_name = Column(String(256), nullable=False, default="")

    def to_dict(self):
        return {"id": self.id, "email": self.email, "displayName": self.display_name}


class UserLike(Base):
    __tablename__ = "user_likes"
    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    song_id = Column(String(64), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    __table_args__ = (UniqueConstraint('user_id', 'song_id', name='uq_user_song_like'),)


class Share(Base):
    __tablename__ = "shares"
    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content_type = Column(String(20), nullable=False)
    content_id = Column(String(64), nullable=False)
    title = Column(String(255), nullable=True)
    artist = Column(String(255), nullable=True)
    image_url = Column(String(512), nullable=True)
    lyrics = Column(Text, nullable=True)
    selected_lyrics_lines = Column(ARRAY(Integer), nullable=True)
    share_token = Column(String(20), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)

    user = relationship("User", backref="shares")


class Song(Base):
    __tablename__ = "songs"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(512), nullable=False, default="")
    artist = Column(String(512), nullable=False, default="")
    artist_id = Column(String(64), ForeignKey("artists.id", ondelete="SET NULL"), nullable=True, index=True)
    album = Column(String(512), nullable=False, default="")
    album_id = Column(String(64), ForeignKey("albums.id", ondelete="SET NULL"), nullable=True, index=True)
    duration = Column(String(16), nullable=False, default="")
    duration_ms = Column(Integer, nullable=False, default=0)
    track = Column(Integer, nullable=True)
    genre = Column(String(128), nullable=False, default="")
    lyrics = Column(Text, nullable=True)
    r2_object_key = Column(String(1024), nullable=True)
    colors = Column(ARRAY(Text), nullable=False, server_default="{}")
    fts = Column(TSVECTOR, nullable=True)

    artists = relationship("Artist", secondary=song_artists_table, backref="song_artists",
                           order_by=song_artists_table.c.position)


class Album(Base):
    __tablename__ = "albums"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(512), nullable=False, default="")
    artist_id = Column(String(64), ForeignKey("artists.id", ondelete="SET NULL"), nullable=True, index=True)
    year = Column(Integer, nullable=False, default=0)
    genre = Column(String(128), nullable=False, default="")
    colors = Column(ARRAY(Text), nullable=False, server_default="{}")
    song_ids = Column(ARRAY(Text), nullable=False, server_default="{}")
    fts = Column(TSVECTOR, nullable=True)

    artist_rel = relationship("Artist", back_populates="albums", foreign_keys=[artist_id])


class Artist(Base):
    __tablename__ = "artists"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(512), nullable=False, default="")
    colors = Column(ARRAY(Text), nullable=False, server_default="{}")
    fts = Column(TSVECTOR, nullable=True)

    songs = relationship("Song", backref="artist_rel", foreign_keys="Song.artist_id")
    albums = relationship("Album", back_populates="artist_rel", foreign_keys="Album.artist_id")


# Association table for playlist songs (defined before Playlist for clarity)
playlist_songs_table = Table(
    "playlist_songs", Base.metadata,
    Column("playlist_id", String(64), ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True),
    Column("song_id", String(64), ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True),
    Column("position", Integer, nullable=False, default=0),
    Column("added_at", DateTime(timezone=True), default=datetime.utcnow),
)


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(512), nullable=False, default="")
    colors = Column(ARRAY(Text), nullable=False, server_default="{}")
    song_ids = Column(ARRAY(Text), nullable=False, server_default="{}")

    # Relationships
    songs = relationship("Song", secondary=playlist_songs_table, backref="playlists")


class ListeningEvent(Base):
    """Individual play event for telemetry/analytics."""
    __tablename__ = "listening_events"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    song_id = Column(String(64), ForeignKey("songs.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id = Column(String(64), nullable=False, index=True)

    # Playback details
    started_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_played_ms = Column(Integer, default=0)
    song_duration_ms = Column(Integer, nullable=True)
    completion_percentage = Column(Integer, default=0)

    # Event type
    event_type = Column(String(32), nullable=False, default="play")

    # Context
    source = Column(String(32), nullable=True)
    source_id = Column(String(64), nullable=True)
    position_in_queue = Column(Integer, nullable=True)

    # Device/session context
    device_type = Column(String(32), nullable=True)
    app_version = Column(String(32), nullable=True)

    # Time-based analytics (derived from started_at for indexing)
    hour_of_day = Column(Integer, nullable=True, index=True)
    day_of_week = Column(Integer, nullable=True, index=True)

    # Relationships
    user = relationship("User", backref="listening_events")
    song = relationship("Song", backref="listening_events")

    # Indexes for common queries
    __table_args__ = (
        Index("ix_listening_events_user_started", "user_id", "started_at"),
        Index("ix_listening_events_user_event_started", "user_id", "event_type", "started_at"),
        Index("ix_listening_events_song_started", "song_id", "started_at"),
        Index("ix_listening_events_session", "session_id", "started_at"),
    )


class UserSession(Base):
    """User listening session for engagement metrics."""
    __tablename__ = "user_sessions"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    started_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    # Session metrics
    total_listening_ms = Column(BigInteger, default=0)
    songs_played = Column(Integer, default=0)
    songs_completed = Column(Integer, default=0)
    songs_skipped = Column(Integer, default=0)
    unique_songs = Column(Integer, default=0)
    unique_artists = Column(Integer, default=0)

    # Context
    device_type = Column(String(32), nullable=True)
    app_version = Column(String(32), nullable=True)
    platform = Column(String(32), nullable=True)

    # Entry/exit points
    entry_source = Column(String(32), nullable=True)
    exit_reason = Column(String(32), nullable=True)

    # Relationships
    user = relationship("User", backref="sessions")

    __table_args__ = (
        Index("ix_user_sessions_user_started", "user_id", "started_at"),
    )


class SongDuration(Base):
    """Accumulated listening duration per user per song."""
    __tablename__ = "song_durations"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    song_id = Column(String(64), nullable=False, index=True)
    total_ms = Column(BigInteger, default=0, nullable=False)
    last_updated = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "song_id", name="uq_user_song_duration"),
        Index("idx_song_durations_user", "user_id"),
    )
