"""Auth dependencies: client kind header and the current user from a bearer token."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from mirra.core.db import get_session
from mirra.core.errors import AppError, Unauthorized
from mirra.core.security import decode_access_token
from mirra.core.taxonomy import ClientKind
from mirra.modules.users.models import User

_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def client_kind(
    x_mirra_client: Annotated[str | None, Header(alias="X-Mirra-Client")] = None,
) -> ClientKind:
    """Every auth call must say which client it is. As a custom header it also forces a CORS
    preflight, which stops cross-site forms from riding on the refresh cookie."""
    try:
        return ClientKind(x_mirra_client or "")
    except ValueError as exc:
        raise AppError("X-Mirra-Client header must be 'web' or 'desktop'") from exc


async def current_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise Unauthorized("Not signed in")
    user_id = decode_access_token(creds.credentials)
    if user_id is None:
        raise Unauthorized("Access token is invalid or expired")
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Account not found")
    return user


async def optional_user(
    session: SessionDep,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    """For public endpoints that personalise when signed in; a bad token just means anonymous."""
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    user_id = decode_access_token(creds.credentials)
    if user_id is None:
        return None
    user = await session.get(User, user_id)
    return user if user is not None and user.is_active else None


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
ClientDep = Annotated[ClientKind, Depends(client_kind)]
