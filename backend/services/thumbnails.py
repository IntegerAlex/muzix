"""Thumbnail service: fetch thumbnails from R2 and return as base64."""
import asyncio
import base64
from fastapi import HTTPException
from config import r2, R2_BUCKET


async def get_thumbnail(filename: str) -> dict:
    key = f"thumbnails/{filename}"
    try:
        obj = await asyncio.to_thread(r2.get_object, Bucket=R2_BUCKET, Key=key)
        content = await asyncio.to_thread(obj["Body"].read)
        ct = obj.get("ContentType", "image/jpeg")
        return {
            "filename": filename,
            "content_type": ct,
            "size_bytes": len(content),
            "base64": base64.b64encode(content).decode(),
        }
    except Exception:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
