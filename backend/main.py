"""
Muzix FastAPI backend.

Run locally:
    uv run python migrate.py
    uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.client import Config
from dotenv import load_dotenv
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db import SessionLocal

load_dotenv()

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

CORS_ORIGINS = [
    o.strip() for o in (os.getenv("CORS_ORIGINS") or "http://localhost:8081,http://localhost:3000").split(",")
]

ASSETS_DIR = Path(__file__).parent / "assets"
AUDIO_DIR = ASSETS_DIR / "audio"
THUMB_DIR = ASSETS_DIR / "thumbnails"
INFO_DIR = ASSETS_DIR / "info"

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
S3_ENDPOINT = R2_PUBLIC_URL or f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

r2 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4"),
)

app = FastAPI(title="Muzix API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static assets
if AUDIO_DIR.exists():
    app.mount("/assets/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")
if THUMB_DIR.exists():
    app.mount("/assets/thumbnails", StaticFiles(directory=str(THUMB_DIR)), name="thumbnails")


async def _get_session() -> AsyncSession:
    return SessionLocal()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}
