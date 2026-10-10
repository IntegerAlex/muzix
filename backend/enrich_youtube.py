"""
Enrich auto-registered YouTube tracks so mood fusion sees them.

YouTube / on-device tracks arrive in `songs` via telemetry auto-registration
with only id/title/artist — no genre, no lyrics, no affect scores. The mood
fusion in services/mood.py reads those columns generically, so filling them
is all it takes; no fusion changes needed.

For each unscored YouTube row (r2_object_key IS NULL = never imported):
  1. Genre      <- iTunes Search API (free, no key) by title+artist
  2. Lyrics     <- LRCLIB search API (free, no key), duration-matched +/-5s
  3. Valence    <- tiny affect lexicon over the lyrics (English + romanized
                   Hindi/Punjabi). Heuristic v0 — deliberately swappable:
                   MuRIL output writes the SAME column, so a future
                   analyze_lyrics.py pass simply overwrites these values.

Only fills empty fields (unless FORCE=1). Never touches catalog rows that
already have genre/lyrics. Lyrics also fix the player: patchLyrics() 404s
today for YouTube tracks, but finds them once this script has run.

Usage:
    uv run python enrich_youtube.py
"""
from __future__ import annotations

import asyncio
import os
import re
import time
import urllib.parse
import urllib.request
import json

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

LIMIT = 0  # 0 = all eligible rows
DRY_RUN = False  # True = print what would change, write nothing
FORCE = False  # True = refill genre/lyrics even when present (valence only when NULL)
ITUNES_SLEEP_S = 3.0  # iTunes allows ~20 req/min; stay well under it

REQUIRED_COLUMNS = ("lyrics_valence",)

ITUNES_URL = "https://itunes.apple.com/search"
LRCLIB_SEARCH_URL = "https://lrclib.net/api/search"
LRCLIB_GET_URL = "https://lrclib.net/api/get"

# --- Heuristic affect lexicon (v0) -------------------------------------------
# Small, dependency-free, deliberately transparent. English + romanized
# Hindi/Punjabi as LRCLIB lyrics actually arrive. MuRIL output supersedes
# this wherever present (we never overwrite a non-NULL lyrics_valence).
NEGATIVE_WORDS = frozenset("""
sad lonely lonely lonely cry crying tears tear goodbye bye heartbreak broken pain
hurt hurting alone lonely miss missing hate hate lost lose lonely darkness dark
 Bewafa bewafai bewafa bewafai dard dardaan dhokha dhokhebaaz dhokha rona ronna
ronde hanju hanju judai judai vichhoda vichhore bichhda maut mar gham gham udaas
tanhai tanhaiya dard dard bhull gaye bewafa bewafai bewafa bewafa bewafa
dishonest cheat cheated betray betrayed bewafa bewafai bewafai bewafa
""".lower().split())

POSITIVE_WORDS = frozenset("""
happy joy joyful celebrate celebration dance dancing nach nachda nachdi khushi
khush khushiyan pyaar pyaar mohabbat ishq ishq love loving jashn jashan masti
masti party part vibrant shine shining bright beautiful jeet jeeteya winner fun
enjoy hass hassde hasa hasna khush khushi khushiyan nach nacho nachde nachdi
""".lower().split())


def log(severity: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    icon = {"OK": "✓", "WARN": "⚠", "ERROR": "✗", "INFO": "•"}.get(severity, " ")
    print(f"[{ts}] [{icon}] {msg}", flush=True)


def _eta(t0: float, done: int, total: int) -> str:
    el = time.time() - t0
    if done <= 0:
        return f"{el:.0f}s elapsed"
    rate = el / done
    return f"{el:.0f}s elapsed, ~{rate * (total - done):.0f}s left ({rate:.1f}s/song)"


def _http_json(url: str, params: dict, timeout: int = 15):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{url}?{qs}",
        headers={"User-Agent": "muzix-enrich/1.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8", "replace"))


