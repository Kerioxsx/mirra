"""Taobao marketplace connector.

Live source: the official overseas Taobao affiliate API (``taobao.ovs.tbk.material.item.optional``)
— keyword search with English titles, site-localized prices and affiliate deep links to
intl.taobao.com. Needs a Taobao affiliate (Alimama) publisher account with overseas API access:
app key + secret + adzone (promotion slot) id. See docs/architecture/taobao.md.
"""

from __future__ import annotations

from decimal import Decimal

from mirra.core.taxonomy import IntegrationType
from mirra.modules.marketplaces.base import (
    ConnectorCapabilities,
    ConnectorQuery,
    ConnectorSearchPage,
    MarketplaceConnector,
)
from mirra.modules.marketplaces.connectors.taobao.language import translate_query
from mirra.modules.marketplaces.connectors.taobao.ovs import METHOD, SORTS, map_response, site_for
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.pricing.fx import FxProvider


class TaobaoConnector(MarketplaceConnector):
    id = "taobao"
    name = "Taobao"
    base_url = "https://world.taobao.com"
    integration_type = IntegrationType.official_api

    def __init__(
        self,
        *,
        client: TopClient,
        adzone_id: str,
        language: str = "en_US",
        fx: FxProvider | None = None,
        translate: bool = True,
    ) -> None:
        self._client = client
        self._adzone_id = adzone_id
        self._language = language
        self._fx = fx
        self._translate = translate

    def get_capabilities(self) -> ConnectorCapabilities:
        return ConnectorCapabilities(
            text_search=True,
            images=True,
            price=True,
            seller_details=True,
            shipping=False,  # only "free domestic shipping" tags; no cross-border quotes
            filters=["price_min", "price_max", "sort", "ship_to_country"],
        )

    async def _cny_bound(self, amount: Decimal | None, currency: str) -> Decimal | None:
        """Price filters are in yuan; convert the shopper's bound when we have rates."""
        if amount is None:
            return None
        if currency == "CNY":
            return amount
        rates = await self._fx.rates() if self._fx else None
        r = rates.rate(currency, "CNY") if rates else None
        return (amount * r).quantize(Decimal("1")) if r else None

    async def search_products(self, query: ConnectorQuery) -> ConnectorSearchPage:
        q = query.text or ""
        sent = translate_query(q).query if self._translate else q
        page_size = query.limit
        params = {
            "adzone_id": self._adzone_id,
            "site": site_for(query.ship_to_country),
            "language": self._language,
            "page_size": page_size,
            "page_no": query.offset // page_size + 1,
            "q": sent or None,
            "sort": SORTS.get(query.sort),
            "start_price": await self._cny_bound(query.price_min, query.currency),
            "end_price": await self._cny_bound(query.price_max, query.currency),
        }
        body = await self._client.call(METHOD, params)
        listings, total, has_next = map_response(body, language=self._language)
        if query.category is not None:
            listings = [item for item in listings if item.category in (None, query.category)]
        return ConnectorSearchPage(
            marketplace_id=self.id,
            listings=listings,
            total=total,
            next_offset=query.offset + page_size if has_next else None,
            query_sent=sent,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
