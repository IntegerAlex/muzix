"""Backfill R2: upload any local audio/thumbnail whose DB row exists but whose
R2 object is missing (fixes uploads lost to the upload_r2 botocore bug)."""
from __future__ import annotations

import asyncio
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

ASSETS = Path(__file__).parent / "assets"
AUDIO_DIR = ASSETS / "audio"
THUMB_DIR = ASSETS / "thumbnails"

R2_BUCKET = os.getenv("R2_BUCKET")
S3_ENDPOINT = (os.getenv("R2_PUBLIC_URL") or
               f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com")

r2 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
    region_name="auto",
    config=Config(signature_version="s3v4"),
)


def upload_r2(local_path: Path, key: str, content_type: str) -> bool:
    try:
        r2.head_object(Bucket=R2_BUCKET, Key=key)
        return True
    except ClientError:
        pass
    with open(local_path, "rb") as f:
        r2.put_object(Bucket=R2_BUCKET, Key=key, Body=f, ContentType=content_type)
    return True


async def main():
    from db import DATABASE_URL
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.connect() as conn:
        rows = (await conn.execute(text(
            "SELECT id, artist FROM songs ORDER BY artist"))).all()
    await engine.dispose()

    jobs = []
    missing_audio = []
    for song_id, artist in rows:
        audio = AUDIO_DIR / f"{song_id}.m4a"
        if audio.exists():
            jobs.append((audio, f"audio/{song_id}.m4a", "audio/mp4"))
        else:
            missing_audio.append((song_id, artist))
        thumb = THUMB_DIR / f"{song_id}.jpg"
        if thumb.exists():
            jobs.append((thumb, f"thumbnails/{song_id}.jpg", "image/jpeg"))

    ok = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(upload_r2, *j) for j in jobs]
        for i, f in enumerate(as_completed(futures), 1):
            f.result()
            ok += 1
            if i % 25 == 0:
                print(f"  {i}/{len(jobs)} uploaded ({time.time()-t0:.0f}s)")

    print(f"Uploaded/verified {ok}/{len(jobs)} objects in {time.time()-t0:.0f}s")
    if missing_audio:
        print("MISSING LOCAL AUDIO (no local .m4a to upload):")
        for song_id, artist in missing_audio:
            print(f"  {artist}: {song_id}")


if __name__ == "__main__":
    asyncio.run(main())
