import asyncio
"""
Muzix FastAPI backend.

Run locally:
    uv run python migrate.py
    uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
import logging
import orjson
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.exceptions import HTTPException

logger = logging.getLogger("muzix")

from config import AUDIO_DIR, THUMB_DIR
from middleware import SecurityMiddleware
from helpers import success_resp
from db import engine
from services.recommendations import _ensure_model as _train_recommendation_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_train_recommendation_model())
    yield
    await engine.dispose()


# --- App ---
app = FastAPI(title="Muzix API", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

# --- Middleware ---
app.add_middleware(SecurityMiddleware)

# --- Static files (dev only) ---
from fastapi.staticfiles import StaticFiles
if AUDIO_DIR.exists():
    app.mount("/assets/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")
if THUMB_DIR.exists():
    app.mount("/assets/thumbnails", StaticFiles(directory=str(THUMB_DIR)), name="thumbnails")


# --- Exception handlers ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    status_code = exc.status_code
    if status_code >= 500:
        body = {"status": "exception", "data": [], "message": exc.detail or "Internal server error", "meta": {}}
    elif status_code == 304:
        body = {"status": "failed", "data": [], "message": "Not Modified", "meta": {}}
    else:
        body = {"status": "failed", "data": [], "message": exc.detail or "Failed", "meta": {}}
    return Response(content=orjson.dumps(body), media_type="application/json", status_code=status_code, headers=exc.headers)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    body = {"status": "exception", "data": [], "message": "Internal server error", "meta": {}}
    return Response(content=orjson.dumps(body), media_type="application/json", status_code=500)


# --- Routes ---
from routes.health import router as health_router
from routes.auth import router as auth_router
from routes.songs import router as songs_router
from routes.albums import router as albums_router
from routes.artists import router as artists_router
from routes.playlists import router as playlists_router
from routes.likes import router as likes_router
from routes.stream import router as stream_router
from routes.thumbnails import router as thumbnails_router
from routes.search import router as search_router
from routes.local import router as local_router
from routes.telemetry import router as telemetry_router
from routes.analytics import router as analytics_router
from routes.recommendations import router as recommendations_router
from routes.share import router as share_router

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(songs_router)
app.include_router(albums_router)
app.include_router(artists_router)
app.include_router(playlists_router)
app.include_router(likes_router)
app.include_router(stream_router)
app.include_router(thumbnails_router)
app.include_router(search_router)
app.include_router(local_router)
app.include_router(telemetry_router)
app.include_router(analytics_router)
app.include_router(recommendations_router)
app.include_router(share_router, prefix="/api/share", tags=["share"])
