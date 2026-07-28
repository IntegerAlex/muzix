"""Local asset routes: serve locally downloaded songs/albums/artists."""
import json
import time
from fastapi import APIRouter, Request
from helpers import success_resp, rate_limit, colors_from_title
from config import INFO_DIR

router = APIRouter(prefix="/local")

_local_cache: dict = {"data": None, "ts": 0.0}
_CACHE_TTL = 60.0


def _load_local_songs() -> list[dict]:
    now = time.time()
    if _local_cache["data"] is not None and now - _local_cache["ts"] < _CACHE_TTL:
        return _local_cache["data"]
    if not INFO_DIR.exists():
        return []
    songs = []
    for info_file in sorted(INFO_DIR.glob("*.info.json")):
        try:
            data = json.loads(info_file.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        vid_id = data.get("id", info_file.stem.replace(".info", ""))
        title = data.get("title", "Unknown")
        artist = data.get("uploader", data.get("artist", "Unknown"))
        duration = int(data.get("duration", 0))
        album = data.get("album", data.get("uploader", artist))
        songs.append({
            "id": vid_id,
            "title": title,
            "artist": artist,
            "artistId": artist.lower().replace(" ", "-"),
            "album": album,
            "albumId": album.lower().replace(" ", "-"),
            "duration": f"{duration // 60}:{duration % 60:02d}",
            "durationMs": duration * 1000,
            "track": None,
            "lyrics": None,
            "colors": colors_from_title(title),
            "r2_object_key": None,
            "audioUrl": f"http://localhost:8000/assets/audio/{vid_id}.mp3",
            "thumbnailUrl": f"http://localhost:8000/assets/thumbnails/{vid_id}.jpg",
        })
    _local_cache["data"] = songs
    _local_cache["ts"] = now
    return songs


def _build_local_albums(songs: list[dict]) -> list[dict]:
    album_map: dict[str, dict] = {}
    for s in songs:
        aid = s["albumId"]
        if aid not in album_map:
            album_map[aid] = {
                "id": aid, "title": s["album"], "artist": s["artist"],
                "artistId": s["artistId"], "year": 2024, "genre": "Electronic",
                "colors": colors_from_title(s["album"]), "songIds": [],
            }
        album_map[aid]["songIds"].append(s["id"])
    return list(album_map.values())


def _build_local_artists(songs: list[dict]) -> list[dict]:
    artist_map: dict[str, dict] = {}
    for s in songs:
        aid = s["artistId"]
        if aid not in artist_map:
            artist_map[aid] = {
                "id": aid, "name": s["artist"],
                "colors": colors_from_title(s["artist"]), "albumIds": [],
            }
        if s["albumId"] not in artist_map[aid]["albumIds"]:
            artist_map[aid]["albumIds"].append(s["albumId"])
    return list(artist_map.values())


@router.get("/songs")
async def local_songs(request: Request):
    rate_limit(request, max_requests=30, window=60)
    return success_resp(data=_load_local_songs(), message="Local songs retrieved")


@router.get("/albums")
async def local_albums(request: Request):
    rate_limit(request, max_requests=30, window=60)
    return success_resp(data=_build_local_albums(_load_local_songs()), message="Local albums retrieved")


@router.get("/artists")
async def local_artists(request: Request):
    rate_limit(request, max_requests=30, window=60)
    return success_resp(data=_build_local_artists(_load_local_songs()), message="Local artists retrieved")


@router.get("/search")
async def local_search(request: Request, q: str = ""):
    rate_limit(request, max_requests=30, window=60)
    songs = _load_local_songs()
    if q.strip():
        ql = q.lower()
        songs = [s for s in songs if ql in s["title"].lower() or ql in s["artist"].lower()]
    return success_resp(
        data={"songs": songs, "albums": _build_local_albums(songs), "artists": _build_local_artists(songs)},
        message="Local search results",
    )
