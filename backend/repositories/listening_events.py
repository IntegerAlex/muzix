"""Listening event repository: database operations for telemetry/analytics."""
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, case
from db import SessionLocal
from models import ListeningEvent, Song, UserSession, SongDuration


async def upsert_duration(user_id: str, song_id: str, delta_ms: int) -> None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(SongDuration).where(
                SongDuration.user_id == user_id,
                SongDuration.song_id == song_id,
            )
        )
        row = result.scalar_one_or_none()
        if row:
            row.total_ms += delta_ms
            row.last_updated = datetime.now(timezone.utc)
        else:
            row = SongDuration(user_id=user_id, song_id=song_id, total_ms=delta_ms)
            session.add(row)
        await session.commit()


async def record_events(user_id: str, events: list[dict]) -> int:
    async with SessionLocal() as session:
        for e in events:
            started_at = datetime.fromisoformat(e["started_at"].replace("Z", "+00:00"))
            event = ListeningEvent(
                id=str(uuid.uuid4()),
                user_id=user_id,
                song_id=e["song_id"],
                session_id=e["session_id"],
                event_type=e.get("event_type", "play"),
                started_at=started_at,
                ended_at=datetime.fromisoformat(e["ended_at"].replace("Z", "+00:00")) if e.get("ended_at") else None,
                duration_played_ms=e.get("duration_played_ms", 0),
                song_duration_ms=e.get("song_duration_ms"),
                completion_percentage=e.get("completion_percentage", 0),
                source=e.get("source"),
                source_id=e.get("source_id"),
                position_in_queue=e.get("position_in_queue"),
                device_type=e.get("device_type", "web"),
                app_version=e.get("app_version"),
                hour_of_day=started_at.hour,
                day_of_week=started_at.weekday(),
            )
            session.add(event)
        await session.commit()
    return len(events)


def _since_from_period(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "day":
        return now - timedelta(days=1)
    elif period == "week":
        return now - timedelta(weeks=1)
    elif period == "month":
        return now - timedelta(days=30)
    elif period == "year":
        return now - timedelta(days=365)
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


def _period_bounds(period: str) -> tuple[datetime, datetime, datetime]:
    now = datetime.now(timezone.utc)
    if period == "day":
        current_since = now - timedelta(days=1)
        previous_end = current_since
        previous_since = now - timedelta(days=2)
    elif period == "week":
        current_since = now - timedelta(weeks=1)
        previous_end = current_since
        previous_since = now - timedelta(weeks=2)
    elif period == "month":
        current_since = now - timedelta(days=30)
        previous_end = current_since
        previous_since = now - timedelta(days=60)
    elif period == "year":
        current_since = now - timedelta(days=365)
        previous_end = current_since
        previous_since = now - timedelta(days=730)
    else:
        current_since = datetime(1970, 1, 1, tzinfo=timezone.utc)
        previous_end = current_since
        previous_since = datetime(1970, 1, 1, tzinfo=timezone.utc)
    return current_since, previous_since, previous_end


async def get_top_songs(user_id: str, period: str, limit: int) -> list[dict]:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.song_id,
            Song.title.label("song_title"),
            Song.artist.label("song_artist"),
            Song.artist_id.label("song_artist_id"),
            Song.album.label("song_album"),
            Song.album_id.label("song_album_id"),
            Song.duration_ms.label("song_duration_ms"),
            Song.colors.label("song_colors"),
            func.count(ListeningEvent.id).label("play_count"),
            func.coalesce(func.sum(SongDuration.total_ms), 0).label("total_ms"),
            func.count(func.distinct(ListeningEvent.session_id)).label("sessions"),
        ).select_from(
            ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id, isouter=True).outerjoin(
                SongDuration,
                (ListeningEvent.user_id == SongDuration.user_id)
                & (ListeningEvent.song_id == SongDuration.song_id),
            )
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.event_type == "play",
            ListeningEvent.started_at >= since,
        ).group_by(
            ListeningEvent.song_id, Song.title, Song.artist, Song.artist_id,
            Song.album, Song.album_id, Song.duration_ms, Song.colors,
        ).order_by(func.count(ListeningEvent.id).desc()).limit(limit)

        result = await session.execute(stmt)
        rows = result.all()

        return [
            {
                "song": {
                    "id": r.song_id,
                    "title": r.song_title,
                    "artist": r.song_artist,
                    "artistId": r.song_artist_id,
                    "album": r.song_album,
                    "albumId": r.song_album_id,
                    "duration_ms": r.song_duration_ms,
                    "colors": r.song_colors,
                } if r.song_title else {"id": r.song_id, "title": "Unknown"},
                "play_count": r.play_count,
                "total_listening_ms": r.total_ms,
                "sessions": r.sessions,
            }
            for r in rows if r.song_id
        ]


