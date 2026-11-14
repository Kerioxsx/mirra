from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from mirra.core.config import get_settings
from mirra.core.errors import ErrorResponse
from mirra.core.ratelimit import rate_limit
from mirra.core.taxonomy import Category, SearchQueryType
from mirra.modules.auth.deps import SessionDep
from mirra.modules.search import service
from mirra.modules.search.context import ShopperDep
from mirra.modules.search.schemas import SearchResponse, Sort
from mirra.modules.shopping.models import SearchHistory

router = APIRouter(prefix="/search", tags=["search"], responses={429: {"model": ErrorResponse}})


@router.get(
    "",
    response_model=SearchResponse,
    dependencies=[Depends(rate_limit("search", limit=60, window=60))],
)
async def search(
    request: Request,
    session: SessionDep,
    shopper: ShopperDep,
    q: Annotated[str, Query(max_length=200)] = "",
    marketplace: Annotated[list[str] | None, Query(max_length=20)] = None,
    sort: Sort = "relevance",
    price_min: Annotated[Decimal | None, Query(ge=0)] = None,
    price_max: Annotated[Decimal | None, Query(ge=0)] = None,
    category: Category | None = None,
    page: Annotated[int, Query(ge=1, le=50)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 24,
) -> SearchResponse:
    """Search every connected marketplace. Results keep their marketplace, seller and original link;
    prices are converted to the shopper's currency (approximate) with an estimated landed cost."""
    params = service.SearchParams(
        q=q.strip(),
        currency=shopper.currency,
        ship_to_country=shopper.ship_to,
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
        fx=shopper.fx,
        forwarding=shopper.forwarding,
        time_limit=get_settings().search_timeout_seconds,
        cache=request.app.state.page_cache,
    )
    await service.persist_results(session, registry, result.results)
    if shopper.user is not None and q.strip():
        session.add(
            SearchHistory(
                user_id=shopper.user.id,
                query_type=SearchQueryType.text,
                query_text=q.strip(),
                filters={"sort": sort, "category": category, "marketplaces": marketplace or []},
                parsed={m.id: m.query_sent for m in result.marketplaces if m.query_sent},
                result_count=len(result.results),
            )
        )
        await session.commit()
    return result
