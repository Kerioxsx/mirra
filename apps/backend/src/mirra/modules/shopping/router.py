"""Saved products, shopping events and history (private to the signed-in user, deletable)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from mirra.core.errors import ErrorResponse, NotFound
from mirra.core.taxonomy import ShoppingEventType
from mirra.modules.auth.deps import CurrentUser, SessionDep
from mirra.modules.listings.summary import summarize
from mirra.modules.marketplaces.repository import get_listing, get_listings
from mirra.modules.shopping.models import SavedProduct, SearchHistory, ShoppingEvent
from mirra.modules.shopping.schemas import (
    EventEntry,
    EventRequest,
    SavedItem,
    SaveRequest,
    SearchEntry,
    ShoppingHistory,
)

router = APIRouter(
    tags=["shopping"], responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}
)


@router.get("/saved", response_model=list[SavedItem])
async def list_saved(user: CurrentUser, session: SessionDep) -> list[SavedItem]:
    rows = (
        (
            await session.execute(
                select(SavedProduct)
                .where(SavedProduct.user_id == user.id, SavedProduct.listing_id.is_not(None))
                .order_by(SavedProduct.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    listings = await get_listings(session, [r.listing_id for r in rows if r.listing_id])
    return [
        SavedItem(
            listing_id=r.listing_id,
            saved_at=r.created_at,
            listing=summarize(listings[r.listing_id]),
        )
        for r in rows
        if r.listing_id in listings
    ]


@router.post("/saved", response_model=SavedItem, status_code=status.HTTP_201_CREATED)
async def save_listing(body: SaveRequest, user: CurrentUser, session: SessionDep) -> SavedItem:
    stored = await get_listing(session, body.listing_id)
    if stored is None:
        raise NotFound("Listing not found")
    await session.execute(
        insert(SavedProduct)
        .values(user_id=user.id, listing_id=body.listing_id)
        .on_conflict_do_nothing(index_elements=["user_id", "product_id", "listing_id"])
    )
    await session.commit()
    row = (
        await session.execute(
            select(SavedProduct).where(
                SavedProduct.user_id == user.id, SavedProduct.listing_id == body.listing_id
            )
        )
    ).scalar_one()
    return SavedItem(listing_id=body.listing_id, saved_at=row.created_at, listing=summarize(stored))


@router.delete("/saved/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_listing(listing_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Response:
    await session.execute(
        delete(SavedProduct).where(
            SavedProduct.user_id == user.id, SavedProduct.listing_id == listing_id
        )
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/shopping/events", status_code=status.HTTP_204_NO_CONTENT)
async def record_event(body: EventRequest, user: CurrentUser, session: SessionDep) -> Response:
    """Record that the shopper viewed a listing or clicked through to the marketplace."""
    if await get_listing(session, body.listing_id) is None:
        raise NotFound("Listing not found")
    session.add(
        ShoppingEvent(
            user_id=user.id, event=ShoppingEventType(body.event), listing_id=body.listing_id
        )
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/shopping/history", response_model=ShoppingHistory)
async def get_history(user: CurrentUser, session: SessionDep) -> ShoppingHistory:
    searches = (
        (
            await session.execute(
                select(SearchHistory)
                .where(SearchHistory.user_id == user.id, SearchHistory.query_text.is_not(None))
                .order_by(SearchHistory.created_at.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    events = (
        (
            await session.execute(
                select(ShoppingEvent)
                .where(ShoppingEvent.user_id == user.id, ShoppingEvent.listing_id.is_not(None))
                .order_by(ShoppingEvent.created_at.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    listings = await get_listings(session, list({e.listing_id for e in events if e.listing_id}))
    return ShoppingHistory(
        searches=[
            SearchEntry(
                query=s.query_text or "", result_count=s.result_count, created_at=s.created_at
            )
            for s in searches
        ],
        events=[
            EventEntry(
                event=e.event.value,
                created_at=e.created_at,
                listing=summarize(listings[e.listing_id]),
            )
            for e in events
            if e.listing_id in listings
        ],
    )


@router.delete("/shopping/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_history(user: CurrentUser, session: SessionDep) -> Response:
    """Delete every search and shopping event for this user. Saved items are kept."""
    await session.execute(delete(SearchHistory).where(SearchHistory.user_id == user.id))
    await session.execute(delete(ShoppingEvent).where(ShoppingEvent.user_id == user.id))
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