async def get_stats(user_id: str, period: str, since: datetime | None = None) -> dict:
    if since is None:
        since = _since_from_period(period)
    base_filter = (
        ListeningEvent.user_id == user_id,
        ListeningEvent.event_type == "play",
        ListeningEvent.started_at >= since,
    )
    async with SessionLocal() as session:
        stats_result = await session.execute(
            select(
                func.coalesce(func.sum(SongDuration.total_ms), 0).label("total_ms"),
                func.count(func.distinct(ListeningEvent.song_id)).label("unique_songs"),
                func.count(ListeningEvent.id).label("total_plays"),
            ).select_from(
                ListeningEvent.__table__.outerjoin(
                    SongDuration,
                    (ListeningEvent.user_id == SongDuration.user_id)
                    & (ListeningEvent.song_id == SongDuration.song_id),
                )
            ).where(*base_filter)
        )
        stats = stats_result.one()

        artists_result = await session.execute(
            select(func.count(func.distinct(Song.artist_id)))
            .select_from(ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id))
            .where(*base_filter)
        )
        unique_artists = artists_result.scalar() or 0

        sessions_result = await session.execute(
            select(func.count(func.distinct(ListeningEvent.session_id))).where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.started_at >= since,
            )
        )
        sessions = sessions_result.scalar() or 0
        total_ms = int(stats.total_ms)

        return {
            "total_ms": total_ms,
            "total_plays": stats.total_plays,
            "unique_songs": stats.unique_songs,
            "unique_artists": unique_artists,
            "sessions": sessions,
        }


async def get_recent_activity(user_id: str, limit: int, base_url: str = "") -> list[dict]:
    async with SessionLocal() as session:
        stmt = select(ListeningEvent).where(
            ListeningEvent.user_id == user_id,
        ).order_by(ListeningEvent.started_at.desc()).limit(limit)

        result = await session.execute(stmt)
        events = result.scalars().all()

        song_ids = list(set(e.song_id for e in events if e.song_id))
        songs_map = {}
        if song_ids:
            song_result = await session.execute(select(Song).where(Song.id.in_(song_ids)))
            for s in song_result.scalars().all():
                songs_map[s.id] = {
                    "id": s.id, "title": s.title, "artist": s.artist,
                    "album": s.album, "colors": s.colors,
                    "imageUrl": f"{base_url}/thumbnails/{s.id}.jpg",
                }

        items = [
            {
                "id": e.id,
                "song_id": e.song_id,
                "song": songs_map.get(e.song_id),
                "event_type": e.event_type,
                "started_at": e.started_at.isoformat(),
                "duration_played_ms": e.duration_played_ms,
                "completion_percentage": e.completion_percentage,
                "source": e.source,
            }
            for e in events
        ]
        return items


# ---------------------------------------------------------------------------
# Mood computation helpers
# ---------------------------------------------------------------------------

async def get_genres_since(user_id: str, since: datetime) -> list[str]:
    """Return genres of songs played by user since the given datetime."""
    async with SessionLocal() as session:
        stmt = (
            select(Song.genre)
            .join(ListeningEvent, ListeningEvent.song_id == Song.id)
            .where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.started_at >= since,
                Song.genre.isnot(None),
                Song.genre != "",
            )
        )
        result = await session.execute(stmt)
        return [row[0] for row in result.all()]


# ---------------------------------------------------------------------------
# Advanced analytics: skip rate
# ---------------------------------------------------------------------------

