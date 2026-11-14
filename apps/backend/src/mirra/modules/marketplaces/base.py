"""The marketplace connector contract.

Every marketplace is an independent connector. A connector implements only what its authorized
integration allows and says so in ``get_capabilities()``; everything else raises
``CapabilityNotSupported``. ``None`` always means "unknown" — never zero, never a guess.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from mirra.core.taxonomy import (
    Authenticity,
    Availability,
    Category,
    IntegrationType,
    ListingCondition,
    MarketplaceStatus,
)


class CapabilityNotSupported(Exception):
    def __init__(self, connector: str, capability: str) -> None:
        super().__init__(f"{connector} does not support {capability}")
        self.connector = connector
        self.capability = capability


class ConnectorUnavailable(Exception):
    """The provider failed or is misconfigured; the search engine skips it and reports it."""


class Money(BaseModel):
    amount: Decimal
    currency: str = Field(pattern=r"^[A-Z]{3}$")


class ConnectorCapabilities(BaseModel):
    text_search: bool = False
    image_search: bool = False
    product_details: bool = False
    seller_details: bool = False
    images: bool = False
    sizes: bool = False
    price: bool = False
    shipping: bool = False
    availability: bool = False
    reviews: bool = False
    filters: list[str] = Field(
        default_factory=list, description="Query fields the provider can filter on natively"
    )


class ConnectorQuery(BaseModel):
    text: str | None = Field(default=None, max_length=300)
    category: Category | None = None
    brand: str | None = None
    colors: list[str] = Field(default_factory=list)
    size: str | None = None
    conditions: list[ListingCondition] = Field(default_factory=list)
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    currency: str = "USD"
    ship_to_country: str | None = None
    sort: Literal["relevance", "price_asc", "price_desc", "newest"] = "relevance"
    limit: int = Field(default=24, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class NormalizedSeller(BaseModel):
    external_id: str
    name: str | None = None
    url: str | None = None
    country: str | None = None
    feedback_score: int | None = None
    feedback_percent: Decimal | None = None
    rating: Decimal | None = Field(default=None, description="Shop rating on a 0-5 scale")


class ShippingQuote(BaseModel):
    cost: Money | None = Field(description="None = unknown; amount 0 = free shipping")
    ship_to_country: str | None = None
    min_days: int | None = None
    max_days: int | None = None


class NormalizedListing(BaseModel):
    marketplace_id: str
    external_id: str
    url: str
    title: str
    brand: str | None = None
    category: Category | None = None
    colors: list[str] = Field(default_factory=list)
    image_urls: list[str] = Field(default_factory=list)
    price: Money | None = None
    shipping: ShippingQuote | None = None
    condition: ListingCondition = ListingCondition.unknown
    authenticity: Authenticity = Authenticity.unverified
    availability: Availability = Availability.unknown
    sizes_available: list[str] | None = None
    seller: NormalizedSeller | None = None
    review_rating: Decimal | None = None
    review_count: int | None = None
    gtin: str | None = None
    mpn: str | None = None
    # --- cross-border fields (Taobao and other international sources) ---
    original_title: str | None = Field(
        default=None, description="Title in the marketplace's language when `title` is translated"
    )
    title_language: str | None = Field(default=None, description="BCP-47 code of `title`")
    title_machine_translated: bool = False
    list_price: Money | None = Field(default=None, description="Struck-through original price")
    estimated_final_price: Money | None = Field(
        default=None, description="Marketplace's own estimate after coupons/promotions"
    )
    localized_price: Money | None = Field(
        default=None, description="Price converted by the marketplace itself, in a local currency"
    )
    ships_from_country: str | None = None
    store_badge: str | None = Field(default=None, description='e.g. "Tmall", "Official store"')
    sales_label: str | None = Field(default=None, description='e.g. "10k+ sold this year"')
    promotion_tags: list[str] = Field(default_factory=list)
    authenticity_reasons: list[str] = Field(
        default_factory=list, description="Why the listing got its authenticity label"
    )
    is_demo: bool = Field(default=False, description="Sample data, never a real listing")
    source_url: str | None = Field(
        default=None,
        description="Canonical item link on the origin marketplace, when known (agents need it)",
    )


class ConnectorSearchPage(BaseModel):
    marketplace_id: str
    listings: list[NormalizedListing]
    total: int | None = None
    next_offset: int | None = None
    query_sent: str | None = Field(
        default=None, description="The query as sent to the provider (e.g. translated to Chinese)"
    )


class MarketplaceConnector(ABC):
    id: str
    name: str
    base_url: str
    integration_type: IntegrationType

    @abstractmethod
    def get_capabilities(self) -> ConnectorCapabilities: ...

    async def search_products(self, query: ConnectorQuery) -> ConnectorSearchPage:
        raise CapabilityNotSupported(self.id, "search_products")

    async def search_by_image(self, image: bytes, query: ConnectorQuery) -> ConnectorSearchPage:
        raise CapabilityNotSupported(self.id, "search_by_image")

    async def get_product(self, external_id: str) -> NormalizedListing | None:
        raise CapabilityNotSupported(self.id, "get_product")

    async def get_seller(self, external_id: str) -> NormalizedSeller | None:
        raise CapabilityNotSupported(self.id, "get_seller")

    async def get_product_images(self, external_id: str) -> list[str]:
        raise CapabilityNotSupported(self.id, "get_product_images")

    async def get_available_sizes(self, external_id: str) -> list[str] | None:
        raise CapabilityNotSupported(self.id, "get_available_sizes")

    async def get_price(self, external_id: str) -> Money | None:
        raise CapabilityNotSupported(self.id, "get_price")

    async def get_shipping(self, external_id: str, ship_to: str | None) -> ShippingQuote | None:
        raise CapabilityNotSupported(self.id, "get_shipping")

    async def check_availability(self, external_id: str) -> Availability:
        raise CapabilityNotSupported(self.id, "check_availability")

    async def aclose(self) -> None:  # noqa: B027 - optional hook
        """Release network resources."""


class MarketplaceInfo(BaseModel):
    """A marketplace Mirra knows about, whether or not a connector is live."""

    id: str
    name: str
    base_url: str
    integration_type: IntegrationType
    status: MarketplaceStatus
    enabled: bool = Field(description="True when a configured connector is serving requests")
    capabilities: ConnectorCapabilities
    notes: str | None = None
