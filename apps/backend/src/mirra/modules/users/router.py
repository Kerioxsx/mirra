from __future__ import annotations

from fastapi import APIRouter, Response, status

from mirra.core.errors import ErrorResponse
from mirra.modules.auth.deps import CurrentUser, SessionDep
from mirra.modules.users import service
from mirra.modules.users.schemas import AccountDelete, Preferences, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"], responses={401: {"model": ErrorResponse}})


@router.get("/me", response_model=UserOut)
async def get_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_me(body: UserUpdate, user: CurrentUser, session: SessionDep) -> UserOut:
    return UserOut.model_validate(await service.update_user(session, user, body))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(body: AccountDelete, user: CurrentUser, session: SessionDep) -> Response:
    """Permanently delete the account and everything it owns. Requires the password."""
    await service.delete_account(session, user, body.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/preferences", response_model=Preferences)
async def get_preferences(user: CurrentUser, session: SessionDep) -> Preferences:
    return Preferences.model_validate(await service.get_preferences(session, user.id))


@router.put(
    "/me/preferences", response_model=Preferences, responses={422: {"model": ErrorResponse}}
)
async def put_preferences(body: Preferences, user: CurrentUser, session: SessionDep) -> Preferences:
    return Preferences.model_validate(await service.replace_preferences(session, user.id, body))
