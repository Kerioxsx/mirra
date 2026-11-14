"""Listing pages: one stored listing with costs and price history, and its cheaper alternatives."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from mirra.core.config import get_settings
from mirra.core.errors import ErrorResponse, NotFound
from mirra.core.ratelimit import rate_limit
from mirra.modules.auth.deps import SessionDep
from mirra.modules.listings.schemas import (
    Alternative,
    AlternativesResponse,
    ListingDetail,
    PricePoint,
)
from mirra.modules.marketplaces.base import Money
from mirra.modules.marketplaces.registry import ConnectorRegistry
from mirra.modules.marketplaces.repository import get_listing, price_history
from mirra.modules.pricing import deals
from mirra.modules.search import service
from mirra.modules.search.context import ShopperContext, ShopperDep
from mirra.modules.shopping.models import SavedProduct

router = APIRouter(prefix="/listings", tags=["listings"], responses={404: {"model": ErrorResponse}})


def _params(shopper: ShopperContext, **kw: object) -> service.SearchParams:
    return service.SearchParams(currency=shopper.currency, ship_to_country=shopper.ship_to, **kw)  # type: ignore[arg-type]


def _name(request: Request, marketplace_id: str) -> str:
    registry: ConnectorRegistry = request.app.state.registry
    return next((m.name for m in registry.describe() if m.id == marketplace_id), marketplace_id)


@router.get("/{listing_id}", response_model=ListingDetail)
async def get_listing_detail(
    listing_id: uuid.UUID, request: Request, session: SessionDep, shopper: ShopperDep
) -> ListingDetail:
    """A stored listing, priced for this shopper, with the prices Mirra has seen over time."""
    stored = await get_listing(session, listing_id)
    if stored is None:
        raise NotFound("Listing not found")
    result = service.build_result(
        stored.listing, _params(shopper, q=""), shopper.fx, shopper.forwarding
    )
    result.listing_id = stored.id
    history = [
        PricePoint(
            price=Money(amount=row.price_amount, currency=row.price_currency),
            shipping=Money(amount=row.shipping_amount, currency=row.price_currency)
            if row.shipping_amount is not None
            else None,
            observed_at=row.observed_at,
        )
        for row in await price_history(session, listing_id)
    ]
    saved = False
    if shopper.user is not None:
        saved = (
            await session.execute(
                select(SavedProduct.id).where(
                    SavedProduct.user_id == shopper.user.id, SavedProduct.listing_id == listing_id
                )
            )
        ).first() is not None
    return ListingDetail(
        id=stored.id,
        result=result,
        marketplace_name=_name(request, stored.listing.marketplace_id),
        fetched_at=stored.fetched_at,
        stale=stored.is_stale,
        price_history=history,
        saved=saved,
        fx=shopper.fx_info,
    )


@router.get(
    "/{listing_id}/alternatives",
    response_model=AlternativesResponse,
    dependencies=[Depends(rate_limit("alternatives", limit=30, window=60))],
)
async def get_alternatives(
    listing_id: uuid.UUID, request: Request, session: SessionDep, shopper: ShopperDep
) -> AlternativesResponse:
    """Similar pieces across every live marketplace, cheapest first. Replicas are excluded."""
    stored = await get_listing(session, listing_id)
    if stored is None:
        raise NotFound("Listing not found")
    base = stored.listing
    query = deals.query_for(base)
    registry: ConnectorRegistry = request.app.state.registry
    found = await service.search(
        registry,
        _params(shopper, q=query, category=base.category, page_size=36),
        fx=shopper.fx,
        forwarding=shopper.forwarding,
        time_limit=get_settings().search_timeout_seconds,
        cache=request.app.state.page_cache,
    )
    candidates = [
        r
        for r in found.results
        if (r.listing.marketplace_id, r.listing.external_id)
        != (base.marketplace_id, base.external_id)
    ]
    replicas = [r for r in candidates if not deals.is_suggestible(r.listing)]
    candidates = [r for r in candidates if deals.is_suggestible(r.listing)]
    await service.persist_results(session, registry, candidates)

    base_result = service.build_result(base, _params(shopper, q=""), shopper.fx, shopper.forwarding)
    scored: list[Alternative] = []
    for r in candidates:
        m = deals.match(base, r.listing)
        if m.score < 0.4:
            continue
        scored.append(
            Alternative(
                result=r,
                match_score=m.score,
                match_reasons=m.reasons,
                savings=deals.savings(base_result.converted_price, r.converted_price),
            )
        )
    scored.sort(
        key=lambda a: (
            a.result.converted_price is None,
            float(a.result.converted_price.amount) if a.result.converted_price else 0.0,
        )
    )
    return AlternativesResponse(
        base_id=stored.id,
        query_used=query,
        currency=shopper.currency,
        alternatives=scored[:12],
        excluded_replicas=len(replicas),
        marketplaces=[m for m in found.marketplaces if m.status in ("ok", "error", "timeout")],
        fx=shopper.fx_info,
    )
