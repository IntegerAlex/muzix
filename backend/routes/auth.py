"""Auth routes: register, login, refresh, me."""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, field_validator

from config import MAX_EMAIL_LEN
from helpers import success_resp, rate_limit_async, get_current_user, get_current_user_full
from services import auth as auth_svc

router = APIRouter(prefix="/auth")


class AuthRegister(BaseModel):
    email: str
    password: str
    displayName: str = ""

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

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/register")
async def register(body: AuthRegister, request: Request):
    await rate_limit_async(request, max_requests=5, window=300)
    data = await auth_svc.register(body.email, body.password, body.displayName)
    return success_resp(data=data, message="Registration successful")


@router.post("/login")
async def login(body: AuthLogin, request: Request):
    await rate_limit_async(request, max_requests=10, window=60)
    data = await auth_svc.login(body.email, body.password)
    return success_resp(data=data, message="Login successful")


class AuthRefresh(BaseModel):
    refreshToken: str


@router.post("/refresh")
async def refresh_token(body: AuthRefresh, request: Request):
    await rate_limit_async(request, max_requests=10, window=60)
    data = await auth_svc.refresh(body.refreshToken)
    return success_resp(data=data, message="Token refreshed")


@router.get("/me")
async def get_me(user=Depends(get_current_user_full)):
    return success_resp(data=user.to_dict(), message="User retrieved")
