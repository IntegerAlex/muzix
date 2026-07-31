"""Backfill song_durations from listening_events."""
import asyncio
from db import SessionLocal
from sqlalchemy import text


async def backfill():
    async with SessionLocal() as conn:
        await conn.execute(text(
            """
            INSERT INTO song_durations (id, user_id, song_id, total_ms, last_updated)
            SELECT
                gen_random_uuid(),
                le.user_id,
                le.song_id,
                COALESCE(SUM(le.duration_played_ms), 0),
                NOW()
            FROM listening_events le
            WHERE le.event_type = 'play' AND le.duration_played_ms > 0
            GROUP BY le.user_id, le.song_id
            ON CONFLICT (user_id, song_id) DO UPDATE
            SET total_ms = song_durations.total_ms + EXCLUDED.total_ms,
                last_updated = NOW()
            """
        ))
        await conn.commit()
        result = await conn.execute(text(
            "SELECT user_id, song_id, total_ms FROM song_durations ORDER BY total_ms DESC LIMIT 10"
        ))
        rows = result.all()
        for r in rows:
            print(f"  {r.user_id[:8]}... {r.song_id[:12]}... {r.total_ms}ms")
        count = await conn.execute(text("SELECT count(*) FROM song_durations"))
        print(f"Total rows: {count.scalar()}")


if __name__ == "__main__":
    asyncio.run(backfill())
