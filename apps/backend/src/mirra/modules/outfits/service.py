"""Saved outfits. Layout (region, layer) comes from the backend taxonomy, never from the client."""

from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from mirra.core.errors import NotFound, Unprocessable
from mirra.core.taxonomy import (
    CATEGORY_SPECS,
    FULL_BODY_COVERS,
    LAYER_BASE,
    BodyRegion,
    Category,
    Fidelity,
)
from mirra.modules.garments.models import GarmentAsset
from mirra.modules.listings.summary import summarize
from mirra.modules.marketplaces.base import Money
from mirra.modules.marketplaces.repository import StoredListing, get_listings
from mirra.modules.outfits.models import Outfit, OutfitItem
from mirra.modules.outfits.schemas import OutfitIn, OutfitItemOut, OutfitOut


def slot(category: Category) -> tuple[BodyRegion, int]:
    _, _, region, layer = CATEGORY_SPECS[category]
    return region, layer


def validate_layout(categories: list[Category]) -> None:
    seen: dict[tuple[BodyRegion, int], Category] = {}
    for cat in categories:
        s = slot(cat)
        if s in seen:
            raise Unprocessable(f"{seen[s].value} and {cat.value} can't be worn in the same slot")
        seen[s] = cat
    if any(region is BodyRegion.full_body for region, _ in seen):
        for region in FULL_BODY_COVERS:
            covered = seen.get((region, LAYER_BASE))
            if covered is not None:
                raise Unprocessable(f"A one-piece covers the {region.value}; remove the {covered.value}")


async def _generic_garment(session: AsyncSession, category: Category) -> uuid.UUID:
    label, _, region, layer = CATEGORY_SPECS[category]
    slug = f"generic.{category.value}"
    await session.execute(
        insert(GarmentAsset)
        .values(
            slug=slug,
            name=label.removesuffix("s")
            if label.endswith("s") and not label.endswith("ss")
            else label,
            category=category,
            body_region=region,
            layer=layer,
            fidelity=Fidelity.generic,
            parametric={"generic_category": category.value},
        )
        .on_conflict_do_nothing(index_elements=["slug"])
    )
    return (
        await session.execute(select(GarmentAsset.id).where(GarmentAsset.slug == slug))
    ).scalar_one()


def _totals(
    items: list[OutfitItem], listings: dict[uuid.UUID, StoredListing]
) -> tuple[list[Money], bool]:
    sums: dict[str, Decimal] = defaultdict(Decimal)
    complete = True
    for it in items:
        if it.listing_id is None:
            continue
        stored = listings.get(it.listing_id)
        price = stored.listing.price if stored else None
        if price is None:
            complete = False
            continue
        sums[price.currency] += Decimal(price.amount)
    return [
        Money(amount=v.quantize(Decimal("0.01")), currency=c) for c, v in sorted(sums.items())
    ], complete


async def to_out(session: AsyncSession, outfit: Outfit) -> OutfitOut:
    listings = await get_listings(session, [i.listing_id for i in outfit.items if i.listing_id])
    totals, complete = _totals(outfit.items, listings)
    items = []
    for it in sorted(outfit.items, key=lambda i: i.position):
        stored = listings.get(it.listing_id) if it.listing_id else None
        category = stored.listing.category if stored and stored.listing.category else None
        if category is None:
            # generic pieces carry their category on the garment asset slug
            asset = (
                await session.get(GarmentAsset, it.garment_asset_id)
                if it.garment_asset_id
                else None
            )
            category = asset.category if asset else None
        if category is None:
            continue
        items.append(
            OutfitItemOut(
                category=category,
                body_region=it.body_region,
                layer=it.layer,
                color_hex=it.color_hex or "#8a8d91",
                fidelity="approximate" if stored else "generic",
                listing=summarize(stored) if stored else None,
            )
        )
    return OutfitOut(
        id=outfit.id,
        name=outfit.name,
        created_at=outfit.created_at,
        updated_at=outfit.updated_at,
        items=items,
        totals=totals,
        price_complete=complete,
    )


async def create(session: AsyncSession, user_id: uuid.UUID, data: OutfitIn) -> Outfit:
    validate_layout([i.category for i in data.items])
    listing_ids = [i.listing_id for i in data.items if i.listing_id]
    listings = await get_listings(session, listing_ids)
    missing = [str(lid) for lid in listing_ids if lid not in listings]
    if missing:
        raise Unprocessable("Some products no longer exist", details={"listing_ids": missing})
    for i in data.items:
        if i.listing_id and listings[i.listing_id].listing.category not in (None, i.category):
            raise Unprocessable(f"Listing {i.listing_id} is not a {i.category.value}")

    outfit = Outfit(user_id=user_id, name=data.name)
    for pos, i in enumerate(data.items):
        region, layer = slot(i.category)
        outfit.items.append(
            OutfitItem(
                body_region=region,
                layer=layer,
                position=pos,
                color_hex=i.color_hex.lower(),
                listing_id=i.listing_id,
                garment_asset_id=None
                if i.listing_id
                else await _generic_garment(session, i.category),
            )
        )
    totals, complete = _totals(outfit.items, listings)
    outfit.price_complete = complete
    if len(totals) == 1:
        outfit.total_price, outfit.currency = totals[0].amount, totals[0].currency
    session.add(outfit)
    await session.commit()
    return await get_owned(session, user_id, outfit.id)


async def get_owned(session: AsyncSession, user_id: uuid.UUID, outfit_id: uuid.UUID) -> Outfit:
    outfit = (
        await session.execute(
            select(Outfit)
            .where(Outfit.id == outfit_id, Outfit.user_id == user_id)
            .options(selectinload(Outfit.items))
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if outfit is None:
        raise NotFound("Outfit not found")
    return outfit


async def list_owned(session: AsyncSession, user_id: uuid.UUID) -> list[Outfit]:
    rows = await session.execute(
        select(Outfit)
        .where(Outfit.user_id == user_id)
        .options(selectinload(Outfit.items))
        .order_by(Outfit.created_at.desc())
    )
    return list(rows.scalars())
