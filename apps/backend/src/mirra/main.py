"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from redis.asyncio import Redis

from mirra import __version__
from mirra.core.config import get_settings
from mirra.core.db import dispose_engine
from mirra.core.errors import install_error_handlers
from mirra.core.health import router as health_router
from mirra.db import models as _models  # noqa: F401 - register every table for FK resolution
from mirra.modules.auth.router import router as auth_router
from mirra.modules.listings.router import router as listings_router
from mirra.modules.marketplaces.registry import build_registry
from mirra.modules.marketplaces.router import router as marketplaces_router
from mirra.modules.outfits.router import router as outfits_router
from mirra.modules.pricing.fx import EcbFxProvider, FxProvider, StaticFxProvider
from mirra.modules.search.cache import MemoryPageCache, PageCache, RedisPageCache
from mirra.modules.search.router import router as search_router
from mirra.modules.shopping.router import router as shopping_router
from mirra.modules.users.router import router as users_router

API_PREFIX = "/api/v1"


def _operation_id(route: APIRoute) -> str:
    """Stable operation ids (``auth_login``) keep generated TypeScript names readable."""
    tag = route.tags[0] if route.tags else "default"
    return f"{tag}_{route.name}"


def build_page_cache() -> PageCache:
    url = get_settings().redis_url
    return RedisPageCache(Redis.from_url(url)) if url else MemoryPageCache()


def build_fx() -> FxProvider:
    return EcbFxProvider() if get_settings().fx_source == "ecb" else StaticFxProvider(None)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    get_settings().validate_for_runtime()
    app.state.fx = build_fx()
    app.state.registry = build_registry(app.state.fx)
    app.state.page_cache = build_page_cache()
    yield
    await app.state.registry.aclose()
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Mirra API",
        version=__version__,
        description="AI fashion dresser: search, compare, dress, style.",
        lifespan=lifespan,
        generate_unique_id_function=_operation_id,
        separate_input_output_schemas=False,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
    )
    # Present before startup so tools that skip the lifespan (OpenAPI export) still work.
    app.state.fx = build_fx()
    app.state.registry = build_registry(app.state.fx)
    app.state.page_cache = build_page_cache()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Mirra-Client"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
            )
        return response

    install_error_handlers(app)
    _document_error_envelope(app)
    app.include_router(health_router)
    for router in (
        auth_router,
        users_router,
        marketplaces_router,
        search_router,
        listings_router,
        shopping_router,
        outfits_router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    return app


def _document_error_envelope(app: FastAPI) -> None:
    """FastAPI documents 422s as ``HTTPValidationError``, but our handler returns the shared
    ``ErrorResponse`` envelope. Rewrite the schema so generated clients match reality."""
    original = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema:
            return app.openapi_schema
        spec = original()
        ref = {"$ref": "#/components/schemas/ErrorResponse"}
        for ops in spec.get("paths", {}).values():
            for op in ops.values():
                resp = op.get("responses", {}).get("422")
                if resp is not None:
                    resp["description"] = "Validation error"
                    resp["content"] = {"application/json": {"schema": ref}}
        schemas = spec.get("components", {}).get("schemas", {})
        schemas.pop("HTTPValidationError", None)
        schemas.pop("ValidationError", None)
        app.openapi_schema = spec
        return spec

    app.openapi = openapi  # type: ignore[method-assign]


app = create_app()
