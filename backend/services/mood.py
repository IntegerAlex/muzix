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


def _match_genre(top: str) -> tuple[str, str, float, float] | None:
    # Longest key first: "pop" must not shadow "punjabi pop", "hip-hop",
    # or any other compound genre that merely contains it.
    for key in sorted(GENRE_MOODS, key=len, reverse=True):
        if key in top:
            return GENRE_MOODS[key]
    return None


def _quadrant_label(arousal: float, valence: float) -> tuple[str, str]:
    if arousal >= 0.6:
        return ("Energetic", "#ec4899") if valence >= 0.55 else ("Intense", "#ef4444")
    return ("Calm", "#a855f7") if valence >= 0.55 else ("Soulful", "#f43f5e")


async def compute_mood(user_id: str) -> dict:
    """Return mood from today's plays, fusing three signals.

    Per event (newest first):
      arousal = stored audio_energy, else genre-implied energy, else time energy
      valence = stored lyrics_valence, else genre-implied valence, else 0.5
      weight  = recency decay (6h half-life) x completion boost;
                skip events vote low-valence at half weight instead.

    Label rule: the genre label wins unless stored lyrics contradict it
    (|lyrics - genre valence| > 0.3 with lyrics negative and genre positive)
    — that contradiction is exactly the "energetic but heartbroken" case,
    which resolves to the arousal/valence quadrant instead. Unknown genres
    and scoreless tracks fall back to time-of-day, never bare Neutral while
    the user actually listened.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    signals = await event_repo.get_mood_signals(user_id, today_start)
    if not signals:
        return {"label": "Neutral", "color": "#6b7280", "energy": 0.5, "valence": 0.5, "confidence": 0.0, "based_on": 0}

    t_energy, t_label, t_color = _time_energy(now.hour)

    sum_a = sum_v = sum_w = 0.0
    genre_counts: Counter = Counter()
    lyrics_vals: list[float] = []
    lyrics_w: list[float] = []
    scored_w = 0.0

    for s in signals:
        started = s["started_at"]
        hours_old = max(0.0, (now - started).total_seconds() / 3600) if started else 12.0
        decay = 0.5 ** (hours_old / 6.0)
        etype = (s["event_type"] or "play").lower()

        matched = None
        for g in _split_genres(s["genre"]):
            genre_counts[g] += 1
        if s["genre"]:
            tops = Counter({g: 1 for g in _split_genres(s["genre"])})
            if tops:
                matched = _match_genre(tops.most_common(1)[0][0])

        if etype == "skip":
            # A skip is a rejection vote, not an endorsement: low valence at
            # half weight. Arousal still counts (skipping a banger is taste).
            a = s["audio_energy"] if s["audio_energy"] is not None else (matched[2] if matched else 0.5)
            sum_a += a * decay * 0.5
            sum_v += 0.25 * decay * 0.5
            sum_w += decay * 0.5
            continue

        a = s["audio_energy"] if s["audio_energy"] is not None else (matched[2] if matched else t_energy)
        if s["lyrics_valence"] is not None:
            v = float(s["lyrics_valence"])
            lyrics_vals.append(v)
            lyrics_w.append(decay)
        elif matched:
            v = matched[3]
        else:
            v = 0.5

        completion = min(100, max(0, int(s["completion_percentage"] or 0)))
        w = decay * (1.5 if etype == "complete" else (0.6 + 0.8 * completion / 100.0))
        sum_a += a * w
        sum_v += v * w
        sum_w += w
        if s["audio_energy"] is not None or s["lyrics_valence"] is not None:
            scored_w += w

    if sum_w <= 0:
        return {"label": "Neutral", "color": "#6b7280", "energy": 0.5, "valence": 0.5, "confidence": 0.0, "based_on": len(signals)}

    arousal = sum_a / sum_w
    valence = sum_v / sum_w

    # Genre vote (longest-first) for the label, with contradiction override.
    label: str | None = None
    color: str | None = None
    g_energy = g_valence = None
    if genre_counts:
        top = genre_counts.most_common(1)[0][0]
        matched = _match_genre(top)
        if matched:
            label, color, g_energy, g_valence = matched

    if label is not None and lyrics_w:
        lyrics_mean = sum(v * w for v, w in zip(lyrics_vals, lyrics_w)) / sum(lyrics_w)
        if g_valence is not None and g_valence >= 0.55 and lyrics_mean < 0.45 and (g_valence - lyrics_mean) > 0.3:
            # Genre says happy, lyrics say heartbreak — trust the lyrics.
            label, color = _quadrant_label(arousal, lyrics_mean)
            valence = 0.7 * valence + 0.3 * lyrics_mean

    if label is None:
        if genre_counts:
            top = genre_counts.most_common(1)[0][0]
            label, color = (f"{top.title()} Mix", t_color) if len(top) < 20 else (t_label, t_color)
        else:
            # No genre signal at all (all YouTube tracks, unscored): time mood.
            energy, t_lbl, t_col = _time_energy(now.hour)
            confidence = min(1.0, len(signals) / 8.0) * 0.6
            return {
                "label": t_lbl, "color": t_col,
                "energy": round(energy, 2), "valence": round(valence, 2),
                "confidence": round(confidence, 2), "based_on": len(signals),
            }

    # Blend genre energy with time-of-day (70/30) so 2am metal reads calmer.
    energy = round((g_energy if g_energy is not None else arousal) * 0.7 + t_energy * 0.3, 2)
    concentration = genre_counts.most_common(1)[0][1] / max(1, sum(genre_counts.values()))
    scored_frac = scored_w / sum_w if sum_w > 0 else 0.0
    confidence = round(min(1.0, len(signals) / 10.0) * (0.4 + 0.6 * scored_frac) * (0.5 + 0.5 * concentration), 2)

    return {
        "label": label, "color": color,
        "energy": energy, "valence": round(valence, 2),
        "confidence": confidence, "based_on": len(signals),
    }
