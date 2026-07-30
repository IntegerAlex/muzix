"""Refresh token repository: database operations for opaque refresh tokens."""
from datetime import datetime, timezone

from sqlalchemy import select, update

from db import SessionLocal
from models import RefreshToken


async def create(token: RefreshToken) -> RefreshToken:
    async with SessionLocal() as session:
        session.add(token)
        await session.commit()
        return token


async def find_by_hash(token_hash: str) -> RefreshToken | None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()


async def revoke(token_id: str) -> None:
    async with SessionLocal() as session:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id)
            .values(is_revoked=True)
        )
        await session.commit()


async def revoke_family(family_id: str) -> None:
    async with SessionLocal() as session:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id)
            .values(is_revoked=True)
        )
        await session.commit()


async def revoke_all_for_user(user_id: str) -> None:
    async with SessionLocal() as session:
        await session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.is_revoked == False,  # noqa: E712
                RefreshToken.expires_at > datetime.now(timezone.utc),
            )
            .values(is_revoked=True)
        )
        await session.commit()