def lexicon_valence(lyrics: str) -> float:
    """Heuristic 0-1 valence from affect word hits, Laplace-smoothed.

    v0 quality bar is "better than 0.5 for everything", not "as good as a
    transformer". Calibrate against analyze_lyrics.py output when available.
    """
    words = re.findall(r"[a-z\u0900-\u097f\u0a00-\u0a7f]+", lyrics.lower())
    if not words:
        return 0.5
    pos = sum(1 for w in words if w in POSITIVE_WORDS)
    neg = sum(1 for w in words if w in NEGATIVE_WORDS)
    # +5 smoothing so short/no-hit lyrics stay near neutral instead of 0/1.
    return round(max(0.0, min(1.0, 0.5 + 0.5 * (pos - neg) / (pos + neg + 5))), 3)


def itunes_genre(title: str, artist: str) -> str | None:
    try:
        data = _http_json(ITUNES_URL, {
            "term": f"{title} {artist}", "media": "music",
            "entity": "song", "limit": 5,
        })
    except Exception as e:
        log("WARN", f"  iTunes lookup failed: {e}")
        return None
    for r in data.get("results", []) or []:
        g = (r.get("primaryGenreName") or "").strip()
        if g:
            return g[:128]
    return None


def lrclib_lyrics(title: str, artist: str, duration_ms: int) -> str | None:
    """Best-effort plain lyrics. Prefers a duration-matched hit (+/-5s)
    so remixes/covers with the same title don't poison the row."""
    try:
        hits = _http_json(LRCLIB_SEARCH_URL, {"q": f"{title} {artist}"})
    except Exception as e:
        log("WARN", f"  LRCLIB search failed: {e}")
        return None
    if not isinstance(hits, list) or not hits:
        return None

    def dur_of(h: dict) -> int | None:
        try:
            return int(float(h.get("duration") or 0) * 1000)
        except (TypeError, ValueError):
            return None

    ranked = []
    for h in hits:
        if not isinstance(h, dict) or h.get("instrumental"):
            continue
        d = dur_of(h)
        penalty = 0 if not duration_ms or d is None else abs(d - duration_ms)
        ranked.append((penalty, h))
    ranked.sort(key=lambda t: t[0])
    for penalty, h in ranked:
        if duration_ms and penalty > 5000:
            continue
        plain = (h.get("plainLyrics") or "").strip()
        if plain:
            return plain
        # Search hit without embedded lyrics: resolve via /get.
        try:
            g = _http_json(LRCLIB_GET_URL, {
                "track_name": h.get("trackName") or title,
                "artist_name": h.get("artistName") or artist,
            })
            if isinstance(g, dict) and not g.get("instrumental"):
                plain = (g.get("plainLyrics") or "").strip()
                if plain:
                    return plain
        except Exception:
            continue
    return None


