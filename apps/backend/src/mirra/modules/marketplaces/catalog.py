"""Every marketplace Mirra tracks, including ones with no authorized access path yet.

See docs/architecture/marketplaces.md for the research behind each status.
"""

from __future__ import annotations

from dataclasses import dataclass

from mirra.core.taxonomy import IntegrationType, MarketplaceStatus


@dataclass(frozen=True)
class CatalogEntry:
    id: str
    name: str
    base_url: str
    integration_type: IntegrationType
    status: MarketplaceStatus
    notes: str


CATALOG: tuple[CatalogEntry, ...] = (
    CatalogEntry(
        "taobao",
        "Taobao",
        "https://world.taobao.com",
        IntegrationType.official_api,
        MarketplaceStatus.planned,
        "Taobao's official affiliate API for overseas shoppers: English titles, local prices, "
        "Tmall stores included.",
    ),
    CatalogEntry(
        "ebay",
        "eBay",
        "https://www.ebay.com",
        IntegrationType.official_api,
        MarketplaceStatus.planned,
        "eBay's official Browse API: new and pre-owned clothing, searched by text or photo.",
    ),
    CatalogEntry(
        "etsy",
        "Etsy",
        "https://www.etsy.com",
        IntegrationType.official_api,
        MarketplaceStatus.planned,
        "Etsy's open API: strong for vintage and independent makers.",
    ),
    CatalogEntry(
        "amazon",
        "Amazon",
        "https://www.amazon.com",
        IntegrationType.official_api,
        MarketplaceStatus.planned,
        "Amazon's Creators API, open to Associates accounts with qualifying sales.",
    ),
    CatalogEntry(
        "asos",
        "ASOS",
        "https://www.asos.com",
        IntegrationType.affiliate_feed,
        MarketplaceStatus.planned,
        "Affiliate product feed via an affiliate network.",
    ),
    CatalogEntry(
        "nike",
        "Nike",
        "https://www.nike.com",
        IntegrationType.affiliate_feed,
        MarketplaceStatus.planned,
        "Affiliate product feed via an affiliate network.",
    ),
    CatalogEntry(
        "adidas",
        "adidas",
        "https://www.adidas.com",
        IntegrationType.affiliate_feed,
        MarketplaceStatus.planned,
        "Affiliate product feed via an affiliate network.",
    ),
    CatalogEntry(
        "depop",
        "Depop",
        "https://www.depop.com",
        IntegrationType.partner_api,
        MarketplaceStatus.blocked,
        "Depop's API is invite-only and for sellers; buyer search needs a partnership.",
    ),
    CatalogEntry(
        "grailed",
        "Grailed",
        "https://www.grailed.com",
        IntegrationType.partner_api,
        MarketplaceStatus.blocked,
        "No official public API; partnership required.",
    ),
)
