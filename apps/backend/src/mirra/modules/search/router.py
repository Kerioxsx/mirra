from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from mirra.core.config import get_settings
from mirra.core.errors import ErrorResponse
from mirra.core.ratelimit import rate_limit
from mirra.core.taxonomy import Category, SearchQueryType
from mirra.modules.auth.deps import OptionalUser, SessionDep
from mirra.modules.marketplaces.base import Money
from mirra.modules.pricing.fx import FxProvider
from mirra.modules.pricing.landed_cost import ForwardingRate
from mirra.modules.search import service
from mirra.modules.search.schemas import SearchResponse, Sort
from mirra.modules.shopping.models import SearchHistory
from mirra.modules.users.service import get_preferences

router = APIRouter(prefix="/search", tags=["search"], responses={429: {"model": ErrorResponse}})


@router.get(
    "",
    response_model=SearchResponse,
    dependencies=[Depends(rate_limit("search", limit=60, window=60))],
)
async def search(
    request: Request,
    session: SessionDep,
    user: OptionalUser,
    q: Annotated[str, Query(max_length=200)] = "",
    marketplace: Annotated[list[str] | None, Query(max_length=20)] = None,
    sort: Sort = "relevance",
    price_min: Annotated[Decimal | None, Query(ge=0)] = None,
    price_max: Annotated[Decimal | None, Query(ge=0)] = None,
    category: Category | None = None,
    currency: Annotated[str | None, Query(pattern=r"^[A-Z]{3}$")] = None,
    ship_to: Annotated[str | None, Query(pattern=r"^[A-Z]{2}$")] = None,
    page: Annotated[int, Query(ge=1, le=50)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 24,
) -> SearchResponse:
    """Search every connected marketplace. Results keep their marketplace, seller and original link;
    prices are converted to the shopper's currency (approximate) with an estimated landed cost."""
    s = get_settings()
    if user is not None and (currency is None or ship_to is None):
        prefs = await get_preferences(session, user.id)
        currency = currency or prefs.currency
        ship_to = ship_to or prefs.ship_to_country
    fx_provider: FxProvider = request.app.state.fx
    fx = await fx_provider.rates()
    forwarding = (
        ForwardingRate(
            per_kg=Money(amount=s.forwarding_rate_per_kg, currency=s.forwarding_currency)
        )
        if s.forwarding_rate_per_kg is not None
        else None
    )
    params = service.SearchParams(
        q=q.strip(),
        currency=currency or "USD",
        ship_to_country=ship_to,
        sort=sort,
        price_min=price_min,
        price_max=price_max,
        category=category,
        marketplaces=tuple(marketplace) if marketplace else None,
        page=page,
        page_size=page_size,
    )
    registry = request.app.state.registry
    result = await service.search(
        registry,
        params,
        fx=fx,
        forwarding=forwarding,
        time_limit=s.search_timeout_seconds,
        cache=request.app.state.page_cache,
    )
    await service.persist_results(session, registry, result.results)
    if user is not None and q.strip():
        session.add(
            SearchHistory(
                user_id=user.id,
                query_type=SearchQueryType.text,
                query_text=q.strip(),
                filters={"sort": sort, "category": category, "marketplaces": marketplace or []},
                parsed={m.id: m.query_sent for m in result.marketplaces if m.query_sent},
                result_count=len(result.results),
            )
        )
        await session.commit()
    return result
