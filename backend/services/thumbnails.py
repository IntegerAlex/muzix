"""Thumbnail service: fetch thumbnails from R2 and return raw bytes."""
import asyncio
from fastapi import HTTPException
from config import r2, R2_BUCKET

MAX_THUMB_BYTES = 5 * 1024 * 1024  # 5MB limit


async def get_thumbnail(filename: str) -> tuple[bytes, str]:
    key = f"thumbnails/{filename}"
    try:
        obj = await asyncio.to_thread(r2.get_object, Bucket=R2_BUCKET, Key=key)
        content_length = obj.get("ContentLength", 0)
        if content_length and content_length > MAX_THUMB_BYTES:
            raise HTTPException(status_code=413, detail="Thumbnail too large")
        content = await asyncio.to_thread(obj["Body"].read)
        if len(content) > MAX_THUMB_BYTES:
            raise HTTPException(status_code=413, detail="Thumbnail too large")
        ct = obj.get("ContentType", "image/jpeg")
        return content, ct
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
