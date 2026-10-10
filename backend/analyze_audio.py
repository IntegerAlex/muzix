"""
Score local audio files for energy / valence / danceability using VibeNet,
and write the results to songs.audio_energy, songs.audio_valence and
songs.danceability.

Why this exists: genre tells you how a song is marketed, not how it sounds.
A bewafa (heartbreak) banger has wedding-level energy with devastated lyrics;
audio arousal (high) fused with lyrics valence (low) resolves to Intense
instead of Happy. See services/mood.py.

Setup (import machine only — never FastAPI Cloud, never the app):
    pip install torch --index-url https://download.pytorch.org/whl/cpu
    pip install vibenet

    Install torch FIRST from the CPU index: the default PyPI torch wheel is
    a ~2GB CUDA build, while the CPU wheel is ~200MB. Installing vibenet
    second reuses the CPU torch instead of pulling CUDA.

    VibeNet (GPL-3.0, distilled EfficientNet on FMA) predicts Spotify-style
    attributes straight from raw audio: energy (= arousal), valence,
    danceability, acousticness, instrumentalness, liveness, speechiness.
    Usage: from vibenet import load_model; model.predict("song.flac")

Files: reads backend/assets/audio/*.m4a (song id = filename stem), so run
this on the machine that holds the import downloads — the same machine that
runs import_songs.py. Songs with no local file are skipped (their mood falls
back to genre + time-of-day).

Usage:
    uv run python analyze_audio.py
"""
from __future__ import annotations

import asyncio
import os
import time

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

LIMIT = 0  # 0 = all unscored rows with a local file
DRY_RUN = False  # True = score 3 files and print, write nothing
FORCE = False  # True = rescore rows that already have audio_energy


def log(severity: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    icon = {"OK": "✓", "WARN": "⚠", "ERROR": "✗", "INFO": "•"}.get(severity, " ")
    print(f"[{ts}] [{icon}] {msg}")


def _get(res: object, *names: str):
    """Read a field off VibeNet's InferenceResult defensively.

    Attribute names are not pinned by the docs, so try several spellings,
    then mapping-style access, before giving up with None.
    """
    for name in names:
        try:
            v = getattr(res, name)
            if v is not None:
                return float(v)
        except (AttributeError, TypeError, ValueError):
            pass
    try:
        as_dict = dict(res)  # type: ignore[arg-type]
        for name in names:
            if name in as_dict and as_dict[name] is not None:
                return float(as_dict[name])
    except Exception:
        pass
    return None


def _clamp01(v: float | None) -> float | None:
    if v is None:
        return None
    return max(0.0, min(1.0, v))


async def fetch_pending(audio_dir: str) -> list[dict]:
    from db import DATABASE_URL

    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    names = sorted(
        f for f in os.listdir(audio_dir)
        if f.lower().endswith((".m4a", ".mp3", ".mp4", ".flac", ".wav", ".ogg", ".opus", ".webm"))
    )
    ids = [os.path.splitext(f)[0] for f in names]
    if LIMIT > 0:
        ids = ids[:LIMIT]
    rows: list[dict] = []
    async with engine.connect() as conn:
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            q = """
                SELECT id, title, artist FROM songs WHERE id IN :ids
                  AND (audio_energy IS NULL""" + (" OR TRUE" if FORCE else "") + """)
            """
            res = await conn.execute(text(q), {"ids": tuple(chunk)})
            for r in res.all():
                rows.append({"id": r[0], "title": r[1], "artist": r[2]})
    await engine.dispose()

    by_id = {r["id"]: r for r in rows}
    out = []
    for f in names:
        sid = os.path.splitext(f)[0]
        if sid in by_id:
            out.append({**by_id[sid], "path": os.path.join(audio_dir, f)})
        if LIMIT > 0 and len(out) >= LIMIT:
            break
    return out


async def write_scores(scores: list[dict]) -> int:
    if not scores or DRY_RUN:
        return 0
    from db import DATABASE_URL

    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    async with engine.begin() as conn:
        await conn.execute(
            text("""
                UPDATE songs
                SET audio_energy = :e, audio_valence = :v, danceability = :d
                WHERE id = :id
            """),
            scores,
        )
    await engine.dispose()
    return len(scores)


def main():
    log("INFO", "=" * 55)
    log("INFO", "AUDIO MOOD ANALYSIS (VibeNet energy/valence/danceability)")
    log("INFO", "=" * 55)

    try:
        from vibenet import load_model
    except ImportError:
        log("ERROR", "vibenet not installed. Run (torch CPU first!):")
        log("ERROR", "  pip install torch --index-url https://download.pytorch.org/whl/cpu")
        log("ERROR", "  pip install vibenet")
        return

    from config import AUDIO_DIR

    if not AUDIO_DIR.exists():
        log("ERROR", f"Audio dir missing: {AUDIO_DIR}")
        return

    rows = asyncio.run(fetch_pending(str(AUDIO_DIR)))
    if not rows:
        log("OK", "No unscored songs with local audio. Nothing to do.")
        return
    if DRY_RUN:
        rows = rows[:3]
    log("INFO", f"Scoring {len(rows)} files...")

    try:
        model = load_model()
    except Exception as e:
        log("ERROR", f"Could not load VibeNet model: {e}")
        return

    scored: list[dict] = []
    for i, r in enumerate(rows, 1):
        try:
            out = model.predict(r["path"])
            res = out[0] if isinstance(out, (list, tuple)) else out
            e = _clamp01(_get(res, "energy"))
            v = _clamp01(_get(res, "valence"))
            d = _clamp01(_get(res, "danceability"))
            if e is None and v is None and d is None:
                log("WARN", f"  no usable fields for {r['id']} (result keys? {getattr(res, '__dict__', res)!r:.120})")
                continue
            scored.append({"id": r["id"], "e": e, "v": v, "d": d})
        except Exception as ex:
            log("WARN", f"  failed {r['id']}: {ex}")
        if i % 10 == 0 or i == len(rows):
            log("INFO", f"  scored {i}/{len(rows)}")

    if DRY_RUN:
        for s in scored:
            log("INFO", f"  {s['id']}: energy={s['e']} valence={s['v']} dance={s['d']}")
        log("OK", "Dry run — nothing written.")
        return

    n = asyncio.run(write_scores(scored))
    log("OK", f"Wrote audio scores for {n}/{len(rows)} songs")
    log("INFO", "=" * 55)


if __name__ == "__main__":
    main()
