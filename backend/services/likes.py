"""Like service: business logic for likes."""
from fastapi import HTTPException

from repositories import likes as like_repo


async def like_song(user_id: str, song_id: str, meta: dict | None = None) -> str:
    # Never auto-create from a bare id: typos and attacker-chosen ids would
    # permanently pollute the catalog/search as "Unknown" rows.
    if meta is None:
        from repositories import songs as songs_repo

        if await songs_repo.get_song(song_id) is None:
            raise HTTPException(status_code=404, detail="Song not found")
    else:
        try:
            from repositories import songs as songs_repo

            await songs_repo.ensure_external_songs([{"id": song_id, **meta}])
        except Exception:
            pass
    liked = await like_repo.add_like(user_id, song_id)
    return "liked" if liked else "already_liked"


async def unlike_song(user_id: str, song_id: str) -> str:
    removed = await like_repo.remove_like(user_id, song_id)
    return "unliked" if removed else "not_liked"


async def get_likes(user_id: str) -> dict:
    song_ids = await like_repo.get_user_likes(user_id)
    return {"songIds": song_ids}
