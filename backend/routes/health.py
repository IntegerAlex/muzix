"""Health check endpoint."""
from datetime import datetime, timezone
from fastapi import APIRouter
from helpers import success_resp

router = APIRouter()


@router.get("/health")
async def health():
    return success_resp(
        data={"status": "ok", "time": datetime.now(timezone.utc).isoformat()},
        message="Healthy",
    )
