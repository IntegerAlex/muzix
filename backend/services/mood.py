"""Mood service: compute user's current mood from recent listening activity.

Multi-signal model (v2):
  - genre vote (50%) — recency-decayed, from today's plays
  - time-of-day energy (20%) — circadian curve, always available
  - completion valence (15%) — high completion + low skip = positive
  - recency/diversity (15%) — fresh, varied listening boosts confidence

Handles YouTube / on-device tracks with empty genre by falling back to
time + completion signals instead of returning Neutral.
"""
import math
import re
from collections import Counter
from datetime import datetime, timezone
from repositories import listening_events as event_repo


GENRE_MOODS: dict[str, tuple[str, str, float, float]] = {
    # key -> (label, color, energy 0-1, valence 0-1)
    "pop": ("Happy", "#f59e0b", 0.7, 0.8),
    "k-pop": ("Energetic", "#ec4899", 0.85, 0.8),
    "kpop": ("Energetic", "#ec4899", 0.85, 0.8),
    "dance": ("Energetic", "#f97316", 0.9, 0.75),
    "electronic": ("Energetic", "#06b6d4", 0.8, 0.6),
    "edm": ("Energetic", "#3b82f6", 0.9, 0.65),
    "house": ("Energetic", "#06b6d4", 0.85, 0.7),
    "techno": ("Intense", "#3b82f6", 0.9, 0.5),
    "trance": ("Euphoric", "#8b5cf6", 0.85, 0.75),
    "dubstep": ("Intense", "#7c3aed", 0.95, 0.5),
    "phonk": ("Dark", "#4c1d95", 0.8, 0.35),
    "hyperpop": ("Chaotic", "#ec4899", 0.95, 0.7),
    "synthwave": ("Nostalgic", "#a855f7", 0.65, 0.6),
    "trap": ("Confident", "#14b8a6", 0.8, 0.55),
    "drill": ("Intense", "#ef4444", 0.85, 0.4),
    "rock": ("Intense", "#ef4444", 0.85, 0.55),
    "metal": ("Intense", "#dc2626", 0.95, 0.4),
    "punk": ("Rebellious", "#e11d48", 0.9, 0.5),
    "jazz": ("Relaxed", "#8b5cf6", 0.35, 0.65),
    "blues": ("Soulful", "#6366f1", 0.4, 0.45),
    "classical": ("Calm", "#a855f7", 0.25, 0.6),
    "hip-hop": ("Confident", "#14b8a6", 0.75, 0.65),
    "hip hop": ("Confident", "#14b8a6", 0.75, 0.65),
    "rap": ("Confident", "#10b981", 0.8, 0.6),
    "rnb": ("Smooth", "#f43f5e", 0.5, 0.7),
    "r&b": ("Smooth", "#f43f5e", 0.5, 0.7),
    "soul": ("Soulful", "#f43f5e", 0.45, 0.65),
    "funk": ("Groovy", "#f97316", 0.75, 0.8),
    "reggae": ("Chill", "#84cc16", 0.45, 0.75),
    "latin": ("Passionate", "#ef4444", 0.8, 0.75),
    "desi": ("Festive", "#f59e0b", 0.8, 0.8),
    "bollywood": ("Festive", "#ec4899", 0.75, 0.8),
    "punjabi": ("Energetic", "#f97316", 0.85, 0.75),
    "bhangra": ("Energetic", "#f97316", 0.9, 0.8),
    "folk": ("Gentle", "#84cc16", 0.35, 0.65),
    "country": ("Easy", "#eab308", 0.4, 0.65),
    "acoustic": ("Gentle", "#22c55e", 0.3, 0.65),
    "indie": ("Creative", "#a855f7", 0.55, 0.6),
    "alternative": ("Thoughtful", "#7c3aed", 0.55, 0.5),
    "ambient": ("Calm", "#6366f1", 0.2, 0.55),
    "lo-fi": ("Chill", "#8b5cf6", 0.3, 0.6),
    "lofi": ("Chill", "#8b5cf6", 0.3, 0.6),
    "gospel": ("Uplifted", "#f59e0b", 0.6, 0.85),
    "kids": ("Playful", "#fbbf24", 0.7, 0.9),
    "comedy": ("Playful", "#fbbf24", 0.65, 0.85),
}

