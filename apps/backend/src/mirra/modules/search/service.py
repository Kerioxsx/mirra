"""Fan a query out to every live connector, then convert, cost and rank the results."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from decimal import Decimal

from mirra.core.taxonomy import Category, MarketplaceStatus
from mirra.modules.marketplaces.base import (
    CapabilityNotSupported,
    ConnectorQuery,
    ConnectorSearchPage,
    ConnectorUnavailable,
    MarketplaceConnector,
    Money,
    NormalizedListing,
)
from mirra.modules.marketplaces.catalog import CATALOG
from mirra.modules.marketplaces.registry import ConnectorRegistry
from mirra.modules.pricing.fx import FxRates
from mirra.modules.pricing.landed_cost import ForwardingRate, estimate_landed_cost
from mirra.modules.search.schemas import (
    FxInfo,
    MarketplaceSearchStatus,
    SearchResponse,
    SearchResult,
    Sort,
)

log = logging.getLogger(__name__)

COUNTRY_NAMES = {"CN": "China", "US": "the US", "GB": "the UK", "DE": "Germany", "JP": "Japan"}


@dataclass(frozen=True)
class SearchParams:
    q: str
    currency: str = "USD"
    ship_to_country: str | None = None
    sort: Sort = "relevance"
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    category: Category | None = None
    marketplaces: tuple[str, ...] | None = None
    page: int = 1
    page_size: int = 24


async def _run_one(
    conn: MarketplaceConnector, query: ConnectorQuery, time_limit: float
) -> ConnectorSearchPage | MarketplaceSearchStatus:
    try:
        return await asyncio.wait_for(conn.search_products(query), timeout=time_limit)
    except TimeoutError:
        return MarketplaceSearchStatus(
            id=conn.id, name=conn.name, status="timeout", message="Took too long to answer"
        )
    except CapabilityNotSupported:
        return MarketplaceSearchStatus(
            id=conn.id, name=conn.name, status="error", message="Doesn't support search"
        )
    except ConnectorUnavailable as exc:
        log.warning("connector %s failed: %s", conn.id, exc)
        return MarketplaceSearchStatus(
            id=conn.id, name=conn.name, status="error", message="Temporarily unavailable"
        )


def _result(
    listing: NormalizedListing,
    p: SearchParams,
    fx: FxRates | None,
    forwarding: ForwardingRate | None,
) -> SearchResult:
    converted: Money | None = None
    if listing.price:
        converted = (
            listing.price
            if listing.price.currency == p.currency
            else (fx.convert(listing.price, p.currency) if fx else None)
        )
    origin = listing.ships_from_country
    cross_border = origin is not None and origin != (p.ship_to_country or "")
    domestic_label = (
        f"Shipping within {COUNTRY_NAMES.get(origin or '', origin)}" if cross_border else "Shipping"
    )
    landed = (
        estimate_landed_cost(
            price=listing.price,
            target_currency=p.currency,
            fx=fx,
            domestic_shipping=listing.shipping.cost if listing.shipping else None,
            domestic_shipping_label=domestic_label,
            category=listing.category,
            cross_border=cross_border,
            forwarding=forwarding,
        )
        if listing.price
        else None
    )
    return SearchResult(listing=listing, converted_price=converted, landed_cost=landed)


def _interleave(groups: list[list[SearchResult]]) -> list[SearchResult]:
    out: list[SearchResult] = []
    for i in range(max((len(g) for g in groups), default=0)):
        out.extend(g[i] for g in groups if i < len(g))
    return out


async def search(
    registry: ConnectorRegistry,
    p: SearchParams,
    *,
    fx: FxRates | None,
    forwarding: ForwardingRate | None,
    time_limit: float,
) -> SearchResponse:
    wanted = set(p.marketplaces) if p.marketplaces else None
    live = [c for c in registry.enabled() if wanted is None or c.id in wanted]
    query = ConnectorQuery(
        text=p.q or None,
        category=p.category,
        price_min=p.price_min,
        price_max=p.price_max,
        currency=p.currency,
        ship_to_country=p.ship_to_country,
        sort=p.sort,
        limit=p.page_size,
        offset=(p.page - 1) * p.page_size,
    )
    outcomes = await asyncio.gather(*(_run_one(c, query, time_limit) for c in live))

    statuses: list[MarketplaceSearchStatus] = []
    groups: list[list[SearchResult]] = []
    has_more = False
    for conn, outcome in zip(live, outcomes, strict=True):
        if isinstance(outcome, MarketplaceSearchStatus):
            statuses.append(outcome)
            continue
        group = [_result(item, p, fx, forwarding) for item in outcome.listings]
        groups.append(group)
        has_more = has_more or outcome.next_offset is not None
        statuses.append(
            MarketplaceSearchStatus(
                id=conn.id,
                name=conn.name,
                status="ok",
                count=len(group),
                query_sent=outcome.query_sent,
            )
        )
    live_ids = {c.id for c in registry.enabled()}
    for entry in CATALOG:
        if entry.id in live_ids or (wanted is not None and entry.id not in wanted):
            continue
        statuses.append(
            MarketplaceSearchStatus(
                id=entry.id,
                name=entry.name,
                status="blocked" if entry.status is MarketplaceStatus.blocked else "not_configured",
                message=entry.notes,
            )
        )

    results = _interleave(groups)
    if p.sort in ("price_asc", "price_desc"):
        priced = [r for r in results if r.converted_price is not None]
        unpriced = [r for r in results if r.converted_price is None]
        priced.sort(
            key=lambda r: r.converted_price.amount if r.converted_price else Decimal(0),
            reverse=p.sort == "price_desc",
        )
        results = priced + unpriced  # unknown prices never sort as "cheapest"
    return SearchResponse(
        query=p.q,
        currency=p.currency,
        results=results,
        marketplaces=statuses,
        fx=FxInfo(source=fx.source, as_of=fx.as_of.isoformat()) if fx else None,
        page=p.page,
        has_more=has_more,
    )
