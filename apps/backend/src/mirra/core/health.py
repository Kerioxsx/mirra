from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from mirra import __version__
from mirra.core.db import get_sessionmaker

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    version: str = __version__


class Readiness(BaseModel):
    status: Literal["ready", "degraded"]
    database: bool


@router.get("/health", response_model=Health)
async def health() -> Health:
    """Liveness: the process is up."""
    return Health()


@router.get("/health/ready", response_model=Readiness)
async def ready(response: Response) -> Readiness:
    """Readiness: dependencies answer."""
    try:
        async with get_sessionmaker()() as s:
            await s.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return Readiness(status="ready" if db_ok else "degraded", database=db_ok)
