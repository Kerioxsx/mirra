from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from mirra.core.taxonomy import Authenticity
from mirra.modules.agents.schemas import PurchaseRoute
from mirra.modules.marketplaces.base import Money
from mirra.modules.search.schemas import FxInfo, MarketplaceSearchStatus, SearchResult
from mirra.modules.sizing.schemas import SizeGuide


class PricePoint(BaseModel):
    price: Money
    shipping: Money | None = None
    observed_at: datetime


class ListingDetail(BaseModel):
    id: uuid.UUID
    result: SearchResult
    marketplace_name: str
    fetched_at: datetime = Field(
        description="When Mirra last fetched this listing from the marketplace"
    )
    stale: bool = Field(description="True when the data is older than the refresh window")
    price_history: list[PricePoint] = Field(description="Prices Mirra has observed, newest first")
    saved: bool = False
    fx: FxInfo | None = None
    purchase_routes: list[PurchaseRoute] = Field(
        default_factory=list, description="Ways to buy from abroad, e.g. through a purchasing agent"
    )
    size_guide: SizeGuide | None = Field(
        default=None, description="Chinese size labels the listing mentions, read (estimates)"
    )


class Alternative(BaseModel):
    result: SearchResult
    match_score: float = Field(ge=0, le=1, description="Heuristic similarity estimate")
    match_reasons: list[str]
    savings: Money | None = Field(
        description="Cheaper than the original by this much (same currency)"
    )


class AlternativesResponse(BaseModel):
    base_id: uuid.UUID
    query_used: str
    currency: str
    alternatives: list[Alternative]
    excluded_replicas: int = Field(
        description="Matches left out because they advertise as replicas"
    )
    marketplaces: list[MarketplaceSearchStatus]
    fx: FxInfo | None = None


class ListingSummary(BaseModel):
    """Compact listing card data for saved items, history and outfits."""

    id: uuid.UUID
    marketplace_id: str
    external_id: str
    title: str
    url: str
    image_url: str | None = None
    price: Money | None = None
    category: str | None = None
    colors: list[str] = Field(default_factory=list)
    authenticity: Authenticity
    store_badge: str | None = None
    is_demo: bool = False
    stale: bool = False
