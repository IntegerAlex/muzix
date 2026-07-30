"""Mood service: compute user's current mood from today's listening activity."""
import re
from collections import Counter
from datetime import datetime, timezone, timedelta
from repositories import listening_events as event_repo


GENRE_MOODS: dict[str, tuple[str, str]] = {
    "pop": ("Happy", "#f59e0b"),
    "k-pop": ("Energetic", "#ec4899"),
    "dance": ("Energetic", "#f97316"),
    "electronic": ("Energetic", "#06b6d4"),
    "edm": ("Energetic", "#3b82f6"),
    "rock": ("Intense", "#ef4444"),
    "metal": ("Intense", "#dc2626"),
    "punk": ("Rebellious", "#e11d48"),
    "jazz": ("Relaxed", "#8b5cf6"),
    "blues": ("Soulful", "#6366f1"),
    "classical": ("Calm", "#a855f7"),
    "hip-hop": ("Confident", "#14b8a6"),
    "rap": ("Confident", "#10b981"),
    "rnb": ("Smooth", "#f43f5e"),
    "folk": ("Gentle", "#84cc16"),
    "country": ("Easy", "#eab308"),
    "acoustic": ("Gentle", "#22c55e"),
    "indie": ("Creative", "#a855f7"),
    "alternative": ("Thoughtful", "#7c3aed"),
    "ambient": ("Calm", "#6366f1"),
    "lo-fi": ("Chill", "#8b5cf6"),
    "soul": ("Soulful", "#f43f5e"),
    "funk": ("Groovy", "#f97316"),
    "reggae": ("Chill", "#84cc16"),
    "latin": ("Passionate", "#ef4444"),
}


async def compute_mood(user_id: str) -> dict:
    """Return mood derived from genres of songs played today (00:00–23:59 UTC)."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    genres = await event_repo.get_genres_since(user_id, today_start)
    genre_counts: Counter = Counter()
    for raw in genres:
        for g in re.split(r"[,/&]", raw.lower().strip()):
            g = g.strip()
            if g and g not in ("unknown", ""):
                genre_counts[g] += 1
    if not genre_counts:
        return {"label": "Neutral", "color": "#6b7280"}
    top = genre_counts.most_common(1)[0][0]
    for key, (label, color) in GENRE_MOODS.items():
        if key in top:
            return {"label": label, "color": color}
    return {"label": "Neutral", "color": "#6b7280"}
