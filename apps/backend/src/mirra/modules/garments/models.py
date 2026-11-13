"""3D garment assets (curated GLBs and parametric templates) and compatibility rules."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from mirra.core.taxonomy import BodyRegion, Category, Fidelity
from mirra.db.base import Base, Timestamps, UUIDPk
from mirra.db.types import str_enum


class GarmentAsset(UUIDPk, Timestamps, Base):
    __tablename__ = "garment_assets"
    __table_args__ = (
        CheckConstraint(
            "asset_path IS NOT NULL OR parametric IS NOT NULL", name="has_geometry_source"
        ),
        CheckConstraint("fidelity <> 'exact' OR product_id IS NOT NULL", name="exact_has_product"),
    )

    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[Category] = mapped_column(str_enum(Category, constrained=False), index=True)
    body_region: Mapped[BodyRegion] = mapped_column(str_enum(BodyRegion, constrained=False))
    layer: Mapped[int] = mapped_column(Integer, nullable=False)
    fidelity: Mapped[Fidelity] = mapped_column(str_enum(Fidelity), nullable=False)
    asset_path: Mapped[str | None] = mapped_column(Text)  # versioned GLB key in object storage
    parametric: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # template parameters
    thumbnail_path: Mapped[str | None] = mapped_column(Text)
    rig_version: Mapped[str] = mapped_column(String(32), default="mirra-rig@1")
    asset_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    avatar_compat: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    materials: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    color_variants: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL")
    )
    license: Mapped[str | None] = mapped_column(String(80))
    source: Mapped[str | None] = mapped_column(Text)


class GarmentCompatibility(Base):
    """Pairwise rules: ``conflicts`` (can't be worn together), ``requires``, ``hides``."""

    __tablename__ = "garment_compatibility"
    __table_args__ = (
        CheckConstraint("relation IN ('conflicts', 'requires', 'hides')", name="relation_kind"),
        CheckConstraint("garment_id <> other_garment_id", name="not_self"),
    )

    garment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("garment_assets.id", ondelete="CASCADE"), primary_key=True
    )
    other_garment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("garment_assets.id", ondelete="CASCADE"), primary_key=True
    )
    relation: Mapped[str] = mapped_column(String(16), primary_key=True)
    notes: Mapped[str | None] = mapped_column(Text)
