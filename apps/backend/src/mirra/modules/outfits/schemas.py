from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from mirra.core.taxonomy import BodyRegion, Category
from mirra.modules.listings.schemas import ListingSummary
from mirra.modules.marketplaces.base import Money

OutfitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class OutfitItemIn(BaseModel):
    category: Category
    color_hex: HexColor
    listing_id: uuid.UUID | None = Field(
        default=None, description="A stored listing (from search) for real products"
    )


class OutfitIn(BaseModel):
    name: OutfitName
    items: list[OutfitItemIn] = Field(min_length=1, max_length=30)


class OutfitRename(BaseModel):
    name: OutfitName


class OutfitItemOut(BaseModel):
    category: Category
    body_region: BodyRegion
    layer: int
    color_hex: str
    fidelity: Literal["generic", "approximate"]
    listing: ListingSummary | None = None


class OutfitOut(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime
    items: list[OutfitItemOut]
    totals: list[Money] = Field(description="Sum of known item prices, one entry per currency")
    price_complete: bool = Field(description="False if any product's price is unknown")
