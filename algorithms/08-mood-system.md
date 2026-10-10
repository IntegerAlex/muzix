# 08 — Mood System

Genre-to-mood mapping fused with stored audio/lyrics affect scores and
behavior signals (v3). Genre alone cannot feel a song — see below.

- **Type**: Custom
- **File**: `backend/services/mood.py`
- **Signals table**: `repositories/listening_events.py::get_mood_signals`
- **Score producers**: `backend/analyze_lyrics.py` (MuRIL sentiment → `songs.lyrics_valence`), `backend/analyze_audio.py` (VibeNet energy/valence/danceability → `songs.audio_energy`, `songs.audio_valence`, `songs.danceability`)

## Why genre alone fails

Genre is marketing metadata, not feeling. A "bewafa" (heartbreak) track has
wedding-level energy — dhol, 130+ BPM — over devastated lyrics; genre reads
"punjabi pop" and says Happy. A meme song ("Careless Whisper") reads smooth
jazz while its meaning is a 40-year-old joke. Content analysis can't catch
memes at all — only behavior (replays, skips) can.

The fix is Russell's circumplex: every song gets **arousal** (energy, from
audio) and **valence** (positivity, from lyrics), fused per event.

| | Lyrics positive | Lyrics negative |
|---|---|---|
| **High-energy audio** | Happy / Energetic | **Angry / Intense** ← the bewafa fix |
| **Low-energy audio** | Calm / Relaxed | Sad / Soulful |

## How it works

### 1. Score tables (precomputed at import, never at request time)

| Column | Producer | Range | Fallback when NULL |
|---|---|---|---|
| `audio_energy` | VibeNet (`analyze_audio.py`) | 0–1 | genre-implied energy, else time energy |
| `audio_valence` | VibeNet | 0–1 | (kept for future use; fusion uses lyrics) |
| `danceability` | VibeNet | 0–1 | unused by mood v3 (reserved) |
| `lyrics_valence` | MuRIL sentiment (`analyze_lyrics.py`) | 0–1 | genre-implied valence, else 0.5 |

FastAPI Cloud cannot run torch/transformers, so inference happens once per
song on the import machine; request-time mood is one SQL query + arithmetic.

### 3. YouTube / on-device tracks (`backend/enrich_youtube.py`)

On-device tracks arrive with no genre, no lyrics, and no scores — the fusion
above would see only behavior + time. The enrich script fills the same
columns the studio pipeline does, with free keyless sources:

| Gap | Source | Notes |
|---|---|---|
| genre | iTunes Search API | 3s spacing (~20 req/min limit); only fills empty genres |
| lyrics | LRCLIB search, duration-matched ±5s | also fixes the player (patchLyrics 404s without it) |
| lyrics_valence | affect lexicon (English + romanized Hindi/Punjabi) | heuristic v0; MuRIL output overwrites the same column |

Rows are selected by `r2_object_key IS NULL` (never imported). Nothing here
touches catalog rows that already have genre/lyrics, and the fusion code
needs no changes — enriched rows flow through `get_mood_signals` untouched.

### 2. Per-event fusion (`compute_mood`)

```
1. Fetch today's events with song scores (get_mood_signals, newest first)
2. Per event:
     arousal = audio_energy ?? genre energy ?? time energy
     valence = lyrics_valence ?? genre valence ?? 0.5
     weight  = recency decay (6h half-life) x completion boost
               (complete = 1.5x; play/pause/seek scale 0.6–1.4 by completion)
     skip events vote valence 0.25 at half weight (rejection, not endorsement)
3. Aggregate weighted means -> (arousal, valence)
4. Label: genre label wins UNLESS stored lyrics contradict it
   (|lyrics - genre valence| > 0.3, lyrics negative, genre positive)
   -> then the quadrant label (e.g. Intense for high/low)
5. Unknown/unscored tracks -> time-of-day fallback, never bare Neutral
6. Confidence = min(1, events/10) x (0.4 + 0.6 x scored-weight-fraction)
   x (0.5 + 0.5 x genre concentration)
```

**Substring match**: longest key first — `"pop"` never shadows `"punjabi pop"`.

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Default mood | "Neutral" | Color: #6b7280, only when zero plays today |
| Time window | Today (00:00–23:59 UTC) | Recomputed per request |
| Genre count | ~45 genres | Each with (label, color, energy, valence) |
| Recency half-life | 6h | `0.5 ** (hours_old / 6)` |
| Contradiction threshold | 0.3 | \|lyrics − genre valence\| with lyrics < 0.45, genre ≥ 0.55 |
| Quadrant cutoffs | arousal 0.6, valence 0.55 | (Energetic \| Intense / Calm \| Soulful) |

## Input → Output

- **Input**: `user_id`
- **Output**: `{label, color, energy, valence, confidence, based_on}`
