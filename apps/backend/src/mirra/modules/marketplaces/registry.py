"""Builds the set of live connectors from settings and merges it with the static catalog."""

from __future__ import annotations

from mirra.core.taxonomy import MarketplaceStatus
from mirra.modules.marketplaces.base import (
    ConnectorCapabilities,
    MarketplaceConnector,
    MarketplaceInfo,
)
from mirra.modules.marketplaces.catalog import CATALOG


class ConnectorRegistry:
    def __init__(self, connectors: list[MarketplaceConnector] | None = None) -> None:
        self._connectors: dict[str, MarketplaceConnector] = {c.id: c for c in connectors or []}

    def register(self, connector: MarketplaceConnector) -> None:
        self._connectors[connector.id] = connector

    def get(self, marketplace_id: str) -> MarketplaceConnector | None:
        return self._connectors.get(marketplace_id)

    def enabled(self) -> list[MarketplaceConnector]:
        return list(self._connectors.values())

    def describe(self) -> list[MarketplaceInfo]:
        infos: list[MarketplaceInfo] = []
        seen: set[str] = set()
        for entry in CATALOG:
            live = self._connectors.get(entry.id)
            infos.append(
                MarketplaceInfo(
                    id=entry.id,
                    name=entry.name,
                    base_url=entry.base_url,
                    integration_type=entry.integration_type,
                    status=MarketplaceStatus.active if live else entry.status,
                    enabled=live is not None,
                    capabilities=live.get_capabilities() if live else ConnectorCapabilities(),
                    notes=entry.notes,
                )
            )
            seen.add(entry.id)
        for cid, conn in self._connectors.items():
            if cid not in seen:  # e.g. the demo connector
                infos.append(
                    MarketplaceInfo(
                        id=cid,
                        name=conn.name,
                        base_url=conn.base_url,
                        integration_type=conn.integration_type,
                        status=MarketplaceStatus.active,
                        enabled=True,
                        capabilities=conn.get_capabilities(),
                    )
                )
        return infos

    async def aclose(self) -> None:
        for conn in self._connectors.values():
            await conn.aclose()


def build_registry() -> ConnectorRegistry:
    """Phase 2 adds the eBay and demo connectors here, gated on configuration."""
    return ConnectorRegistry()