async def get_skip_rate(user_id: str, period: str, limit: int = 50) -> list[dict]:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.song_id,
            Song.title.label("song_title"),
            Song.artist.label("song_artist"),
            Song.artist_id.label("song_artist_id"),
            Song.album.label("song_album"),
            Song.duration_ms.label("song_duration_ms"),
            Song.colors.label("song_colors"),
            func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "play").label("play_count"),
            func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "skip").label("skip_count"),
        ).select_from(
            ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id, isouter=True)
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.started_at >= since,
        ).group_by(
            ListeningEvent.song_id, Song.title, Song.artist, Song.artist_id,
            Song.album, Song.duration_ms, Song.colors,
        ).order_by(func.count(ListeningEvent.id).desc()).limit(limit)

        result = await session.execute(stmt)
        rows = result.all()

        return [
            {
                "song": {
                    "id": r.song_id,
                    "title": r.song_title,
                    "artist": r.song_artist,
                    "artistId": r.song_artist_id,
                    "album": r.song_album,
                    "duration_ms": r.song_duration_ms,
                    "colors": r.song_colors,
                } if r.song_title else {"id": r.song_id, "title": "Unknown"},
                "play_count": r.play_count,
                "skip_count": r.skip_count,
                "skip_rate": round(r.skip_count / (r.play_count + r.skip_count), 4) if (r.play_count + r.skip_count) > 0 else 0,
            }
            for r in rows if r.song_id
        ]


# ---------------------------------------------------------------------------
# Advanced analytics: completion rate
# ---------------------------------------------------------------------------

async def get_completion_rate(user_id: str, period: str, limit: int = 50) -> list[dict]:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.song_id,
            Song.title.label("song_title"),
            Song.artist.label("song_artist"),
            Song.artist_id.label("song_artist_id"),
            Song.album.label("song_album"),
            Song.duration_ms.label("song_duration_ms"),
            Song.colors.label("song_colors"),
            func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "play").label("play_count"),
            func.avg(ListeningEvent.completion_percentage).label("avg_completion"),
        ).select_from(
            ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id, isouter=True)
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.started_at >= since,
        ).group_by(
            ListeningEvent.song_id, Song.title, Song.artist, Song.artist_id,
            Song.album, Song.duration_ms, Song.colors,
        ).order_by(func.avg(ListeningEvent.completion_percentage).desc()).limit(limit)

        result = await session.execute(stmt)
        rows = result.all()

        return [
            {
                "song": {
                    "id": r.song_id,
                    "title": r.song_title,
                    "artist": r.song_artist,
                    "artistId": r.song_artist_id,
                    "album": r.song_album,
                    "duration_ms": r.song_duration_ms,
                    "colors": r.song_colors,
                } if r.song_title else {"id": r.song_id, "title": "Unknown"},
                "play_count": r.play_count,
                "avg_completion_percentage": round(r.avg_completion or 0, 1),
                "completion_rate": round((r.avg_completion or 0) / 100, 4),
            }
            for r in rows if r.song_id
        ]


# ---------------------------------------------------------------------------
# Advanced analytics: discovery metrics
# ---------------------------------------------------------------------------

async def get_discovery_metrics(user_id: str, period: str) -> dict:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        first_play_sq = (
            select(
                ListeningEvent.song_id.label("song_id"),
                func.min(ListeningEvent.started_at).label("first_play"),
            )
            .where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.event_type == "play",
            )
            .group_by(ListeningEvent.song_id)
            .subquery()
        )

        stmt = select(
            func.count(ListeningEvent.id).label("total_plays"),
            func.count(func.distinct(ListeningEvent.song_id)).label("unique_songs"),
            func.count(ListeningEvent.id).filter(
                ListeningEvent.started_at == first_play_sq.c.first_play
            ).label("first_time_plays"),
        ).select_from(
            ListeningEvent.__table__.outerjoin(
                first_play_sq,
                ListeningEvent.song_id == first_play_sq.c.song_id,
            )
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.event_type == "play",
            ListeningEvent.started_at >= since,
        )

        result = await session.execute(stmt)
        row = result.one()
        total_plays = row.total_plays or 0
        unique_songs = row.unique_songs or 0
        first_time_plays = row.first_time_plays or 0
        repeat_plays = total_plays - first_time_plays

        return {
            "period": period,
            "total_plays": total_plays,
            "unique_songs": unique_songs,
            "first_time_plays": first_time_plays,
            "repeat_plays": repeat_plays,
            "discovery_ratio": round(first_time_plays / total_plays, 4) if total_plays > 0 else 0,
            "repeat_play_ratio": round(repeat_plays / total_plays, 4) if total_plays > 0 else 0,
        }


# ---------------------------------------------------------------------------
# Advanced analytics: artist affinity scoring
# ---------------------------------------------------------------------------

