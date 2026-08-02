"""Stream route: get presigned audio URL."""
from fastapi import APIRouter, Depends
from helpers import success_resp, get_current_user
from schemas import Envelope, StreamOut, UNAUTHORIZED, NOT_FOUND
from services import stream as stream_svc

router = APIRouter(tags=["stream"])


@router.get(
    "/stream/{song_id}",
    response_model=Envelope[StreamOut],
    summary="Get stream URL",
    description="Generate a time-limited presigned R2 URL for streaming a song's audio. Returns the song ID, title, artist, URL, and expiry. Requires JWT.",
    responses={**UNAUTHORIZED, **NOT_FOUND},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def stream(song_id: str, user=Depends(get_current_user)):
    data = await stream_svc.get_stream_url(song_id)
    return success_resp(data=data, message="Stream URL generated")
