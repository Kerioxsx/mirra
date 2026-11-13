from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status

from mirra.core.config import get_settings
from mirra.core.errors import ErrorResponse, Unauthorized
from mirra.core.ratelimit import rate_limit
from mirra.core.taxonomy import ClientKind
from mirra.modules.auth import service
from mirra.modules.auth.deps import ClientDep, SessionDep
from mirra.modules.auth.schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from mirra.modules.users.schemas import UserOut

REFRESH_COOKIE = "mirra_refresh"
COOKIE_PATH = "/api/v1/auth"

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
    },
)


def _respond(response: Response, tokens: service.IssuedTokens, client: ClientKind) -> TokenResponse:
    if client is ClientKind.web:
        s = get_settings()
        response.set_cookie(
            REFRESH_COOKIE,
            tokens.refresh_token,
            max_age=tokens.refresh_max_age,
            httponly=True,
            secure=s.cookie_secure,
            samesite="lax",
            path=COOKIE_PATH,
        )
    response.headers["Cache-Control"] = "no-store"
    return TokenResponse(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        refresh_token=tokens.refresh_token if client is ClientKind.desktop else None,
        user=UserOut.model_validate(tokens.user),
    )


def _raw_refresh(client: ClientKind, cookie: str | None, body: RefreshRequest | None) -> str | None:
    return cookie if client is ClientKind.web else (body.refresh_token if body else None)


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("auth:register"))],
    responses={409: {"model": ErrorResponse}},
)
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    session: SessionDep,
    client: ClientDep,
) -> TokenResponse:
    tokens = await service.register(
        session,
        email=str(body.email),
        password=body.password,
        display_name=body.display_name,
        client=client,
        user_agent=request.headers.get("user-agent"),
    )
    return _respond(response, tokens, client)


@router.post(
    "/login", response_model=TokenResponse, dependencies=[Depends(rate_limit("auth:login"))]
)
async def login(
    body: LoginRequest, request: Request, response: Response, session: SessionDep, client: ClientDep
) -> TokenResponse:
    tokens = await service.login(
        session,
        email=str(body.email),
        password=body.password,
        client=client,
        user_agent=request.headers.get("user-agent"),
    )
    return _respond(response, tokens, client)


@router.post(
    "/refresh", response_model=TokenResponse, dependencies=[Depends(rate_limit("auth:refresh"))]
)
async def refresh(
    request: Request,
    response: Response,
    session: SessionDep,
    client: ClientDep,
    body: RefreshRequest | None = None,
    mirra_refresh: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    raw = _raw_refresh(client, mirra_refresh, body)
    if not raw:
        raise Unauthorized("No session. Please sign in.")
    tokens = await service.refresh(
        session, raw_token=raw, client=client, user_agent=request.headers.get("user-agent")
    )
    return _respond(response, tokens, client)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: SessionDep,
    client: ClientDep,
    body: RefreshRequest | None = None,
    mirra_refresh: Annotated[str | None, Cookie()] = None,
) -> Response:
    await service.logout(session, raw_token=_raw_refresh(client, mirra_refresh, body))
    response.status_code = status.HTTP_204_NO_CONTENT
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    return response
