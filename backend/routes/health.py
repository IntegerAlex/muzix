"""Health check endpoint."""
from datetime import datetime, timezone
from fastapi import APIRouter
from helpers import success_resp
from schemas import Envelope, HealthStatus
from services.recommendations import get_model_status

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=Envelope[HealthStatus],
    summary="Health check",
    description="Returns service status, current UTC timestamp, and recommendation-model readiness. No authentication required.",
)
async def health():
    return success_resp(
        data={
            "status": "ok",
            "time": datetime.now(timezone.utc).isoformat(),
            "recommendations": await get_model_status(),
        },
        message="Healthy",
    )