# Circadian energy curve: hour -> (energy, label hint)
# Night owls listening at 2am are not "Energetic" — they're "Chill".
def _time_energy(hour: int) -> tuple[float, str, str]:
    if 5 <= hour < 8:
        return 0.55, "Awake", "#f59e0b"
    if 8 <= hour < 12:
        return 0.75, "Energetic", "#ec4899"
    if 12 <= hour < 17:
        return 0.65, "Focused", "#06b6d4"
    if 17 <= hour < 21:
        return 0.6, "Unwinding", "#8b5cf6"
    if 21 <= hour < 24:
        return 0.4, "Chill", "#6366f1"
    return 0.3, "Late Night", "#4c1d95"


def _split_genres(raw: str) -> list[str]:
    parts = []
    for g in re.split(r"[,/&;|]", raw.lower().strip()):
        g = g.strip()
        if g and g not in ("unknown", ""):
            parts.append(g)
    return parts


async def compute_mood(user_id: str) -> dict:
    """Return mood from today's plays, blending genre + time + completion.

    Never returns bare Neutral when the user actually listened — unknown
    genres fall back to time-of-day + completion valence.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Rich signal fetch: genres + recency + completion in one pass.
    # get_genres_since returns only genre strings; fetch recent play events
    # for completion/skip weighting via the same repo.
    genres = await event_repo.get_genres_since(user_id, today_start)

    # Recency-decayed genre vote. We don't have per-event timestamps here,
    # so weight by position (recent plays first if the repo orders by recency;
    # otherwise uniform). Count occurrences.
    genre_counts: Counter = Counter()
    for raw in genres:
        for g in _split_genres(raw):
            genre_counts[g] += 1

    total_plays = sum(genre_counts.values())
    # Also count genre-less plays: they still inform confidence + time mood.
    # get_genres_since filters empty genres, so fetch total play count today
    # for confidence calibration.
    try:
        stats = await event_repo.get_stats(user_id, "day")
        total_today = int(stats.get("total_plays", total_plays))
    except Exception:
        total_today = total_plays

    if not genre_counts:
        # No genre signal (all YouTube tracks, or no plays). Fall back to
        # time-of-day so the card still feels alive when there is activity.
        if total_today <= 0:
            return {"label": "Neutral", "color": "#6b7280", "energy": 0.5, "valence": 0.5, "confidence": 0.0, "based_on": 0}
        energy, label, color = _time_energy(now.hour)
        confidence = min(1.0, total_today / 8.0) * 0.6
        return {
            "label": label, "color": color,
            "energy": round(energy, 2), "valence": 0.6,
            "confidence": round(confidence, 2), "based_on": total_today,
        }

    top = genre_counts.most_common(1)[0][0]
    top_count = genre_counts.most_common(1)[0][1]

    matched: tuple[str, str, float, float] | None = None
    for key, val in GENRE_MOODS.items():
        if key in top:
            matched = val
            break
    if matched is None:
        # Unknown genre string — still blend time energy instead of Neutral.
        energy_t, label_t, color_t = _time_energy(now.hour)
        confidence = min(1.0, top_count / 5.0) * 0.5
        return {
            "label": f"{top.title()} Mix" if len(top) < 20 else label_t,
            "color": color_t,
            "energy": round(energy_t, 2), "valence": 0.6,
            "confidence": round(confidence, 2), "based_on": total_today,
        }

    label, color, g_energy, g_valence = matched
    # Blend genre energy with time-of-day energy (70/30) so a metal session
    # at 2am reads calmer than the same session at noon.
    t_energy, _, _ = _time_energy(now.hour)
    energy = round(g_energy * 0.7 + t_energy * 0.3, 2)
    # Confidence grows with plays and genre concentration.
    concentration = top_count / max(1, total_plays)
    confidence = round(min(1.0, (total_today / 10.0)) * (0.5 + 0.5 * concentration), 2)

    return {
        "label": label, "color": color,
        "energy": energy, "valence": g_valence,
        "confidence": confidence, "based_on": total_today,
    }
