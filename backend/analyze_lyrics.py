"""
Score stored lyrics for valence (lyrical positivity) using a multilingual
sentiment model, and write the result to songs.lyrics_valence.

Why this exists: genre tells you how a song sounds, not how it feels. A
high-energy Punjabi track about betrayal ("bewafa") reads Happy from genre
alone; its lyrics read Negative. compute_mood() fuses the two, so the mood
resolves to the arousal/valence quadrant (Intense) instead of the genre label.

Setup (import machine only — never FastAPI Cloud, never the app):
    uv pip install transformers torch sentencepiece --extra-index-url https://download.pytorch.org/whl/cpu

    (CPU torch keeps this to ~200MB instead of a 2GB CUDA build. Batch
    inference over ~2000 lyric rows takes minutes on a modern laptop.)

Model choice:
    airzipm/sentiment-analysis-muril-v2 — MuRIL-base fine-tuned for
    Negative / Neutral / Positive on English + Hindi + Hinglish (romanized
    code-mixed). MuRIL was pre-trained on Punjabi (Gurmukhi) and on
    transliterated pairs, which matches how LRCLIB lyrics actually arrive
    (Devanagari, Gurmukhi, or Romanized). One model for everything keeps
    this a single code path; English-only catalogs may swap in a dedicated
    English model for slightly higher accuracy.

Valence mapping (expected value over the label distribution):
    0.15 * P(negative) + 0.50 * P(neutral) + 0.85 * P(positive)

Usage:
    uv run python analyze_lyrics.py
"""
from __future__ import annotations

import asyncio
import os
import re
import time

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

MODEL_ID = "airzipm/sentiment-analysis-muril-v2"
BATCH_SIZE = 32
MAX_TOKENS = 512  # MuRIL max; covers most songs substantially (first verses+chorus)
LIMIT = 0  # 0 = all unscored rows
DRY_RUN = False  # True = score 5 rows and print, write nothing
FORCE = False  # True = rescore rows that already have lyrics_valence

DEVANAGARI_RE = re.compile(r"[\u0900-\u097f]")
GURMUKHI_RE = re.compile(r"[\u0a00-\u0a7f]")


def log(severity: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    icon = {"OK": "✓", "WARN": "⚠", "ERROR": "✗", "INFO": "•"}.get(severity, " ")
    print(f"[{ts}] [{icon}] {msg}")


def detect_script(sample: str) -> str:
    if DEVANAGARI_RE.search(sample):
        return "devanagari"
    if GURMUKHI_RE.search(sample):
        return "gurmukhi"
    return "latin"


def probs_to_valence(scores: list[dict]) -> float:
    """Expected valence over the label distribution (robust to label casing)."""
    weights = {"neg": 0.15, "neu": 0.50, "pos": 0.85}
    total = 0.0
    wsum = 0.0
    for s in scores:
        label = str(s.get("label", "")).lower()
        p = float(s.get("score", 0.0))
        key = "neg" if "neg" in label else ("neu" if "neu" in label else ("pos" if "pos" in label else None))
        if key is None:
            continue
        total += weights[key] * p
        wsum += p
    if wsum <= 0:
        return 0.5
    return max(0.0, min(1.0, total / wsum))


async def fetch_pending() -> list[dict]:
    from db import DATABASE_URL

    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    async with engine.connect() as conn:
        q = """
            SELECT id, title, artist, lyrics FROM songs
            WHERE lyrics IS NOT NULL AND lyrics != ''
              AND (lyrics_valence IS NULL""" + (" OR TRUE" if FORCE else "") + """)
            ORDER BY id
        """
        if LIMIT > 0:
            q += f" LIMIT {int(LIMIT)}"
        rows = (await conn.execute(text(q))).all()
    await engine.dispose()
    return [{"id": r[0], "title": r[1], "artist": r[2], "lyrics": r[3]} for r in rows]


async def write_scores(scores: list[tuple[str, float]]) -> int:
    if not scores or DRY_RUN:
        return 0
    from db import DATABASE_URL

    engine = create_async_engine(DATABASE_URL, echo=False)
    engine.dialect.statement_cache_size = 0
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE songs SET lyrics_valence = :v WHERE id = :id"),
            [{"id": sid, "v": v} for sid, v in scores],
        )
    await engine.dispose()
    return len(scores)


def main():
    log("INFO", "=" * 55)
    log("INFO", "LYRICS VALENCE ANALYSIS (MuRIL sentiment)")
    log("INFO", "=" * 55)

    try:
        from transformers import pipeline
    except ImportError:
        log("ERROR", "transformers not installed. Run:")
        log("ERROR", "  uv pip install transformers torch sentencepiece --extra-index-url https://download.pytorch.org/whl/cpu")
        return

    rows = asyncio.run(fetch_pending())
    if not rows:
        log("OK", "No unscored lyrics. Nothing to do.")
        return
    if DRY_RUN:
        rows = rows[:5]
    log("INFO", f"Scoring {len(rows)} songs with {MODEL_ID}...")

    try:
        clf = pipeline("sentiment-analysis", model=MODEL_ID, tokenizer=MODEL_ID,
                       truncation=True, max_length=MAX_TOKENS, device=-1)
    except Exception as e:
        log("ERROR", f"Could not load model {MODEL_ID}: {e}")
        log("ERROR", "Check network (first run downloads weights) and model id.")
        return

    scored: list[tuple[str, float]] = []
    scripts: dict[str, int] = {}
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        texts = [r["lyrics"] for r in batch]
        try:
            out = clf(texts, batch_size=BATCH_SIZE, return_all_scores=True)
        except Exception as e:
            log("WARN", f"  batch {i}-{i + len(batch)} failed: {e}")
            continue
        for r, scores in zip(batch, out):
            v = probs_to_valence(scores if isinstance(scores, list) else [scores])
            scored.append((r["id"], round(v, 3)))
            scripts[detect_script(r["lyrics"][:2000])] = scripts.get(detect_script(r["lyrics"][:2000]), 0) + 1
        if (i // BATCH_SIZE + 1) % 5 == 0 or i + BATCH_SIZE >= len(rows):
            log("INFO", f"  scored {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")

    if DRY_RUN:
        for (sid, v), r in zip(scored, rows):
            log("INFO", f"  {r['artist']} – {r['title']}: valence={v}")
        log("OK", "Dry run — nothing written.")
        return

    n = asyncio.run(write_scores(scored))
    log("OK", f"Wrote lyrics_valence for {n}/{len(rows)} songs (scripts seen: {scripts})")
    log("INFO", "=" * 55)


if __name__ == "__main__":
    main()
