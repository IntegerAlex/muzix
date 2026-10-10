# 08 — Mood System

Genre-to-mood mapping with majority vote from today's listening activity,
blended with time-of-day energy and confidence scoring (v2).

- **Type**: Custom
- **File**: `backend/services/mood.py`

## How it works

### 1. Genre-to-Mood Mapping

Hardcoded lookup table mapping ~45 genre strings to
`(mood label, color, energy 0-1, valence 0-1)`:

| Genre | Mood | Color |
|-------|------|-------|
| pop | Happy | #f59e0b |
| k-pop, dance, electronic, edm, house | Energetic | varies |
| techno, dubstep, rock, metal, drill | Intense | varies |
| punk | Rebellious | #e11d48 |
| jazz | Relaxed | #8b5cf6 |
| blues, soul | Soulful | varies |
| classical, ambient | Calm | varies |
| hip-hop, rap, trap | Confident | varies |
| rnb, r&b | Smooth | #f43f5e |
| folk, acoustic | Gentle | varies |
| country | Easy | #eab308 |
| indie | Creative | #a855f7 |
| alternative | Thoughtful | #7c3aed |
| lo-fi, lofi, reggae | Chill | varies |
| funk | Groovy | #f97316 |
| latin | Passionate | #ef4444 |
| desi, bollywood, punjabi, bhangra | Festive / Energetic | varies |
| trance, hyperpop, synthwave, phonk | Euphoric / Nostalgic / Dark / Chaotic | varies |
| gospel | Uplifted | #f59e0b |
| kids, comedy | Playful | #fbbf24 |

### 2. Mood Computation (`compute_mood`)

```
1. Get all genres from songs played today (00:00–23:59 UTC)
2. Split compound genres on `, / & ; |` (e.g. "rock/pop" → ["rock", "pop"])
3. Count occurrences with Counter
4. If no genre signal but plays exist → time-of-day fallback
   (Awake / Energetic / Focused / Unwinding / Chill / Late Night)
5. If genre unknown → "{Genre} Mix" label with time color, or time fallback
6. Else blend genre energy 70% + time energy 30%
7. Confidence = min(1, plays/10) * (0.5 + 0.5 * concentration)
8. Return label + color + energy + valence + confidence + based_on
```

**Substring match**: `if key in top` — so `"pop"` matches `"pop rock"`, `"indie pop"`, etc.

**YouTube tracks**: genre is often empty (on-device extraction has no genre).
They still count toward `based_on` and confidence, and the time fallback
keeps the card alive instead of Neutral.

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Default mood | "Neutral" | Color: #6b7280, only when zero plays today |
| Time window | Today (00:00–23:59 UTC) | Recomputed per request |
| Genre count | ~45 genres | Hardcoded in GENRE_MOODS with energy/valence |
| Energy blend | 70% genre + 30% time | So 2am metal reads calmer than noon metal |

## Input → Output

- **Input**: `user_id`
- **Output**: `{label, color, energy, valence, confidence, based_on}`
