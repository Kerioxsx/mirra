"""Mapping for eBay Browse API item summaries (``item_summary/search`` and ``search_by_image``).

Response contract (eBay Buy APIs, Browse API ``SearchPagedCollection``): ``total``, ``offset``,
``limit``, ``next``, ``itemSummaries[]`` with ``itemId``, ``title``, ``price`` {value, currency},
``marketingPrice.originalPrice``, ``image.imageUrl``, ``additionalImages[]``, ``condition``,
``conditionId``, ``seller`` {username, feedbackPercentage, feedbackScore}, ``shippingOptions[]``
{shippingCostType, shippingCost, minEstimatedDeliveryDate, maxEstimatedDeliveryDate},
``itemLocation.country``, ``categories[]``, ``itemWebUrl``, ``itemAffiliateWebUrl``,
``qualifiedPrograms[]`` (e.g. AUTHENTICITY_GUARANTEE), ``buyingOptions[]``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from mirra.core.taxonomy import Authenticity, Availability, ListingCondition
from mirra.modules.marketplaces.base import (
    ConnectorQuery,
    Money,
    NormalizedListing,
    NormalizedSeller,
    ShippingQuote,
)
from mirra.modules.marketplaces.connectors.taobao.language import detect_category, detect_colors
from mirra.modules.pricing.authenticity import classify

# eBay's "Clothing, Shoes & Accessories" top-level category: keeps searches to fashion
FASHION_CATEGORY = "11450"

SORTS = {"relevance": None, "price_asc": "price", "price_desc": "-price", "newest": "newlyListed"}

# conditionId -> Mirra condition (eBay condition IDs; clothing uses 1000/1500/1750/3000)
CONDITIONS: dict[str, ListingCondition] = {
    "1000": ListingCondition.new_with_tags,
    "1500": ListingCondition.new_without_tags,
    "1750": ListingCondition.new,
    "2000": ListingCondition.refurbished,
    "2010": ListingCondition.refurbished,
    "2020": ListingCondition.refurbished,
    "2030": ListingCondition.refurbished,
    "2500": ListingCondition.refurbished,
    "2750": ListingCondition.used_like_new,
    "3000": ListingCondition.used_good,
    "4000": ListingCondition.used_good,
    "5000": ListingCondition.used_good,
    "6000": ListingCondition.used_fair,
}

CONDITION_FILTERS: dict[ListingCondition, list[str]] = {
    ListingCondition.new: ["1000", "1500", "1750"],
    ListingCondition.new_with_tags: ["1000"],
    ListingCondition.new_without_tags: ["1500"],
    ListingCondition.used_like_new: ["2750"],
    ListingCondition.used_good: ["3000", "4000", "5000"],
    ListingCondition.used_fair: ["6000"],
    ListingCondition.refurbished: ["2000", "2010", "2020", "2030", "2500"],
}

AUTHENTICITY_GUARANTEE = "AUTHENTICITY_GUARANTEE"


def build_params(query: ConnectorQuery, marketplace_currency: str) -> dict[str, str]:
    """Search parameters for a query. Price filters are only sent in the marketplace's own currency
    (eBay filters by listing currency); other currencies are filtered after FX by the caller."""
    q = " ".join(p for p in (query.brand, query.text) if p).strip()
    params: dict[str, str] = {
        "category_ids": FASHION_CATEGORY,
        "limit": str(min(query.limit, 200)),
        "offset": str(query.offset),
    }
    if q:
        params["q"] = q[:350]
    filters: list[str] = []
    if query.currency == marketplace_currency and (query.price_min or query.price_max):
        lo = f"{query.price_min}" if query.price_min is not None else ""
        hi = f"{query.price_max}" if query.price_max is not None else ""
        filters.append(f"price:[{lo}..{hi}]")
        filters.append(f"priceCurrency:{marketplace_currency}")
    ids = sorted({i for c in query.conditions for i in CONDITION_FILTERS.get(c, [])})
    if ids:
        filters.append("conditionIds:{" + "|".join(ids) + "}")
    if query.ship_to_country:
        filters.append(f"deliveryCountry:{query.ship_to_country.upper()}")
    if filters:
        params["filter"] = ",".join(filters)
    sort = SORTS.get(query.sort)
    if sort:
        params["sort"] = sort
    return params


def _money(v: Any) -> Money | None:
    if not isinstance(v, dict):
        return None
    try:
        amount = Decimal(str(v.get("value")))
    except (InvalidOperation, TypeError):
        return None
    currency = str(v.get("currency") or "")
    if amount < 0 or len(currency) != 3:
        return None
    return Money(amount=amount, currency=currency.upper())


def _days_until(stamp: Any, now: datetime) -> int | None:
    if not isinstance(stamp, str):
        return None
    try:
        when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    return max(0, (when - now).days)


def map_item(
    item: dict[str, Any], ship_to: str | None, now: datetime | None = None
) -> NormalizedListing | None:
    item_id = item.get("itemId")
    title = item.get("title")
    url = item.get("itemAffiliateWebUrl") or item.get("itemWebUrl")
    if not item_id or not title or not url:
        return None
    now = now or datetime.now(UTC)
    categories = " ".join(str(c.get("categoryName", "")) for c in item.get("categories") or [])

    shipping: ShippingQuote | None = None
    options = item.get("shippingOptions") or []
    if options:
        first = options[0]
        cost = _money(first.get("shippingCost"))
        if first.get("shippingCostType") == "CALCULATED" and cost is None:
            cost = None  # depends on the buyer's address: unknown, never guessed
        shipping = ShippingQuote(
            cost=cost,
            ship_to_country=ship_to,
            min_days=_days_until(first.get("minEstimatedDeliveryDate"), now),
            max_days=_days_until(first.get("maxEstimatedDeliveryDate"), now),
        )

    seller_raw = item.get("seller") or {}
    seller = None
    if seller_raw.get("username"):
        try:
            pct = (
                Decimal(str(seller_raw["feedbackPercentage"]))
                if seller_raw.get("feedbackPercentage")
                else None
            )
        except InvalidOperation:
            pct = None
        seller = NormalizedSeller(
            external_id=str(seller_raw["username"]),
            name=str(seller_raw["username"]),
            feedback_score=int(seller_raw["feedbackScore"])
            if seller_raw.get("feedbackScore") is not None
            else None,
            feedback_percent=pct,
        )

    programs = set(item.get("qualifiedPrograms") or [])
    if AUTHENTICITY_GUARANTEE in programs:
        authenticity = Authenticity.authenticated
        reasons = ["Eligible for eBay's Authenticity Guarantee: eBay checks it before it ships"]
    else:
        verdict = classify(str(title))
        authenticity, reasons = verdict.value, verdict.reasons

    images = [
        i["imageUrl"]
        for i in [item.get("image") or {}, *(item.get("additionalImages") or [])]
        if i.get("imageUrl")
    ]
    price = _money(item.get("price"))
    original = _money((item.get("marketingPrice") or {}).get("originalPrice"))
    location = (item.get("itemLocation") or {}).get("country")
    return NormalizedListing(
        marketplace_id="ebay",
        external_id=str(item_id),
        url=str(url),
        title=str(title),
        category=detect_category(str(title), categories),
        colors=detect_colors(str(title)),
        image_urls=images,
        price=price,
        list_price=original if original and price and original.amount > price.amount else None,
        shipping=shipping,
        condition=CONDITIONS.get(str(item.get("conditionId") or ""), ListingCondition.unknown),
        authenticity=authenticity,
        authenticity_reasons=reasons,
        availability=Availability.in_stock if price else Availability.unknown,
        seller=seller,
        ships_from_country=str(location).upper() if location else None,
        title_language="en",
        source_url=str(item.get("itemWebUrl") or url),
    )


def map_page(
    body: dict[str, Any], ship_to: str | None
) -> tuple[list[NormalizedListing], int | None, int | None]:
    listings = [m for i in body.get("itemSummaries") or [] if (m := map_item(i, ship_to))]
    total = body.get("total")
    offset = int(body.get("offset") or 0)
    limit = int(body.get("limit") or len(listings))
    next_offset = offset + limit if body.get("next") else None
    return listings, int(total) if total is not None else None, next_offset
