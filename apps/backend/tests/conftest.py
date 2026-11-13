"""Test fixtures. Tests run against a real PostgreSQL database (``mirra_test`` by default)."""

from __future__ import annotations

import os

os.environ.setdefault("MIRRA_ENV", "test")
os.environ.setdefault(
    "MIRRA_DATABASE_URL", "postgresql+asyncpg://mirra:mirra@localhost:5432/mirra_test"
)
os.environ.setdefault("MIRRA_JWT_SECRET", "test-secret-test-secret-test-secret-0123")
os.environ["MIRRA_REDIS_URL"] = ""  # in-memory rate limiting keeps tests isolated
os.environ["MIRRA_FX_SOURCE"] = "none"  # tests never call the ECB; they inject fixed rates

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from mirra.core.config import get_settings
from mirra.core.db import dispose_engine, get_sessionmaker
from mirra.core.ratelimit import get_limiter
from mirra.db.models import Base
from mirra.main import create_app

BACKEND = Path(__file__).resolve().parents[1]


def _alembic(cmd: str, *args: str) -> None:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    getattr(command, cmd)(cfg, *args)


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Rebuild the schema from migrations once per run, so migrations are tested too."""
    get_settings.cache_clear()
    _alembic("downgrade", "base")
    _alembic("upgrade", "head")


@pytest.fixture(autouse=True)
async def clean_state() -> AsyncIterator[None]:
    get_limiter().reset()
    yield
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    async with get_sessionmaker()() as s:
        await s.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        await s.commit()


@pytest.fixture(scope="session", autouse=True)
async def _dispose() -> AsyncIterator[None]:
    yield
    await dispose_engine()


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


WEB = {"X-Mirra-Client": "web"}
DESKTOP = {"X-Mirra-Client": "desktop"}
PASSWORD = "correct horse battery"


async def register(
    client: AsyncClient, email: str = "ada@example.com", headers: dict[str, str] = WEB
) -> dict:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Ada"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
