"""Stream route: get presigned audio URL."""
from fastapi import APIRouter, Depends
from helpers import success_resp, get_current_user
from services import stream as stream_svc

router = APIRouter()


@router.get("/stream/{song_id}")
async def stream(song_id: str, user=Depends(get_current_user)):
    data = await stream_svc.get_stream_url(song_id)
    return success_resp(data=data, message="Stream URL generated")
