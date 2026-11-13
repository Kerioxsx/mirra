"""Marketplaces, sellers, listings and price history.

A listing keeps its own seller, price, condition, shipping, availability and original URL,
independently of the normalized product it is matched to.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from mirra.core.taxonomy import (
    Authenticity,
    Availability,
    IntegrationType,
    ListingCondition,
    MarketplaceStatus,
)
from mirra.db.base import Base, Timestamps, UUIDPk
from mirra.db.types import str_enum


class Marketplace(Base):
    __tablename__ = "marketplaces"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # slug: "ebay", "depop"…
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    base_url: Mapped[str] = mapped_column(Text, nullable=False)
    integration_type: Mapped[IntegrationType] = mapped_column(
        str_enum(IntegrationType), nullable=False
    )
    status: Mapped[MarketplaceStatus] = mapped_column(str_enum(MarketplaceStatus), nullable=False)
    capabilities: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Seller(UUIDPk, Base):
    __tablename__ = "sellers"
    __table_args__ = (UniqueConstraint("marketplace_id", "external_id"),)

    marketplace_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("marketplaces.id", ondelete="CASCADE"), nullable=False
    )
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200))
    url: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(String(2))
    feedback_score: Mapped[int | None] = mapped_column(Integer)
    feedback_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MarketplaceListing(UUIDPk, Timestamps, Base):
    __tablename__ = "marketplace_listings"
    __table_args__ = (
        UniqueConstraint("marketplace_id", "external_id"),
        Index("ix_marketplace_listings_price", "price_currency", "price_amount"),
    )

    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    marketplace_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("marketplaces.id", ondelete="CASCADE"), nullable=False
    )
    seller_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sellers.id", ondelete="SET NULL")
    )
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)  # original listing link
    title: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text)
    price_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_currency: Mapped[str | None] = mapped_column(String(3))
    # NULL shipping = unknown; 0 = free shipping. Never conflate the two.
    shipping_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    shipping_currency: Mapped[str | None] = mapped_column(String(3))
    condition: Mapped[ListingCondition] = mapped_column(
        str_enum(ListingCondition), default=ListingCondition.unknown, server_default="unknown"
    )
    authenticity: Mapped[Authenticity] = mapped_column(
        str_enum(Authenticity), default=Authenticity.unverified, server_default="unverified"
    )
    availability: Mapped[Availability] = mapped_column(
        str_enum(Availability), default=Availability.unknown, server_default="unknown"
    )
    sizes_available: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    review_rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    review_count: Mapped[int | None] = mapped_column(Integer)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Provider terms may limit how long listing data can be shown without a refresh.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PriceHistory(Base):
    __tablename__ = "price_history"
    __table_args__ = (Index("ix_price_history_listing_observed", "listing_id", "observed_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE")
    )
    price_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    price_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    shipping_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
