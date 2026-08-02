"""Health check endpoint."""
from datetime import datetime, timezone
from fastapi import APIRouter
from helpers import success_resp
from schemas import Envelope, HealthStatus

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=Envelope[HealthStatus],
    summary="Health check",
    description="Returns service status and current UTC timestamp. No authentication required.",
)
async def health():
    return success_resp(
        data={"status": "ok", "time": datetime.now(timezone.utc).isoformat()},
        message="Healthy",
    )
