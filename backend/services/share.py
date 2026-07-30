"""Share service: validate content, get metadata, create share records — all in one DB session."""
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException

from db import SessionLocal
from models import Song, Album, Artist, Playlist, Share
from helpers import serialize_song, serialize_album


SHARE_EXPIRY_DAYS = 30


async def create_share(
    user_id: str,
    content_type: str,
    content_id: str,
    base_url: str = "",
    selected_lyrics_lines: list[int] | None = None,
) -> dict:
    lyrics: list[str] | None = None

    async with SessionLocal() as session:
        if content_type not in ("song", "album", "artist", "playlist", "lyrics"):
            raise HTTPException(status_code=422, detail=f"Invalid content type: {content_type}")

        if content_type == "song":
            obj = await session.get(Song, content_id)
            if not obj:
                raise HTTPException(status_code=404, detail="Song not found")
            meta = serialize_song(obj, base_url, brief=True)
            metadata = {"title": meta["title"], "artist": meta["artist"], "image_url": meta["imageUrl"]}
        elif content_type == "album":
            obj = await session.get(Album, content_id)
            if not obj:
                raise HTTPException(status_code=404, detail="Album not found")
            meta = serialize_album(obj, base_url)
            metadata = {"title": meta["title"], "artist": meta["artist"], "image_url": meta["imageUrl"]}
        elif content_type == "artist":
            obj = await session.get(Artist, content_id)
            if not obj:
                raise HTTPException(status_code=404, detail="Artist not found")
            metadata = {"title": obj.name, "artist": "", "image_url": ""}
        elif content_type == "playlist":
            obj = await session.get(Playlist, content_id)
            if not obj:
                raise HTTPException(status_code=404, detail="Playlist not found")
            metadata = {"title": obj.title, "artist": "", "image_url": ""}
        elif content_type == "lyrics":
            obj = await session.get(Song, content_id)
            if not obj:
                raise HTTPException(status_code=404, detail="Song not found")
            meta = serialize_song(obj, base_url, brief=True)
            metadata = {"title": meta["title"], "artist": meta["artist"], "image_url": meta["imageUrl"]}
            if selected_lyrics_lines and obj.lyrics:
                lines = obj.lyrics.split("\n") if isinstance(obj.lyrics, str) else obj.lyrics
                lyrics = [lines[i] for i in selected_lyrics_lines if i < len(lines)]

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
            "share_url": f"{base_url}/share/{share_token}",
            "content_type": content_type,
            "content_id": content_id,
            "title": metadata["title"],
            "artist": metadata.get("artist", ""),
            "image_url": metadata.get("image_url", ""),
            "expires_at": expires_at.isoformat(),
        }


async def get_share_by_token(share_token: str) -> dict | None:
    async with SessionLocal() as session:
        from sqlalchemy import select
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
            "share_url": f"/share/{share.share_token}",
            "content_type": share.content_type,
            "content_id": share.content_id,
            "title": share.title or "",
            "artist": share.artist or "",
            "image_url": share.image_url or "",
            "lyrics": share.lyrics,
            "selected_lyrics_lines": share.selected_lyrics_lines,
            "created_at": share.created_at.isoformat(),
            "expires_at": share.expires_at.isoformat(),
        }
