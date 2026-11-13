"""Saved products, search history and shopping events (feeds the Shopping History page)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from mirra.core.taxonomy import SearchQueryType, ShoppingEventType
from mirra.db.base import Base, UUIDPk
from mirra.db.types import str_enum


class SavedProduct(UUIDPk, Base):
    __tablename__ = "saved_products"
    __table_args__ = (
        CheckConstraint("num_nonnulls(product_id, listing_id) > 0", name="has_reference"),
        Index(
            "uq_saved_products_user_product_listing",
            "user_id",
            "product_id",
            "listing_id",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE")
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="CASCADE")
    )
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SearchHistory(UUIDPk, Base):
    __tablename__ = "search_history"
    __table_args__ = (Index("ix_search_history_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    query_type: Mapped[SearchQueryType] = mapped_column(str_enum(SearchQueryType), nullable=False)
    query_text: Mapped[str | None] = mapped_column(Text)
    upload_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uploads.id", ondelete="SET NULL")
    )
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    parsed: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    result_count: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShoppingEvent(UUIDPk, Base):
    __tablename__ = "shopping_events"
    __table_args__ = (Index("ix_shopping_events_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    event: Mapped[ShoppingEventType] = mapped_column(str_enum(ShoppingEventType), nullable=False)
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="SET NULL")
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
