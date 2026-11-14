from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select

from mirra.core.config import get_settings
from mirra.core.errors import ErrorResponse, Unprocessable
from mirra.core.ratelimit import rate_limit
from mirra.modules.agents.kakobuy import kakobuy_route
from mirra.modules.agents.links import SOURCE_NAMES, LinkError, parse_item_link
from mirra.modules.agents.schemas import LinkResolution, ResolveRequest
from mirra.modules.auth.deps import SessionDep
from mirra.modules.marketplaces.models import MarketplaceListing

router = APIRouter(prefix="/links", tags=["agents"], responses={422: {"model": ErrorResponse}})


@router.post(
    "/resolve",
    response_model=LinkResolution,
    dependencies=[Depends(rate_limit("links", limit=60, window=60))],
)
async def resolve_link(body: ResolveRequest, session: SessionDep) -> LinkResolution:
    """Recognise a pasted Taobao / Tmall / Weidian / 1688 / KakoBuy link and offer ways to buy it.
    Nothing is fetched from the marketplace; product details are only known if Mirra already has the
    listing from a search."""
    try:
        source = parse_item_link(body.url)
    except LinkError as exc:
        raise Unprocessable(str(exc)) from exc
    stored_id = (
        await session.execute(
            select(MarketplaceListing.id)
            .where(MarketplaceListing.raw["source_url"].astext == source.canonical_url)
            .limit(1)
        )
    ).scalar_one_or_none()
    route = kakobuy_route(None, get_settings(), source=source)
    return LinkResolution(
        source=source.source,
        source_name=SOURCE_NAMES[source.source],
        item_id=source.item_id,
        canonical_url=source.canonical_url,
        routes=[route] if route else [],
        listing_id=stored_id,
    )
