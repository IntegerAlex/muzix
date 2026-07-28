"""Like service: business logic for likes."""
from repositories import likes as like_repo


async def like_song(user_id: str, song_id: str) -> str:
    liked = await like_repo.add_like(user_id, song_id)
    return "liked" if liked else "already_liked"


async def unlike_song(user_id: str, song_id: str) -> str:
    removed = await like_repo.remove_like(user_id, song_id)
    return "unliked" if removed else "not_liked"


async def get_likes(user_id: str) -> dict:
    song_ids = await like_repo.get_user_likes(user_id)
    return {"songIds": song_ids}