async def get_artist_affinity(user_id: str, period: str, limit: int = 50) -> list[dict]:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stmt = select(
            Song.artist.label("artist"),
            Song.artist_id.label("artist_id"),
            func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "play").label("plays"),
            func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "complete").label("completions"),
            func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "skip").label("skips"),
            func.count(func.distinct(ListeningEvent.song_id)).label("unique_songs"),
        ).select_from(
            ListeningEvent.__table__.join(Song, ListeningEvent.song_id == Song.id)
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.started_at >= since,
        ).group_by(Song.artist, Song.artist_id).order_by(func.count(ListeningEvent.id).desc()).limit(limit)

        result = await session.execute(stmt)
        rows = result.all()

        return [
            {
                "artist": r.artist,
                "artist_id": r.artist_id,
                "plays": r.plays,
                "completions": r.completions,
                "skips": r.skips,
                "unique_songs": r.unique_songs,
                "affinity_score": round(
                    (r.plays or 0) * 1.0 + (r.completions or 0) * 0.5 + (r.unique_songs or 0) * 2.0 - (r.skips or 0) * 0.5,
                    2,
                ),
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Advanced analytics: listening patterns (time-of-day, day-of-week)
# ---------------------------------------------------------------------------

async def get_listening_patterns(user_id: str, period: str) -> dict:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        hourly_stmt = select(
            ListeningEvent.hour_of_day,
            func.count(ListeningEvent.id).label("plays"),
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.event_type == "play",
            ListeningEvent.started_at >= since,
        ).group_by(ListeningEvent.hour_of_day).order_by(ListeningEvent.hour_of_day)

        hourly_result = await session.execute(hourly_stmt)
        hourly_rows = hourly_result.all()
        hourly = {r.hour_of_day: r.plays for r in hourly_rows if r.hour_of_day is not None}
        for h in range(24):
            if h not in hourly:
                hourly[h] = 0

        daily_stmt = select(
            ListeningEvent.day_of_week,
            func.count(ListeningEvent.id).label("plays"),
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.event_type == "play",
            ListeningEvent.started_at >= since,
        ).group_by(ListeningEvent.day_of_week).order_by(ListeningEvent.day_of_week)

        daily_result = await session.execute(daily_stmt)
        daily_rows = daily_result.all()
        daily = {r.day_of_week: r.plays for r in daily_rows if r.day_of_week is not None}
        for d in range(7):
            if d not in daily:
                daily[d] = 0

        peak_hours = sorted(hourly.keys(), key=lambda h: hourly[h], reverse=True)[:3]
        peak_days = sorted(daily.keys(), key=lambda d: daily[d], reverse=True)[:3]

        return {
            "period": period,
            "hourly": hourly,
            "daily": daily,
            "peak_hours": peak_hours,
            "peak_days": peak_days,
        }


# ---------------------------------------------------------------------------
# Advanced analytics: trend analysis (MoM/WoW)
# ---------------------------------------------------------------------------

async def get_trend_analysis(user_id: str, period: str) -> dict:
    current_since, previous_since, previous_end = _period_bounds(period)

    current = await get_stats(user_id, period, since=current_since)
    previous = await get_stats(user_id, period, since=previous_since)

    def pct_change(current_val: float, previous_val: float) -> float:
        if previous_val == 0:
            return 100.0 if current_val > 0 else 0.0
        return round((current_val - previous_val) / previous_val * 100, 1)

    return {
        "period": period,
        "current": current,
        "previous": previous,
        "pct_change": {
            "total_ms": pct_change(current["total_ms"], previous["total_ms"]),
            "total_plays": pct_change(current["total_plays"], previous["total_plays"]),
            "unique_songs": pct_change(current["unique_songs"], previous["unique_songs"]),
            "unique_artists": pct_change(current["unique_artists"], previous["unique_artists"]),
            "sessions": pct_change(current["sessions"], previous["sessions"]),
        },
    }


# ---------------------------------------------------------------------------
# Advanced analytics: catalog exploration
# ---------------------------------------------------------------------------

async def get_catalog_exploration(user_id: str, period: str) -> dict:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stats = await session.execute(
            select(
                func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "play").label("total_plays"),
                func.count(func.distinct(ListeningEvent.song_id)).label("unique_songs"),
            ).where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.started_at >= since,
            )
        )
        row = stats.one()
        total_plays = row.total_plays or 0
        unique_songs = row.unique_songs or 0

        catalog_count = await session.execute(select(func.count(Song.id)))
        total_catalog_songs = catalog_count.scalar() or 0

        repeat_plays = total_plays - unique_songs

        return {
            "period": period,
            "total_plays": total_plays,
            "unique_songs": unique_songs,
            "total_catalog_songs": total_catalog_songs,
            "exploration_ratio": round(unique_songs / total_catalog_songs, 4) if total_catalog_songs > 0 else 0,
            "repeat_play_ratio": round(repeat_plays / total_plays, 4) if total_plays > 0 else 0,
        }


