from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from mirra.core.taxonomy import BodyRegion, OutfitSource
from mirra.db.base import Base, Timestamps, UUIDPk
from mirra.db.types import str_enum


class Outfit(UUIDPk, Timestamps, Base):
    __tablename__ = "outfits"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    avatar_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("avatars.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    style_tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    source: Mapped[OutfitSource] = mapped_column(
        str_enum(OutfitSource), default=OutfitSource.manual, server_default="manual"
    )
    ai_rationale: Mapped[str | None] = mapped_column(Text)
    # Sum of known item prices only; `price_complete` is false if any item price is unknown.
    total_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    price_complete: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    share_slug: Mapped[str | None] = mapped_column(String(40), unique=True)

    items: Mapped[list[OutfitItem]] = relationship(
        back_populates="outfit",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="OutfitItem.position",
    )


class OutfitItem(UUIDPk, Base):
    __tablename__ = "outfit_items"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(wardrobe_item_id, product_id, listing_id, garment_asset_id) > 0",
            name="has_reference",
        ),
    )

    outfit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("outfits.id", ondelete="CASCADE"), index=True
    )
    body_region: Mapped[BodyRegion] = mapped_column(str_enum(BodyRegion, constrained=False))
    layer: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    wardrobe_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wardrobe_items.id", ondelete="SET NULL")
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL")
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="SET NULL")
    )
    garment_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("garment_assets.id", ondelete="SET NULL")
    )
    color_variant: Mapped[str | None] = mapped_column(String(40))
    color_hex: Mapped[str | None] = mapped_column(String(7))

    outfit: Mapped[Outfit] = relationship(back_populates="items")
