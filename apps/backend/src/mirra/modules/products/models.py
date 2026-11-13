"""Normalized products. One product can have many marketplace listings."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from mirra.core.taxonomy import Category
from mirra.db.base import Base, Timestamps, UUIDPk
from mirra.db.types import str_enum

EMBEDDING_DIMENSIONS = 768


class Product(UUIDPk, Timestamps, Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_products_attributes", "attributes", postgresql_using="gin"),
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(String(120), index=True)
    category: Mapped[Category | None] = mapped_column(
        str_enum(Category, constrained=False), index=True
    )
    department: Mapped[str | None] = mapped_column(String(32))  # menswear, womenswear, unisex…
    description: Mapped[str | None] = mapped_column(Text)
    colors: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    # pattern, material, silhouette, fit, graphics, distinctive features…
    attributes: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    gtin: Mapped[str | None] = mapped_column(String(14), index=True)
    mpn: Mapped[str | None] = mapped_column(String(80))
    style_code: Mapped[str | None] = mapped_column(String(80))
    # normalized brand+mpn/style code, used to merge listings of the same product
    canonical_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(brand, ''))",
            persisted=True,
        ),
    )


class ProductImage(UUIDPk, Base):
    __tablename__ = "product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("marketplace_listings.id", ondelete="SET NULL")
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    storage_key: Mapped[str | None] = mapped_column(Text)  # our cached copy, if terms allow
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProductEmbedding(UUIDPk, Base):
    """Image or text embedding in a shared vision-language space (CLIP/SigLIP class, 768-d)."""

    __tablename__ = "product_embeddings"
    __table_args__ = (
        UniqueConstraint("product_id", "image_id", "model", "kind"),
        Index(
            "ix_product_embeddings_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    image_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_images.id", ondelete="CASCADE")
    )
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # "image" | "text"
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
