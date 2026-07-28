"""
Async database layer for Muzix (PostgreSQL via asyncpg).

All secrets come from DATABASE_URL in the environment. The sync Postgres URL
(postgresql://) is rewritten to the asyncpg driver (postgresql+asyncpg://) and
sslmode is mapped to asyncpg's ssl parameter.
"""
from __future__ import annotations

import os
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

load_dotenv()


def _async_url(raw: str) -> str:
    parsed = urlparse(raw)
    scheme = "postgresql+asyncpg"
    query = dict(parse_qsl(parsed.query))
    ssl = query.pop("sslmode", None)
    # asyncpg/SQLAlchemy don't accept libpq-only params.
    query.pop("channel_binding", None)
    if ssl:
        query["ssl"] = ssl
    return urlunparse(parsed._replace(scheme=scheme, query=urlencode(query)))


DATABASE_URL = _async_url(os.getenv("DATABASE_URL", ""))

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=300,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass
