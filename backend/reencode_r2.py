"""
One-shot script: re-encode all existing MP3s in R2 to AAC 96Kbps (.m4a).

Downloads each MP3, transcodes with ffmpeg, re-uploads as .m4a,
updates the songs.r2_object_key in PostgreSQL, deletes the old MP3 from R2.

Usage:
    uv run python reencode_r2.py
    uv run python reencode_r2.py --dry-run
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.client import Config
from dotenv import load_dotenv
from sqlalchemy import text

from db import DATABASE_URL, engine

load_dotenv()

R2_BUCKET = os.getenv("R2_BUCKET")
S3_ENDPOINT = (
    os.getenv("R2_PUBLIC_URL")
    or f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com"
)

r2 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
    region_name="auto",
    config=Config(signature_version="s3v4"),
)

MAX_WORKERS = int(os.getenv("REENCODE_WORKERS", "4"))
DRY_RUN = "--dry-run" in sys.argv


def log(msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def list_mp3_keys() -> list[str]:
    """List all .mp3 keys under the audio/ prefix in R2."""
    keys = []
    log("Listing objects in R2 audio/ ...")
    paginator = r2.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=R2_BUCKET, Prefix="audio/"):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith(".mp3"):
                keys.append(obj["Key"])
    return keys


def reencode_one(old_key: str) -> dict:
    """Download an MP3 from R2, transcode to AAC, upload as .m4a."""
    song_id = old_key.split("/")[-1].replace(".mp3", "")
    new_key = old_key.replace(".mp3", ".m4a")

    tmp_in_path = None
    tmp_out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            tmp_in_path = f.name
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as f:
            tmp_out_path = f.name

        log(f"  [{song_id}] downloading ...")
        t0 = time.time()
        r2.download_file(R2_BUCKET, old_key, tmp_in_path)
        dl_time = time.time() - t0

        old_size = os.path.getsize(tmp_in_path)

        log(f"  [{song_id}] transcoding ({old_size/1024:.0f}KB) ...")
        t1 = time.time()
        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", tmp_in_path,
                "-c:a", "aac", "-b:a", "128k",
                "-map_metadata", "-1",
                tmp_out_path,
            ],
            capture_output=True, timeout=300,
        )
        enc_time = time.time() - t1
        if result.returncode != 0:
            err = result.stderr.decode(errors="replace")[-200:]
            log(f"  [{song_id}] FAIL ffmpeg: {err}")
            return {"id": song_id, "status": "FAIL", "error": err}

        new_size = os.path.getsize(tmp_out_path)
        if new_size >= old_size:
            log(f"  [{song_id}] SKIP (bigger: {old_size/1024:.0f}KB → {new_size/1024:.0f}KB)")
            os.unlink(tmp_out_path)
            return {"id": song_id, "status": "SKIP", "old_size": old_size, "new_size": new_size}

        log(f"  [{song_id}] uploading ({new_size/1024:.0f}KB) ...")
        t2 = time.time()
        r2.upload_file(
            tmp_out_path, R2_BUCKET, new_key,
            ExtraArgs={"ContentType": "audio/mp4"},
        )
        r2.delete_object(Bucket=R2_BUCKET, Key=old_key)
        ul_time = time.time() - t2

        log(
            f"  [{song_id}] OK "
            f"({old_size/1024:.0f}KB → {new_size/1024:.0f}KB, "
            f"dl={dl_time:.1f}s enc={enc_time:.1f}s ul={ul_time:.1f}s)"
        )
        return {
            "id": song_id,
            "status": "OK",
            "old_key": old_key,
            "new_key": new_key,
            "old_size": old_size,
            "new_size": new_size,
        }
    except Exception as e:
        log(f"  [{song_id}] FAIL: {e}")
        return {"id": song_id, "status": "FAIL", "error": str(e)}
    finally:
        for p in (tmp_in_path, tmp_out_path):
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass


async def update_db_keys(mappings: list[dict]):
    """Update songs.r2_object_key in PostgreSQL for all re-encoded songs."""
    if not mappings:
        return
    log(f"Updating {len(mappings)} r2_object_key values in PostgreSQL...")
    async with engine.begin() as conn:
        for m in mappings:
            await conn.execute(
                text("UPDATE songs SET r2_object_key = :new_key WHERE id = :song_id"),
                {"new_key": m["new_key"], "song_id": m["id"]},
            )
    log("Database updated.")


def main():
    log("=" * 55)
    log("R2 RE-ENCODE: MP3 → AAC 96Kbps (.m4a)")
    log("=" * 55)
    if DRY_RUN:
        log("DRY RUN — listing files only, no work done")

    keys = list_mp3_keys()
    log(f"Found {len(keys)} MP3 files")

    if not keys:
        log("Nothing to do.")
        return

    if DRY_RUN:
        total_bytes = 0
        for i, key in enumerate(keys, 1):
            size = key  # we don't have size from list, use head
            log(f"  [{i}/{len(keys)}] {key}")
        log(f"\n{len(keys)} files would be re-encoded.")
        log("Run without --dry-run to execute.")
        return

    total_before = 0
    total_after = 0
    ok = 0
    skip = 0
    fail = 0
    db_updates = []
    t_start = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(reencode_one, k): k for k in keys}
        for i, f in enumerate(as_completed(futures), 1):
            r = f.result()
            if r["status"] == "OK":
                ok += 1
                total_before += r["old_size"]
                total_after += r["new_size"]
                db_updates.append({"id": r["id"], "new_key": r["new_key"]})
            elif r["status"] == "SKIP":
                skip += 1
            else:
                fail += 1

            if i % 10 == 0 or i == len(keys):
                elapsed = time.time() - t_start
                rate = i / elapsed if elapsed else 0
                eta = (len(keys) - i) / rate if rate else 0
                log(
                    f"  PROGRESS: {i}/{len(keys)} "
                    f"(ok={ok} skip={skip} fail={fail}) "
                    f"[{elapsed:.0f}s elapsed, ~{eta:.0f}s remaining]"
                )

    if db_updates:
        asyncio.run(update_db_keys(db_updates))

    saved = total_before - total_after
    pct = (saved / total_before * 100) if total_before else 0
    elapsed = time.time() - t_start
    log("")
    log("=" * 55)
    log(f"DONE in {elapsed:.0f}s")
    log(f"  Encoded: {ok}/{len(keys)} (skip={skip} fail={fail})")
    log(f"  Before:  {total_before / 1024 / 1024:.1f} MB")
    log(f"  After:   {total_after / 1024 / 1024:.1f} MB")
    log(f"  Saved:   {saved / 1024 / 1024:.1f} MB ({pct:.1f}%)")
    log("=" * 55)


if __name__ == "__main__":
    main()
