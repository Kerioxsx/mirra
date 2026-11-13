from __future__ import annotations

from fastapi import APIRouter, Request

from mirra.modules.marketplaces.base import MarketplaceInfo
from mirra.modules.marketplaces.registry import ConnectorRegistry

router = APIRouter(prefix="/marketplaces", tags=["marketplaces"])


def get_registry(request: Request) -> ConnectorRegistry:
    registry: ConnectorRegistry = request.app.state.registry
    return registry


@router.get("", response_model=list[MarketplaceInfo])
async def list_marketplaces(request: Request) -> list[MarketplaceInfo]:
    """Every marketplace Mirra tracks, with live status and what each connector can do."""
    return get_registry(request).describe()
