"""User repository: database operations for users."""
from sqlalchemy import select
from db import SessionLocal
from models import User


async def get_user_by_id(user_id: str) -> User | None:
    async with SessionLocal() as session:
        return await session.get(User, user_id)


async def get_user_by_email(email: str) -> User | None:
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()


async def create_user(user: User) -> User:
    async with SessionLocal() as session:
        session.add(user)
        await session.commit()
        return user
