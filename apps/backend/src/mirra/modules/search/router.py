from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile

from mirra.core.config import get_settings
from mirra.core.errors import ErrorResponse, Unprocessable
from mirra.core.ratelimit import rate_limit
from mirra.core.taxonomy import CATEGORY_SPECS, Category, SearchQueryType
from mirra.modules.auth.deps import SessionDep
from mirra.modules.marketplaces.base import (
    CapabilityNotSupported,
    ConnectorQuery,
    ConnectorUnavailable,
)
from mirra.modules.search import service
from mirra.modules.search.context import ShopperDep
from mirra.modules.search.photo import MAX_PHOTO_BYTES, sniff
from mirra.modules.search.schemas import (
    MarketplaceSearchStatus,
    PhotoGarment,
    PhotoInfo,
    PhotoSearchResponse,
    SearchResponse,
    Sort,
)
from mirra.modules.shopping.models import SearchHistory

log = logging.getLogger(__name__)

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


@router.post(
    "/photo",
    response_model=PhotoSearchResponse,
    responses={422: {"model": ErrorResponse}},
    dependencies=[Depends(rate_limit("photo-search", limit=12, window=60))],
)
async def photo_search(
    request: Request,
    session: SessionDep,
    shopper: ShopperDep,
    image: Annotated[UploadFile, File(description="JPEG, PNG, WebP or GIF, up to 5 MB")],
    category: Annotated[Category | None, Form()] = None,
    hint: Annotated[str, Form(max_length=120)] = "",
    garment: Annotated[int, Form(ge=0, le=3)] = 0,
) -> PhotoSearchResponse:
    """Search with a photo. Claude reads the garments when the server has a key (source
    ``vision``); otherwise the ``hint`` (colours worked out on the shopper's device plus the
    category they picked) is searched. Marketplaces with their own image search also get the
    photo. The photo is never stored."""
    data = await image.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise Unprocessable("Photos can be up to 5 MB.")
    media_type = sniff(data)
    if media_type is None:
        raise Unprocessable("Use a JPEG, PNG, WebP or GIF photo.")

    describer = request.app.state.describer
    reading = await describer.describe(data, media_type) if describer is not None else None
    if reading is not None and not reading.is_clothing and not hint.strip() and category is None:
        raise Unprocessable("That photo doesn't seem to show clothing. Try another one.")
    garments = [
        PhotoGarment(
            category=g.category,
            colors=g.colors,
            pattern=g.pattern,
            details=g.details,
            query=g.query,
        )
        for g in (reading.garments if reading else [])
    ]
    picked = garments[garment] if garment < len(garments) else (garments[0] if garments else None)
    query = (picked.query if picked else hint).strip()[:200]
    cat = category or (picked.category if picked else None)
    if not query and cat is not None:
        query = CATEGORY_SPECS[cat][0]
    registry = request.app.state.registry
    image_capable = [c for c in registry.enabled() if c.get_capabilities().image_search]
    if not query and not image_capable:
        raise Unprocessable("Pick what kind of piece it is, so Mirra knows what to search for.")

    params = service.SearchParams(
        q=query,
        currency=shopper.currency,
        ship_to_country=shopper.ship_to,
        category=cat,
        page_size=24,
    )
    timeout = get_settings().search_timeout_seconds
    if query:
        result = await service.search(
            registry,
            params,
            fx=shopper.fx,
            forwarding=shopper.forwarding,
            time_limit=timeout,
            cache=request.app.state.page_cache,
        )
    else:
        result = SearchResponse(
            query="", currency=shopper.currency, results=[], marketplaces=[], page=1, has_more=False
        )

    # marketplaces with their own image search see the photo itself; their matches lead
    seen = {(r.listing.marketplace_id, r.listing.external_id) for r in result.results}
    image_query = ConnectorQuery(
        category=cat, currency=shopper.currency, ship_to_country=shopper.ship_to, limit=12
    )
    for conn in image_capable:
        try:
            page = await asyncio.wait_for(conn.search_by_image(data, image_query), timeout=timeout)
        except (TimeoutError, CapabilityNotSupported, ConnectorUnavailable) as exc:
            log.warning("image search on %s failed: %s", conn.id, type(exc).__name__)
            result.marketplaces.append(
                MarketplaceSearchStatus(
                    id=conn.id, name=conn.name, status="error", message="Photo search unavailable"
                )
            )
            continue
        fresh = [
            service.build_result(item, params, shopper.fx, shopper.forwarding)
            for item in page.listings
            if (item.marketplace_id, item.external_id) not in seen
        ]
        result.results = fresh + result.results
    await service.persist_results(session, registry, result.results)
    if shopper.user is not None:
        session.add(
            SearchHistory(
                user_id=shopper.user.id,
                query_type=SearchQueryType.image,
                query_text=query or "photo",
                filters={"category": cat},
                parsed={"source": "vision" if picked else ("hint" if query else "image_only")},
                result_count=len(result.results),
            )
        )
        await session.commit()
    return PhotoSearchResponse(
        **result.model_dump(),
        photo=PhotoInfo(
            source="vision" if picked else ("hint" if query else "image_only"),
            query=query,
            category=cat,
            garments=garments,
            garment_index=min(garment, max(0, len(garments) - 1)),
            vision_available=describer is not None,
        ),
    )
