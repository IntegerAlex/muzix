"""Auth service: registration, login, token refresh with opaque rotation."""
import hashlib
import uuid
from datetime import timedelta

from fastapi import HTTPException

from config import ACCESS_TOKEN_EXPIRY_HOURS
from crypto import hash_password, verify_password
from helpers import create_token, generate_refresh_token, validate_email, validate_password
from repositories import users as user_repo
import repositories.refresh_tokens as refresh_token_repo


async def register(email: str, password: str, display_name: str) -> dict:
    email = validate_email(email)
    validate_password(password)
    existing = await user_repo.get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    from models import User
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=hash_password(password),
        display_name=display_name[:128] if display_name else "",
    )
    await user_repo.create_user(user)
    token = create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
    refresh = await generate_refresh_token(user.id)
    return {"token": token, "refreshToken": refresh, "user": user.to_dict()}


async def login(email: str, password: str) -> dict:
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")
    email = validate_email(email)
    user = await user_repo.get_user_by_email(email)
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
    refresh = await generate_refresh_token(user.id)
    return {"token": token, "refreshToken": refresh, "user": user.to_dict()}


async def refresh(raw_token: str) -> dict:
    if not raw_token:
        raise HTTPException(status_code=400, detail="Refresh token required")

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    rotated = await refresh_token_repo.rotate_if_valid(token_hash)

    if rotated is None:
        # Unknown, expired, or already consumed. Distinguish reuse (theft)
        # from invalid: a revoked row means this token was already rotated.
        existing = await refresh_token_repo.find_by_hash(token_hash)
        if existing is not None and existing.is_revoked:
            await refresh_token_repo.revoke_family(existing.family_id)
            raise HTTPException(status_code=401, detail="Refresh token has been revoked. Please login again.")
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await user_repo.get_user_by_id(rotated["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    token = create_token(user.id, timedelta(hours=ACCESS_TOKEN_EXPIRY_HOURS))
    new_refresh = await generate_refresh_token(user.id, family_id=rotated["family_id"])
    return {"token": token, "refreshToken": new_refresh, "user": user.to_dict()}
