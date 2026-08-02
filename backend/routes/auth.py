"""Auth routes: register, login, refresh, me."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, field_validator

from config import MAX_EMAIL_LEN
from helpers import success_resp, rate_limit_async, get_current_user, get_current_user_full
from schemas import (
    AuthResult,
    Envelope,
    UNAUTHORIZED,
    RATE_LIMITED,
    CONFLICT,
    VALIDATION_ERROR,
    UserOut,
)
from services import auth as auth_svc

router = APIRouter(prefix="/auth", tags=["auth"])


class AuthRegister(BaseModel):
    email: str
    password: str
    displayName: str = ""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "user@example.com",
                    "password": "SecurePass1",
                    "displayName": "John",
                }
            ]
        }
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("displayName")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        return v[:128] if v else ""


class AuthLogin(BaseModel):
    email: str
    password: str

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"email": "user@example.com", "password": "SecurePass1"}]
        }
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class AuthRefresh(BaseModel):
    refreshToken: str

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"refreshToken": "abc123..."}]
        }
    )


@router.post(
    "/register",
    response_model=Envelope[AuthResult],
    summary="Register a new account",
    description="Create a new user account. Returns a JWT access token, a refresh token, and the user profile. Rate-limited to 5 requests per 5 minutes.",
    responses={**RATE_LIMITED, **CONFLICT, **VALIDATION_ERROR},
)
async def register(body: AuthRegister, request: Request):
    await rate_limit_async(request, max_requests=5, window=300)
    data = await auth_svc.register(body.email, body.password, body.displayName)
    return success_resp(data=data, message="Registration successful")


@router.post(
    "/login",
    response_model=Envelope[AuthResult],
    summary="Log in",
    description="Authenticate with email and password. Returns a JWT access token, a refresh token, and the user profile. Rate-limited to 10 requests per minute.",
    responses={**RATE_LIMITED, **VALIDATION_ERROR},
)
async def login(body: AuthLogin, request: Request):
    await rate_limit_async(request, max_requests=10, window=60)
    data = await auth_svc.login(body.email, body.password)
    return success_resp(data=data, message="Login successful")


@router.post(
    "/refresh",
    response_model=Envelope[AuthResult],
    summary="Refresh access token",
    description="Exchange a valid refresh token for a new JWT + refresh token pair. The old refresh token is revoked (rotation). Rate-limited to 10 requests per minute.",
    responses={**RATE_LIMITED, **UNAUTHORIZED},
)
async def refresh_token(body: AuthRefresh, request: Request):
    await rate_limit_async(request, max_requests=10, window=60)
    data = await auth_svc.refresh(body.refreshToken)
    return success_resp(data=data, message="Token refreshed")


@router.get(
    "/me",
    response_model=Envelope[UserOut],
    summary="Get current user",
    description="Return the profile of the currently authenticated user (requires a valid JWT in the Authorization header).",
    responses={**UNAUTHORIZED},
    openapi_extra={"security": [{"bearerAuth": []}]},
)
async def get_me(user=Depends(get_current_user_full)):
    return success_resp(data=user.to_dict(), message="User retrieved")
