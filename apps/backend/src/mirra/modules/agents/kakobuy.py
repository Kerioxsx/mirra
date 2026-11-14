"""KakoBuy: a Chinese purchasing agent. Shoppers send it a marketplace link; it buys the item,
receives it at its warehouse (with optional QC photos) and ships internationally.

There is no public API, so the integration is link-based. The item-page format
``https://www.kakobuy.com/item/details?url=<encoded marketplace link>`` was verified against
KakoBuy's site on 2026-11-15. KakoBuy's Anti-Counterfeiting Policy prohibits buying counterfeits
(orders can be declined and accounts suspended), so listings that advertise as replicas are never
routed to it.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import quote, urlencode

from mirra.core.config import Settings
from mirra.core.taxonomy import Authenticity
from mirra.modules.agents.links import SourceLink, try_parse
from mirra.modules.agents.schemas import PurchaseRoute
from mirra.modules.marketplaces.base import Money, NormalizedListing
from mirra.modules.pricing.fx import FxRates
from mirra.modules.pricing.landed_cost import ExtraFee, ForwardingRate, estimate_landed_cost

AGENT_ID = "kakobuy"
AGENT_NAME = "KakoBuy"
# Marketplaces whose items KakoBuy can buy; listings from these may carry a canonical source link.
CHINA_MARKETPLACES = {"taobao", "tmall", "weidian", "1688"}

REPLICA_REASON = (
    "This listing advertises itself as a replica. KakoBuy prohibits buying counterfeits, "
    "and Mirra doesn't route them to agents."
)
NO_LINK_REASON = (
    "Mirra doesn't have this item's original link. Open it on the marketplace, copy the item link "
    "and paste it into Discover to buy through KakoBuy."
)

NOTES = [
    "KakoBuy buys the item for you, receives it at its warehouse in China and can send QC photos "
    "before you ship it.",
    "QC photos show condition and details — they are not proof of authenticity.",
    "KakoBuy's terms prohibit buying counterfeit goods.",
]


def build_link(source: SourceLink, s: Settings) -> str:
    url = s.kakobuy_link_template.replace("{url}", quote(source.canonical_url, safe=""))
    if s.kakobuy_referral_code:
        sep = "&" if "?" in url else "?"
        url += sep + urlencode({s.kakobuy_referral_param: s.kakobuy_referral_code})
    return url


def _fees(listing: NormalizedListing, s: Settings) -> list[ExtraFee]:
    assert listing.price is not None
    pct = s.kakobuy_service_fee_percent
    service = (Decimal(listing.price.amount) * pct / 100).quantize(Decimal("0.01"), ROUND_HALF_UP)
    return [
        ExtraFee(
            label="KakoBuy service fee",
            amount=Money(amount=service, currency=listing.price.currency),
            note="KakoBuy states its shopping-agent service is free"
            if pct == 0
            else f"{pct}% of the item price",
        ),
        ExtraFee(
            label="Customs declaration (per parcel)",
            amount=Money(amount=s.kakobuy_declaration_fee_cny, currency="CNY"),
            estimate=True,
            note="KakoBuy says this is generally ¥8, depending on the shipping method",
        ),
    ]


def kakobuy_route(
    listing: NormalizedListing | None,
    s: Settings,
    *,
    source: SourceLink | None = None,
    currency: str = "USD",
    fx: FxRates | None = None,
    forwarding: ForwardingRate | None = None,
) -> PurchaseRoute | None:
    """The KakoBuy route for a listing or a pasted link; None when KakoBuy doesn't apply."""
    if not s.kakobuy_enabled:
        return None
    if listing is not None:
        from_china = (
            listing.marketplace_id in CHINA_MARKETPLACES or listing.ships_from_country == "CN"
        )
        if not from_china:
            return None
        source = source or try_parse(listing.source_url)
    base = PurchaseRoute(
        id=AGENT_ID,
        name=AGENT_NAME,
        available=False,
        notes=NOTES,
        terms_checked=s.kakobuy_terms_checked,
    )

    if listing is not None and listing.authenticity is Authenticity.replica_advertised:
        return base.model_copy(update={"unavailable_reason": REPLICA_REASON})
    if listing is not None and listing.is_demo:
        return base.model_copy(
            update={"unavailable_reason": "Sample listing — there's nothing real to buy."}
        )
    if source is None:
        return base.model_copy(update={"unavailable_reason": NO_LINK_REASON})

    landed = None
    if listing is not None and listing.price is not None:
        landed = estimate_landed_cost(
            price=listing.price,
            target_currency=currency,
            fx=fx,
            domestic_shipping=listing.shipping.cost if listing.shipping else None,
            domestic_shipping_label="Shipping within China (seller → KakoBuy warehouse)",
            category=listing.category,
            cross_border=True,
            forwarding=forwarding,
            extra_fees=_fees(listing, s),
        )
    return base.model_copy(
        update={"available": True, "url": build_link(source, s), "landed_cost": landed}
    )
