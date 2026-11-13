"""Authentication service: registration, login and refresh-token rotation with reuse detection."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from mirra.core.config import get_settings
from mirra.core.errors import Conflict, Unauthorized
from mirra.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    password_needs_rehash,
    verify_password,
)
from mirra.core.taxonomy import ClientKind
from mirra.modules.auth.models import AuthSession
from mirra.modules.users.models import User, UserPreferences
from mirra.modules.users.service import get_user_by_email

# A token replaced less than this many seconds ago is treated as a benign race (two tabs refreshing
# at once), not as theft: the request fails, but the token family is not revoked.
ROTATION_GRACE_SECONDS = 10


class RefreshSuperseded(Unauthorized):
    code = "refresh_superseded"


class RefreshReused(Unauthorized):
    code = "refresh_reused"


@dataclass(frozen=True)
class IssuedTokens:
    user: User
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_max_age: int


async def _issue(
    session: AsyncSession,
    user: User,
    client: ClientKind,
    user_agent: str | None,
    family_id: uuid.UUID | None = None,
) -> tuple[IssuedTokens, AuthSession]:
    s = get_settings()
    raw = new_refresh_token()
    ttl = timedelta(days=s.refresh_token_ttl_days)
    row = AuthSession(
        user_id=user.id,
        token_hash=hash_refresh_token(raw),
        family_id=family_id or uuid.uuid4(),
        client=client,
        user_agent=(user_agent or "")[:400] or None,
        expires_at=datetime.now(UTC) + ttl,
    )
    session.add(row)
    await session.flush()
    access = create_access_token(user.id)
    tokens = IssuedTokens(
        user=user,
        access_token=access.token,
        expires_in=access.expires_in,
        refresh_token=raw,
        refresh_max_age=int(ttl.total_seconds()),
    )
    return tokens, row


async def register(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    display_name: str,
    client: ClientKind,
    user_agent: str | None,
) -> IssuedTokens:
    if await get_user_by_email(session, email) is not None:
        raise Conflict("An account with this email already exists")
    user = User(
        email=email.lower(), password_hash=hash_password(password), display_name=display_name
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:  # lost a race with a concurrent registration
        await session.rollback()
        raise Conflict("An account with this email already exists") from exc
    session.add(UserPreferences(user_id=user.id))
    user.last_login_at = datetime.now(UTC)
    tokens, _ = await _issue(session, user, client, user_agent)
    await session.commit()
    await session.refresh(user)
    return tokens


async def login(
    session: AsyncSession, *, email: str, password: str, client: ClientKind, user_agent: str | None
) -> IssuedTokens:
    user = await get_user_by_email(session, email)
    # verify_password runs even for unknown emails so response timing doesn't reveal accounts
    ok = verify_password(password, user.password_hash if user else None)
    if user is None or not ok or not user.is_active:
        raise Unauthorized("Email or password is incorrect")
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = datetime.now(UTC)
    tokens, _ = await _issue(session, user, client, user_agent)
    await session.commit()
    await session.refresh(user)
    return tokens


async def refresh(
    session: AsyncSession, *, raw_token: str, client: ClientKind, user_agent: str | None
) -> IssuedTokens:
    now = datetime.now(UTC)
    row = (
        await session.execute(
            select(AuthSession)
            .where(AuthSession.token_hash == hash_refresh_token(raw_token))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise Unauthorized("Session not found. Please sign in again.")
    if row.revoked_at is not None:
        recently_rotated = row.replaced_by_id is not None and (now - row.revoked_at) < timedelta(
            seconds=ROTATION_GRACE_SECONDS
        )
        if recently_rotated:
            await session.rollback()
            raise RefreshSuperseded("Session was refreshed by another request. Retry once.")
        # Reuse of an old token: assume it was stolen and end every session in the family.
        await session.execute(
            update(AuthSession)
            .where(AuthSession.family_id == row.family_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await session.commit()
        raise RefreshReused("Session is no longer valid. Please sign in again.")
    if row.expires_at <= now or row.client != client:
        raise Unauthorized("Session expired. Please sign in again.")
    user = await session.get(User, row.user_id)
    if user is None or not user.is_active:
        raise Unauthorized("Session is no longer valid. Please sign in again.")
    tokens, new_row = await _issue(session, user, client, user_agent, family_id=row.family_id)
    row.revoked_at = now
    row.replaced_by_id = new_row.id
    await session.commit()
    return tokens


async def logout(session: AsyncSession, *, raw_token: str | None) -> None:
    if not raw_token:
        return
    await session.execute(
        update(AuthSession)
        .where(
            AuthSession.token_hash == hash_refresh_token(raw_token),
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    await session.commit()
