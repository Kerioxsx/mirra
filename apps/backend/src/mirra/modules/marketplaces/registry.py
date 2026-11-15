"""Builds the set of live connectors from settings and merges it with the static catalog."""

from __future__ import annotations

from mirra.core.config import get_settings
from mirra.core.taxonomy import MarketplaceStatus
from mirra.modules.marketplaces.base import (
    ConnectorCapabilities,
    MarketplaceConnector,
    MarketplaceInfo,
)
from mirra.modules.marketplaces.catalog import CATALOG
from mirra.modules.marketplaces.connectors.demo import DemoConnector
from mirra.modules.marketplaces.connectors.ebay.client import EbayClient
from mirra.modules.marketplaces.connectors.ebay.connector import EbayConnector
from mirra.modules.marketplaces.connectors.taobao.connector import TaobaoConnector
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.pricing.fx import FxProvider


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


def build_registry(fx: FxProvider | None = None) -> ConnectorRegistry:
    """Live connectors, each enabled only when its credentials are configured."""
    s = get_settings()
    connectors: list[MarketplaceConnector] = []
    if s.taobao_configured:
        assert s.taobao_app_key and s.taobao_app_secret and s.taobao_adzone_id
        client = TopClient(
            app_key=s.taobao_app_key,
            app_secret=s.taobao_app_secret.get_secret_value(),
            gateway=s.taobao_gateway,
            sign_method=s.taobao_sign_method,
            timeout=s.search_timeout_seconds,
        )
        connectors.append(
            TaobaoConnector(
                client=client,
                adzone_id=s.taobao_adzone_id,
                language=s.taobao_language,
                fx=fx,
                translate=s.taobao_translate_queries,
            )
        )
    if s.ebay_configured:
        assert s.ebay_client_id and s.ebay_client_secret
        connectors.append(
            EbayConnector(
                client=EbayClient(
                    client_id=s.ebay_client_id,
                    client_secret=s.ebay_client_secret.get_secret_value(),
                    marketplace_id=s.ebay_marketplace_id,
                    api_base=s.ebay_api_base,
                    campaign_id=s.ebay_campaign_id,
                    timeout=s.search_timeout_seconds,
                ),
                fx=fx,
            )
        )
    if s.demo_connector_enabled and not s.is_production:
        connectors.append(DemoConnector())
    return ConnectorRegistry(connectors)