# ---------------------------------------------------------------------------
# Advanced analytics: queue drop-off analysis
# ---------------------------------------------------------------------------

async def get_queue_dropoff(user_id: str, period: str) -> dict:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        skip_positions = await session.execute(
            select(ListeningEvent.position_in_queue)
            .where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.event_type == "skip",
                ListeningEvent.position_in_queue.is_not(None),
                ListeningEvent.started_at >= since,
            )
        )
        positions = [r.position_in_queue for r in skip_positions.all()]

        if not positions:
            return {
                "period": period,
                "avg_skip_position": 0,
                "total_skips": 0,
                "dropoff_by_position": {},
            }

        dropoff_by_position: dict[int, int] = {}
        for p in positions:
            dropoff_by_position[p] = dropoff_by_position.get(p, 0) + 1

        return {
            "period": period,
            "avg_skip_position": round(sum(positions) / len(positions), 1),
            "total_skips": len(positions),
            "dropoff_by_position": dict(sorted(dropoff_by_position.items())),
        }


# ---------------------------------------------------------------------------
# Advanced analytics: source effectiveness
# ---------------------------------------------------------------------------

async def get_source_effectiveness(user_id: str, period: str) -> dict:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stmt = select(
            ListeningEvent.source,
            func.count(ListeningEvent.id).label("plays"),
            func.avg(ListeningEvent.completion_percentage).label("avg_completion"),
            func.avg(ListeningEvent.duration_played_ms).label("avg_duration_ms"),
        ).where(
            ListeningEvent.user_id == user_id,
            ListeningEvent.started_at >= since,
            ListeningEvent.source.is_not(None),
        ).group_by(ListeningEvent.source).order_by(func.count(ListeningEvent.id).desc())

        result = await session.execute(stmt)
        rows = result.all()

        sources = {}
        for r in rows:
            completion_rate = (r.avg_completion or 0) / 100
            engagement_score = round(completion_rate * (r.plays or 0), 2)
            sources[r.source] = {
                "plays": r.plays,
                "completion_rate": round(completion_rate, 4),
                "avg_duration_ms": round(r.avg_duration_ms or 0, 1),
                "engagement_score": engagement_score,
            }

        return {
            "period": period,
            "sources": sources,
        }


# ---------------------------------------------------------------------------
# Advanced analytics: binge index
# ---------------------------------------------------------------------------

async def get_binge_index(user_id: str, period: str) -> dict:
    since = _since_from_period(period)
    async with SessionLocal() as session:
        stats = await session.execute(
            select(
                func.count(ListeningEvent.id).filter(ListeningEvent.event_type == "play").label("total_plays"),
                func.count(func.distinct(ListeningEvent.session_id)).label("total_sessions"),
            ).where(
                ListeningEvent.user_id == user_id,
                ListeningEvent.started_at >= since,
            )
        )
        row = stats.one()
        total_plays = row.total_plays or 0
        total_sessions = row.total_sessions or 0

        session_starts = await session.execute(
            select(UserSession.started_at)
            .where(
                UserSession.user_id == user_id,
                UserSession.started_at >= since,
            ).order_by(UserSession.started_at)
        )
        starts = [r.started_at for r in session_starts.all()]

        avg_session_gap_hours = 0.0
        if len(starts) >= 2:
            gaps = [(starts[i] - starts[i - 1]).total_seconds() / 3600 for i in range(1, len(starts))]
            avg_session_gap_hours = sum(gaps) / len(gaps)

        songs_per_session = round(total_plays / total_sessions, 2) if total_sessions > 0 else 0
        binge_index = round(songs_per_session * (1 / avg_session_gap_hours), 4) if avg_session_gap_hours > 0 else 0

        return {
            "period": period,
            "total_plays": total_plays,
            "total_sessions": total_sessions,
            "songs_per_session": songs_per_session,
            "avg_session_gap_hours": round(avg_session_gap_hours, 2),
            "binge_index": binge_index,
        }
