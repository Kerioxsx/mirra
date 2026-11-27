"""eBay connector: Browse API keyword and image search (official API, application token)."""

from __future__ import annotations

from decimal import Decimal

from mirra.core.taxonomy import IntegrationType
from mirra.modules.marketplaces.base import (
    ConnectorCapabilities,
    ConnectorQuery,
    ConnectorSearchPage,
    MarketplaceConnector,
)
from mirra.modules.marketplaces.connectors.ebay.browse import build_params, map_page
from mirra.modules.marketplaces.connectors.ebay.client import EbayClient
from mirra.modules.pricing.fx import FxProvider

# listing currency of each eBay site
MARKETPLACE_CURRENCY = {
    "EBAY_US": "USD",
    "EBAY_GB": "GBP",
    "EBAY_DE": "EUR",
    "EBAY_FR": "EUR",
    "EBAY_IT": "EUR",
    "EBAY_ES": "EUR",
    "EBAY_AT": "EUR",
    "EBAY_IE": "EUR",
    "EBAY_NL": "EUR",
    "EBAY_AU": "AUD",
    "EBAY_CA": "CAD",
    "EBAY_CH": "CHF",
}


class EbayConnector(MarketplaceConnector):
    id = "ebay"
    name = "eBay"
    base_url = "https://www.ebay.com"
    integration_type = IntegrationType.official_api

    def __init__(self, *, client: EbayClient, fx: FxProvider | None = None) -> None:
        self._client = client
        self._fx = fx
        self.currency = MARKETPLACE_CURRENCY.get(client.marketplace_id, "USD")

    def get_capabilities(self) -> ConnectorCapabilities:
        return ConnectorCapabilities(
            text_search=True,
            image_search=True,
            images=True,
            price=True,
            shipping=True,
            seller_details=True,
            filters=["price_min", "price_max", "conditions", "sort", "ship_to_country"],
        )

    async def _local(self, query: ConnectorQuery) -> ConnectorQuery:
        """Price bounds in the site's listing currency (converted when we have rates; dropped,
        never guessed, when we don't)."""
        if query.currency == self.currency or (query.price_min is None and query.price_max is None):
            return query
        rates = await self._fx.rates() if self._fx else None
        r = rates.rate(query.currency, self.currency) if rates else None

        def conv(v: Decimal | None) -> Decimal | None:
            return (v * r).quantize(Decimal("0.01")) if v is not None and r else None

        return query.model_copy(
            update={
                "price_min": conv(query.price_min),
                "price_max": conv(query.price_max),
                "currency": self.currency,
            }
        )

    def _filtered(self, page: ConnectorSearchPage, query: ConnectorQuery) -> ConnectorSearchPage:
        if query.category is None:
            return page
        page.listings = [x for x in page.listings if x.category in (None, query.category)]
        return page

    async def search_products(self, query: ConnectorQuery) -> ConnectorSearchPage:
        local = await self._local(query)
        params = build_params(local, self.currency)
        body = await self._client.search(params, query.ship_to_country)
        listings, total, next_offset = map_page(body, query.ship_to_country)
        page = ConnectorSearchPage(
            marketplace_id=self.id,
            listings=listings,
            total=total,
            next_offset=next_offset,
            query_sent=params.get("q"),
        )
        return self._filtered(page, query)

    async def search_by_image(self, image: bytes, query: ConnectorQuery) -> ConnectorSearchPage:
        local = await self._local(query)
        params = build_params(local.model_copy(update={"text": None, "brand": None}), self.currency)
        body = await self._client.search_by_image(image, params, query.ship_to_country)
        listings, total, next_offset = map_page(body, query.ship_to_country)
        return self._filtered(
            ConnectorSearchPage(
                marketplace_id=self.id, listings=listings, total=total, next_offset=next_offset
            ),
            query,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
