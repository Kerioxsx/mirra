from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from mirra.modules.users.schemas import DisplayName, UserOut


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: DisplayName


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    """Desktop clients send the refresh token in the body; web clients rely on the cookie."""

    refresh_token: str | None = Field(default=None, max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth token type, not a secret
    expires_in: int = Field(description="Access token lifetime in seconds")
    refresh_token: str | None = Field(
        default=None, description="Only returned to desktop clients (X-Mirra-Client: desktop)"
    )
    user: UserOut
