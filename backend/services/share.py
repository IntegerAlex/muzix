"""Share service: validate content, get metadata, create share records."""
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from db import SessionLocal
from models import Song, Album, Artist, Playlist, Share
from helpers import serialize_song, serialize_album, serialize_artist, serialize_playlist

SHARE_EXPIRY_DAYS = 30

CONTENT_VALIDATORS = {
    "song": lambda id, session: session.get(Song, id),
    "album": lambda id, session: session.get(Album, id),
    "artist": lambda id, session: session.get(Artist, id),
    "playlist": lambda id, session: session.get(Playlist, id),
    "lyrics": lambda id, session: session.get(Song, id),
}


async def validate_content(content_type: str, content_id: str) -> bool:
    validator = CONTENT_VALIDATORS.get(content_type)
    if not validator:
        raise HTTPException(status_code=422, detail=f"Invalid content type: {content_type}")
    async with SessionLocal() as session:
        obj = await validator(content_id, session)
        if not obj:
            raise HTTPException(status_code=404, detail=f"{content_type.capitalize()} not found")
    return True


async def get_content_metadata(content_type: str, content_id: str, base_url: str = "") -> dict:
    async with SessionLocal() as session:
        if content_type == "song":
            song = await session.get(Song, content_id)
            if not song:
                raise HTTPException(status_code=404, detail="Song not found")
            metadata = serialize_song(song, base_url, brief=True)
            return {
                "title": metadata["title"],
                "artist": metadata["artist"],
                "image_url": metadata["imageUrl"],
            }
        elif content_type == "album":
            album = await session.get(Album, content_id)
            if not album:
                raise HTTPException(status_code=404, detail="Album not found")
            meta = serialize_album(album, base_url)
            return {"title": meta["title"], "artist": meta["artist"], "image_url": meta["imageUrl"]}
        elif content_type == "artist":
            artist = await session.get(Artist, content_id)
            if not artist:
                raise HTTPException(status_code=404, detail="Artist not found")
            return {"title": artist.name, "artist": "", "image_url": ""}
        elif content_type == "playlist":
            playlist = await session.get(Playlist, content_id)
            if not playlist:
                raise HTTPException(status_code=404, detail="Playlist not found")
            return {"title": playlist.title, "artist": "", "image_url": ""}
        elif content_type == "lyrics":
            song = await session.get(Song, content_id)
            if not song:
                raise HTTPException(status_code=404, detail="Song not found")
            metadata = serialize_song(song, base_url, brief=True)
            return {
                "title": metadata["title"],
                "artist": metadata["artist"],
                "image_url": metadata["imageUrl"],
            }
    raise HTTPException(status_code=422, detail=f"Invalid content type: {content_type}")


async def create_share(
    user_id: str,
    content_type: str,
    content_id: str,
    base_url: str = "",
    lyrics: list[str] | None = None,
    selected_lyrics_lines: list[int] | None = None,
) -> dict:
    if content_type not in CONTENT_VALIDATORS:
        raise HTTPException(status_code=422, detail=f"Invalid content type: {content_type}")

    async with SessionLocal() as session:
        validator = CONTENT_VALIDATORS[content_type]
        obj = await validator(content_id, session)
        if not obj:
            raise HTTPException(status_code=404, detail=f"{content_type.capitalize()} not found")

        metadata = await get_content_metadata(content_type, content_id, base_url)
        share_token = secrets.token_urlsafe(12)
        expires_at = datetime.now(timezone.utc) + timedelta(days=SHARE_EXPIRY_DAYS)

        share = Share(
            user_id=user_id,
            content_type=content_type,
            content_id=content_id,
            title=metadata["title"],
            artist=metadata.get("artist", ""),
            image_url=metadata.get("image_url", ""),
            lyrics=lyrics,
            selected_lyrics_lines=selected_lyrics_lines,
            share_token=share_token,
            expires_at=expires_at,
        )
        session.add(share)
        await session.commit()

        return {
            "share_token": share_token,
            "share_url": f"{base_url}/api/share/{share_token}",
            "content_type": content_type,
            "content_id": content_id,
            "title": metadata["title"],
            "artist": metadata.get("artist", ""),
            "image_url": metadata.get("image_url", ""),
            "expires_at": expires_at.isoformat(),
        }


async def get_share_by_token(share_token: str) -> dict | None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(Share).where(Share.share_token == share_token)
        )
        share = result.scalar_one_or_none()
        if not share:
            return None
        if share.expires_at < datetime.now(timezone.utc):
            return None
        return {
            "share_token": share.share_token,
            "share_url": f"/api/share/{share.share_token}",
            "content_type": share.content_type,
            "content_id": share.content_id,
            "title": share.title or "",
            "artist": share.artist or "",
            "image_url": share.image_url or "",
            "lyrics": share.lyrics,
            "selected_lyrics_lines": share.selected_lyrics_lines,
            "created_at": share.created_at.isoformat(),
            "expires_at": share.expires_at.isoformat(),
            "user_id": share.user_id,
        }
