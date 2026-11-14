"""Persistence for listings returned by connectors.

Each listing keeps its own seller, price, shipping, condition, availability and original URL, and
the full normalized record in ``raw`` so detail pages can be rebuilt. Price changes are appended to
``price_history``. ``expires_at`` marks when the data must be refreshed before being shown as current
(provider terms limit how long listing data may be displayed).
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from mirra.core.taxonomy import IntegrationType, MarketplaceStatus
from mirra.modules.marketplaces.base import NormalizedListing
from mirra.modules.marketplaces.models import Marketplace, MarketplaceListing, PriceHistory, Seller

LISTING_TTL = timedelta(hours=24)

ListingKey = tuple[str, str]  # (marketplace_id, external_id)


@dataclass(frozen=True)
class MarketplaceMeta:
    name: str
    base_url: str
    integration_type: IntegrationType


async def _ensure_marketplaces(session: AsyncSession, meta: Mapping[str, MarketplaceMeta]) -> None:
    for mid, m in meta.items():
        await session.execute(
            insert(Marketplace)
            .values(
                id=mid,
                name=m.name,
                base_url=m.base_url,
                integration_type=m.integration_type,
                status=MarketplaceStatus.active,
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )


async def upsert_listings(
    session: AsyncSession,
    listings: Sequence[NormalizedListing],
    meta: Mapping[str, MarketplaceMeta],
    *,
    now: datetime | None = None,
) -> dict[ListingKey, uuid.UUID]:
    """Insert or refresh listings; returns Mirra ids keyed by (marketplace, external id)."""
    if not listings:
        return {}
    now = now or datetime.now(UTC)
    await _ensure_marketplaces(
        session,
        {k: v for k, v in meta.items() if any(item.marketplace_id == k for item in listings)},
    )

    ids: dict[ListingKey, uuid.UUID] = {}
    for item in listings:
        seller_id: uuid.UUID | None = None
        if item.seller:
            s = item.seller
            seller_id = (
                await session.execute(
                    insert(Seller)
                    .values(
                        marketplace_id=item.marketplace_id,
                        external_id=s.external_id,
                        name=s.name,
                        url=s.url,
                        country=s.country,
                        feedback_score=s.feedback_score,
                        feedback_percent=s.feedback_percent,
                    )
                    .on_conflict_do_update(
                        index_elements=["marketplace_id", "external_id"],
                        set_={
                            "name": s.name,
                            "url": s.url,
                            "country": s.country,
                            "updated_at": now,
                        },
                    )
                    .returning(Seller.id)
                )
            ).scalar_one()

        shipping = item.shipping.cost if item.shipping else None
        values = {
            "marketplace_id": item.marketplace_id,
            "external_id": item.external_id,
            "seller_id": seller_id,
            "url": item.url,
            "title": item.title,
            "image_url": item.image_urls[0] if item.image_urls else None,
            "price_amount": item.price.amount if item.price else None,
            "price_currency": item.price.currency if item.price else None,
            "shipping_amount": shipping.amount if shipping else None,
            "shipping_currency": shipping.currency if shipping else None,
            "condition": item.condition,
            "authenticity": item.authenticity,
            "availability": item.availability,
            "sizes_available": item.sizes_available,
            "review_rating": item.review_rating,
            "review_count": item.review_count,
            "raw": item.model_dump(mode="json"),
            "fetched_at": now,
            "expires_at": now + LISTING_TTL,
        }
        update = {k: v for k, v in values.items() if k not in ("marketplace_id", "external_id")}
        listing_id = (
            await session.execute(
                insert(MarketplaceListing)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=["marketplace_id", "external_id"],
                    set_={**update, "updated_at": now},
                )
                .returning(MarketplaceListing.id)
            )
        ).scalar_one()
        ids[(item.marketplace_id, item.external_id)] = listing_id
        if item.price:
            await _record_price(
                session,
                listing_id,
                item.price.amount,
                item.price.currency,
                shipping.amount if shipping else None,
                now,
            )
    await session.commit()
    return ids


async def _record_price(
    session: AsyncSession,
    listing_id: uuid.UUID,
    amount: Decimal,
    currency: str,
    shipping: Decimal | None,
    now: datetime,
) -> None:
    last = (
        await session.execute(
            select(PriceHistory)
            .where(PriceHistory.listing_id == listing_id)
            .order_by(PriceHistory.observed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if (
        last
        and last.price_amount == amount
        and last.price_currency == currency
        and last.shipping_amount == shipping
    ):
        return
    session.add(
        PriceHistory(
            listing_id=listing_id,
            price_amount=amount,
            price_currency=currency,
            shipping_amount=shipping,
            observed_at=now,
        )
    )


@dataclass(frozen=True)
class StoredListing:
    id: uuid.UUID
    listing: NormalizedListing
    fetched_at: datetime
    expires_at: datetime | None

    @property
    def is_stale(self) -> bool:
        return self.expires_at is not None and self.expires_at <= datetime.now(UTC)


def to_stored(row: MarketplaceListing) -> StoredListing:
    return StoredListing(
        id=row.id,
        listing=NormalizedListing.model_validate(row.raw),
        fetched_at=row.fetched_at,
        expires_at=row.expires_at,
    )


async def get_listing(session: AsyncSession, listing_id: uuid.UUID) -> StoredListing | None:
    row = await session.get(MarketplaceListing, listing_id)
    return to_stored(row) if row is not None and row.raw else None


async def get_listings(
    session: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, StoredListing]:
    if not ids:
        return {}
    rows = (
        await session.execute(select(MarketplaceListing).where(MarketplaceListing.id.in_(ids)))
    ).scalars()
    return {row.id: to_stored(row) for row in rows if row.raw}


async def price_history(
    session: AsyncSession, listing_id: uuid.UUID, limit: int = 30
) -> list[PriceHistory]:
    rows = await session.execute(
        select(PriceHistory)
        .where(PriceHistory.listing_id == listing_id)
        .order_by(PriceHistory.observed_at.desc())
        .limit(limit)
    )
    return list(rows.scalars())
