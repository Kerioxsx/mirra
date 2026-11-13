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
        "Official overseas Taobao affiliate API (English titles, local prices, Tmall included). "
        "Live when MIRRA_TAOBAO_APP_KEY / _APP_SECRET / _ADZONE_ID are set.",
    ),
    CatalogEntry(
        "ebay",
        "eBay",
        "https://www.ebay.com",
        IntegrationType.official_api,
        MarketplaceStatus.planned,
        "Browse API (text + image search). Live when MIRRA_EBAY_CLIENT_ID/SECRET are set.",
    ),
    CatalogEntry(
        "etsy",
        "Etsy",
        "https://www.etsy.com",
        IntegrationType.official_api,
        MarketplaceStatus.planned,
        "Open API v3; strong for vintage and independent makers.",
    ),
    CatalogEntry(
        "amazon",
        "Amazon",
        "https://www.amazon.com",
        IntegrationType.official_api,
        MarketplaceStatus.planned,
        "Creators API (PA-API 5.0 retired); needs an Associates account with qualifying sales.",
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
        "Selling API is invite-only and seller-side; no buyer search access without a partnership.",
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
