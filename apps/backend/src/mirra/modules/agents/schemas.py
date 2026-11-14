from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

from mirra.modules.pricing.landed_cost import LandedCost


class PurchaseRoute(BaseModel):
    """A way to buy a listing from abroad, e.g. through a purchasing agent."""

    id: str
    name: str
    kind: Literal["agent"] = "agent"
    available: bool
    url: str | None = None
    unavailable_reason: str | None = None
    landed_cost: LandedCost | None = None
    notes: list[str] = Field(default_factory=list)
    terms_checked: str | None = Field(
        default=None, description="When the agent's published fees were last checked"
    )


class ResolveRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4000)


class LinkResolution(BaseModel):
    source: Literal["taobao", "tmall", "weidian", "1688"]
    source_name: str
    item_id: str
    canonical_url: str
    routes: list[PurchaseRoute]
    listing_id: uuid.UUID | None = Field(
        default=None, description="A stored Mirra listing for the same item"
    )
