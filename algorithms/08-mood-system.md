# 08 — Mood System

Genre-to-mood mapping with majority vote from today's listening activity.

- **Type**: Custom
- **File**: `backend/services/mood.py`, lines 1–54

## How it works

### 1. Genre-to-Mood Mapping (lines 8–34)

Hardcoded lookup table mapping 25 genre strings to mood labels and colors:

| Genre | Mood | Color |
|-------|------|-------|
| pop | Happy | #f59e0b |
| k-pop, dance, electronic, edm | Energetic | varies |
| rock, metal | Intense | varies |
| punk | Rebellious | #e11d48 |
| jazz | Relaxed | #8b5cf6 |
| blues, soul | Soulful | varies |
| classical, ambient | Calm | varies |
| hip-hop, rap | Confident | varies |
| rnb | Smooth | #f43f5e |
| folk, acoustic | Gentle | varies |
| country | Easy | #eab308 |
| indie | Creative | #a855f7 |
| alternative | Thoughtful | #7c3aed |
| lo-fi, reggae | Chill | varies |
| funk | Groovy | #f97316 |
| latin | Passionate | #ef4444 |

### 2. Mood Computation (`compute_mood`, lines 37–54)

```
1. Get all genres from songs played today (00:00–23:59 UTC)
2. Split compound genres on `, / &` (e.g., "rock/pop" → ["rock", "pop"])
3. Count occurrences with Counter
4. Pick the most common genre (majority vote)
5. Look up mood via substring match (key in top_genre)
6. Return label + color, or "Neutral" (#6b7280) if no match
```

**Substring match** (line 52): `if key in top` — so `"pop"` matches `"pop rock"`, `"indie pop"`, etc.

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Default mood | "Neutral" | Color: #6b7280 |
| Time window | Today (00:00–23:59 UTC) | Recomputed per request |
| Genre count | 25 genres | Hardcoded in GENRE_MOODS |

## Input → Output

- **Input**: `user_id`
- **Output**: `{label: string, color: string}` — mood label and hex color
