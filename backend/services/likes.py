"""Like service: business logic for likes."""
from repositories import likes as like_repo


async def like_song(user_id: str, song_id: str, meta: dict | None = None) -> str:
    # Auto-register YouTube / on-device tracks so the FK never drops a like.
    if meta:
        try:
            from repositories import songs as songs_repo

            await songs_repo.ensure_external_songs([{"id": song_id, **meta}])
        except Exception:
            pass
    else:
        try:
            from repositories import songs as songs_repo

            await songs_repo.ensure_external_songs([{"id": song_id}])
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
