"""Stream service: generate presigned R2 URLs for audio streaming."""
from fastapi import HTTPException
from config import r2, R2_BUCKET
from repositories import songs as song_repo


async def get_stream_url(song_id: str) -> dict:
    song = await song_repo.get_song(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    key = song.r2_object_key
    if not key:
        raise HTTPException(status_code=404, detail="Song has no R2 object key")
    try:
        url = r2.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": key},
            ExpiresIn=3600,
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to generate stream URL")
    return {
        "id": str(song.id),
        "title": song.title,
        "artist": song.artist,
        "url": url,
        "expires_in": 3600,
    }
