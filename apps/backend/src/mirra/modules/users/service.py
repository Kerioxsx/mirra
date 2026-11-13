from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from mirra.core.errors import Unauthorized
from mirra.core.security import verify_password
from mirra.modules.users.models import User, UserPreferences
from mirra.modules.users.schemas import Preferences, UserUpdate


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    return (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def update_user(session: AsyncSession, user: User, data: UserUpdate) -> User:
    if data.display_name is not None:
        user.display_name = data.display_name
    await session.commit()
    await session.refresh(user)
    return user


async def get_preferences(session: AsyncSession, user_id: uuid.UUID) -> UserPreferences:
    prefs = await session.get(UserPreferences, user_id)
    if prefs is None:  # created at registration, but stay robust for older rows
        prefs = UserPreferences(user_id=user_id)
        session.add(prefs)
        await session.commit()
        await session.refresh(prefs)
    return prefs


async def replace_preferences(
    session: AsyncSession, user_id: uuid.UUID, data: Preferences
) -> UserPreferences:
    prefs = await get_preferences(session, user_id)
    for field, value in data.model_dump().items():
        setattr(prefs, field, value)
    await session.commit()
    await session.refresh(prefs)
    return prefs


async def delete_account(session: AsyncSession, user: User, password: str) -> None:
    """Hard-delete the user; every owned row cascades. Object-storage cleanup is queued later."""
    if not verify_password(password, user.password_hash):
        raise Unauthorized("Password is incorrect")
    await session.delete(user)
    await session.commit()
