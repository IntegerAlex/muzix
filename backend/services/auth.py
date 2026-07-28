"""Auth service: registration, login, token refresh."""
import uuid
from datetime import timedelta

import bcrypt
from fastapi import HTTPException

from config import ACCESS_TOKEN_EXPIRY_HOURS, MAX_TITLE_LEN, MAX_SONGS_PER_PLAYLIST
from helpers import (
    create_token, create_refresh_token, validate_email, validate_password,
)
from repositories import users as user_repo
from models import User


async def register(email: str, password: str, display_name: str) -> dict:
    email = validate_email(email)
    validate_password(password)
    existing = await user_repo.get_user_by_email(email)
    if existing:
        return {}
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        display_name=display_name[:128] if display_name else "",
    )
    await user_repo.create_user(user)
    token = create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
    refresh = create_refresh_token(user.id)
    return {"token": token, "refreshToken": refresh, "user": user.to_dict()}


async def login(email: str, password: str) -> dict:
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    email = email.strip().lower()
    user = await user_repo.get_user_by_email(email)
    if not user or not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
    refresh = create_refresh_token(user.id)
    return {"token": token, "refreshToken": refresh, "user": user.to_dict()}


async def refresh(refresh_token_str: str) -> dict:
    import jwt
    from config import JWT_SECRET
    if not refresh_token_str:
        raise HTTPException(status_code=400, detail="Refresh token required")
    try:
        payload = jwt.decode(refresh_token_str, JWT_SECRET, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await user_repo.get_user_by_id(payload.get("sub"))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    token = create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
    new_refresh = create_refresh_token(user.id)
    return {"token": token, "refreshToken": new_refresh}