async def ensure_columns() -> bool:
    """Fail fast when migration v3 hasn't run, instead of tracebacks."""
    from db import DATABASE_URL

    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'songs'
        """))
        have = {r[0] for r in res.all()}
    await engine.dispose()
    missing = [c for c in REQUIRED_COLUMNS if c not in have]
    if missing:
        log("ERROR", f"songs table is missing columns: {missing}")
        log("ERROR", "Run the v3 migration first: uv run python migrate.py")
        return False
    return True


async def fetch_pending() -> list[dict]:
    from db import DATABASE_URL

    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    async with engine.connect() as conn:
        rows = (await conn.execute(text("""
            SELECT id, title, artist, genre, lyrics, lyrics_valence, duration_ms
            FROM songs
            WHERE r2_object_key IS NULL
              AND (genre = '' OR lyrics IS NULL OR lyrics = '')
            ORDER BY id
        """))).all()
    await engine.dispose()
    out = [
        {"id": r[0], "title": r[1] or "", "artist": r[2] or "",
         "genre": r[3] or "", "lyrics": r[4],
         "has_valence": r[5] is not None, "duration_ms": r[6] or 0}
        for r in rows
    ]
    return out[:LIMIT] if LIMIT > 0 else out


async def write_row(row: dict) -> None:
    from db import DATABASE_URL

    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    sets = []
    params: dict = {"id": row["id"]}
    if row.get("genre"):
        sets.append("genre = :genre")
        params["genre"] = row["genre"]
    if row.get("lyrics"):
        sets.append("lyrics = :lyrics")
        params["lyrics"] = row["lyrics"]
    if row.get("lyrics_valence") is not None:
        sets.append("lyrics_valence = :lyrics_valence")
        params["lyrics_valence"] = row["lyrics_valence"]
    if not sets:
        return
    async with engine.begin() as conn:
        await conn.execute(
            text(f"UPDATE songs SET {', '.join(sets)} WHERE id = :id"), params)
    await engine.dispose()


def main():
    log("INFO", "=" * 55)
    log("INFO", "YOUTUBE ENRICHMENT (iTunes genre + LRCLIB lyrics + lexicon)")
    log("INFO", "=" * 55)

    if not asyncio.run(ensure_columns()):
        return

    rows = asyncio.run(fetch_pending())
    if not rows:
        log("OK", "No unenriched YouTube tracks. Nothing to do.")
        return
    log("INFO", f"Enriching {len(rows)} tracks (~{len(rows) * (ITUNES_SLEEP_S + 1):.0f}s expected, mostly iTunes spacing)...")

    done = {"genre": 0, "lyrics": 0, "valence": 0}
    skipped = 0
    t0 = time.time()
    for i, r in enumerate(rows, 1):
        update: dict = {"id": r["id"]}
        song_label = f"{r['artist']} – {r['title']}" if r['artist'] else r['title']
        try:
            if (not r["genre"] or FORCE) and r["title"]:
                g = itunes_genre(r["title"], r["artist"])
                time.sleep(ITUNES_SLEEP_S)
                if g:
                    update["genre"] = g
                    done["genre"] += 1
            if (not r["lyrics"] or FORCE) and r["title"]:
                lyrics = lrclib_lyrics(r["title"], r["artist"], r["duration_ms"])
                if lyrics:
                    update["lyrics"] = lyrics
                    done["lyrics"] += 1
            lyrics_text = update.get("lyrics", r["lyrics"])
            if lyrics_text and (not r["has_valence"] or FORCE):
                update["lyrics_valence"] = lexicon_valence(lyrics_text)
                done["valence"] += 1
            parts = []
            if update.get("genre"):
                parts.append(f"genre={update['genre']}")
            if update.get("lyrics"):
                parts.append(f"lyrics={len(update['lyrics'])}ch")
            if update.get("lyrics_valence") is not None:
                parts.append(f"valence={update['lyrics_valence']}")
            if DRY_RUN:
                log("INFO", f"  [{i}/{len(rows)}] {song_label}: preview={ {k: (str(v)[:40]) for k, v in update.items() if k != 'id'} }")
            elif len(update) > 1:
                asyncio.run(write_row(update))
                log("INFO", f"  [{i}/{len(rows)}] {song_label}: {', '.join(parts) if parts else 'no change'}")
            else:
                skipped += 1
                log("INFO", f"  [{i}/{len(rows)}] {song_label}: skipped (already enriched)")
        except Exception as e:
            log("WARN", f"  [{i}/{len(rows)}] {song_label}: failed: {e}")
        if i % 10 == 0 or i == len(rows):
            log("INFO", f"  progress {i}/{len(rows)} | genre={done['genre']} lyrics={done['lyrics']} valence={done['valence']} skipped={skipped} | {_eta(t0, i, len(rows))}")

    log("OK", f"Done in {time.time() - t0:.0f}s: genre={done['genre']} lyrics={done['lyrics']} valence={done['valence']} skipped={skipped}")
    if DRY_RUN:
        log("OK", "Dry run — nothing written.")
    log("INFO", "=" * 55)


if __name__ == "__main__":
    main()
