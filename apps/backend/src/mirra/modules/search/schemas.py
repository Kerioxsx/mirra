from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from mirra.modules.marketplaces.base import Money, NormalizedListing
from mirra.modules.pricing.landed_cost import LandedCost

Sort = Literal["relevance", "price_asc", "price_desc", "newest"]


class SearchResult(BaseModel):
    listing_id: uuid.UUID | None = Field(
        default=None, description="Mirra's id for this listing (stable across searches)"
    )
    listing: NormalizedListing
    converted_price: Money | None = Field(
        description="Item price in the shopper's currency (approximate when converted)"
    )
    landed_cost: LandedCost | None = None


class MarketplaceSearchStatus(BaseModel):
    id: str
    name: str
    status: Literal["ok", "error", "timeout", "not_configured", "blocked"]
    count: int = 0
    query_sent: str | None = Field(
        default=None, description="e.g. the Chinese query sent to Taobao"
    )
    message: str | None = None


class FxInfo(BaseModel):
    source: str
    as_of: str


class SearchResponse(BaseModel):
    query: str
    currency: str
    results: list[SearchResult]
    marketplaces: list[MarketplaceSearchStatus]
    fx: FxInfo | None = None
    page: int
    has_more: bool
