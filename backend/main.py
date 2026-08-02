"""
Muzix FastAPI backend.

Run locally:
    uv run python migrate.py
    uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
import asyncio
import logging
import orjson
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import Response
from fastapi.exceptions import HTTPException
import logfire

logger = logging.getLogger("muzix")

STARTUP_TRAIN_TIMEOUT_S = 20

from config import AUDIO_DIR, THUMB_DIR
from middleware import SecurityMiddleware
from helpers import success_resp
from db import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    from migrate import migrate as run_migrate
    from services.recommendations import train_model

    # Migrations must complete before DB-backed routes can serve (they would
    # otherwise raise TableNotFoundError). With the WHERE fts IS NULL backfill
    # guard in migrate.py this is O(1) DDL on restart — fast enough to block.
    await run_migrate()

    # Recommendation training is the real startup bottleneck (ALS fit on the
    # interaction matrix can take tens of seconds). Run it in the background,
    # time-boxed, so the app reaches "startup complete" immediately. Existing
    # fallbacks (get_recommendations -> _get_cached_popular) serve until warm.
    async def _train():
        try:
            await asyncio.wait_for(train_model(), timeout=STARTUP_TRAIN_TIMEOUT_S)
        except asyncio.TimeoutError:
            logger.warning("Recommendation training timed out; serving fallbacks until trained")

    train_task = asyncio.create_task(_train())
    yield
    train_task.cancel()
    try:
        await train_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()
    from services.redis_client import redis
    await redis.close()


# --- App ---
app = FastAPI(
    title="Muzix API",
    description="Music streaming, discovery and recommendation API.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "health", "description": "Health check"},
        {"name": "auth", "description": "Registration, login, token refresh, current user"},
        {"name": "songs", "description": "List and retrieve songs"},
        {"name": "albums", "description": "List and retrieve albums"},
        {"name": "artists", "description": "List and retrieve artists"},
        {"name": "playlists", "description": "Create, list, update, delete playlists; add/remove songs"},
        {"name": "likes", "description": "Like / unlike songs, get liked song IDs"},
        {"name": "stream", "description": "Get a presigned audio URL for a song"},
        {"name": "thumbnails", "description": "Serve album/song thumbnails from R2"},
        {"name": "search", "description": "Full-text search across songs, albums, artists"},
        {"name": "telemetry", "description": "Record playback events, manage listening sessions"},
        {"name": "analytics", "description": "User listening statistics and history"},
        {"name": "recommendations", "description": "Personalised song recommendations"},
        {"name": "home", "description": "Aggregated home-screen feed"},
        {"name": "share", "description": "Generate and resolve share links"},
        {"name": "local", "description": "Dev-only local asset serving (non-production)"},
    ],
)

# --- Logfire ---
logfire.configure()
logfire.instrument_fastapi(
    app,
    request_attributes_mapper=lambda req, attrs: (
        {"errors": attrs["errors"]} if attrs["errors"] else {}
    ),
)

# --- Middleware ---
app.add_middleware(SecurityMiddleware)

# --- Static files (dev only) ---
import os as _os
if _os.getenv("ENV") != "production":
    from fastapi.staticfiles import StaticFiles
    if AUDIO_DIR.exists():
        app.mount("/assets/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")
    if THUMB_DIR.exists():
        app.mount("/assets/thumbnails", StaticFiles(directory=str(THUMB_DIR)), name="thumbnails")


# --- Exception handlers ---
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    from middleware import _origin_allowed
    status_code = exc.status_code
    if status_code >= 500:
        body = {"status": "exception", "data": [], "message": exc.detail or "Internal server error", "meta": {}}
    elif status_code == 304:
        body = {"status": "failed", "data": [], "message": "Not Modified", "meta": {}}
    else:
        body = {"status": "failed", "data": [], "message": exc.detail or "Failed", "meta": {}}
    origin = request.headers.get("origin")
    headers = dict(exc.headers) if exc.headers else {}
    if _origin_allowed(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        vary = headers.get("Vary", "")
        if "Origin" not in vary:
            headers["Vary"] = f"{vary}, Origin".strip(", ") if vary else "Origin"
    return Response(content=orjson.dumps(body), media_type="application/json", status_code=status_code, headers=headers)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    from middleware import _origin_allowed
    body = {"status": "exception", "data": [], "message": "Internal server error", "meta": {}}
    origin = request.headers.get("origin")
    headers = {"Content-Type": "application/json"}
    if _origin_allowed(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    return Response(content=orjson.dumps(body), media_type="application/json", status_code=500, headers=headers)


# --- OpenAPI (Bearer auth scheme) ---
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=app.openapi_tags,
    )
    schema.setdefault("components", {})["securitySchemes"] = {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT access token obtained from POST /auth/login or POST /auth/register",
        },
    }
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi


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
from routes.telemetry import router as telemetry_router
from routes.analytics import router as analytics_router
from routes.recommendations import router as recommendations_router
from routes.home import router as home_router
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
app.include_router(telemetry_router)
app.include_router(analytics_router)
app.include_router(recommendations_router)
app.include_router(home_router)
app.include_router(share_router, prefix="/api/share", tags=["share"])

# Dev-only routes: gated behind DEBUG/ENV flag
import os as _os
if _os.getenv("ENV") != "production":
    from routes.local import router as local_router
    app.include_router(local_router)
