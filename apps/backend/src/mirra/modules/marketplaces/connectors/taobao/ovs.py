"""Mapping for ``taobao.ovs.tbk.material.item.optional`` (Taobao affiliate, overseas publishers).

Response contract (Taobao Open Platform API doc 72807):
``ovs_tbk_material_item_optional_response`` → ``total_results``, ``next_page``, ``has_next``,
``result_list`` → ``material_item_summary_info[]`` with ``item_id``, ``item_basic_info``,
``price_promotion_info``, ``publish_info``, ``coupon_info``, ``presale_info``.
Raw prices are RMB (yuan) strings; ``*_localized_price`` objects carry the site currency.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from mirra.core.taxonomy import Availability, ListingCondition
from mirra.modules.marketplaces.base import (
    Money,
    NormalizedListing,
    NormalizedSeller,
    ShippingQuote,
)
from mirra.modules.marketplaces.connectors.taobao.language import detect_category, detect_colors
from mirra.modules.pricing.authenticity import classify

METHOD = "taobao.ovs.tbk.material.item.optional"

# Sites the API supports; anything else uses GLOBAL (which skips restricted-sale filtering).
SUPPORTED_SITES = {"TW", "HK", "MY", "SG", "AU", "CA", "MO"}

SORTS = {
    "relevance": None,  # provider default (match score)
    "price_asc": "final_promotion_price:asc",
    "price_desc": "final_promotion_price:des",
    "newest": None,  # not offered by the API
}

USER_TYPES = {0: "Taobao", 1: "Tmall", 3: "Taobao Special Offer"}
_FREE_SHIPPING = re.compile(r"包邮|free shipping", re.I)
_NEW = re.compile(r"全新|\bbrand new\b|\bnew with tags\b", re.I)
_USED = re.compile(r"二手|闲置|\bpre-?owned\b|\bused\b|\bsecond[- ]?hand\b", re.I)


def site_for(country: str | None) -> str:
    c = (country or "").upper()
    return c if c in SUPPORTED_SITES else "GLOBAL"


def unwrap_list(value: Any) -> list[Any]:
    """TOP JSON wraps arrays as ``{"type_name": [...]}``; accept both shapes."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and len(value) == 1:
        inner = next(iter(value.values()))
        return inner if isinstance(inner, list) else [inner]
    return []


def https(url: str | None) -> str | None:
    if not url:
        return None
    return f"https:{url}" if url.startswith("//") else url


def _decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        d = Decimal(str(value))
    except InvalidOperation:
        return None
    return d if d >= 0 else None


def _cny(value: Any) -> Money | None:
    d = _decimal(value)
    return Money(amount=d, currency="CNY") if d is not None else None


def _localized(obj: Any) -> Money | None:
    if not isinstance(obj, dict):
        return None
    amount = _decimal(obj.get("formatted_price_number"))
    code = str(obj.get("currency_code") or "")
    if amount is None or not re.fullmatch(r"[A-Z]{3}", code):
        return None  # the docs show swapped values in one example — never trust a malformed object
    return Money(amount=amount, currency=code)


def _sales_label(annual_vol: Any, language: str) -> str | None:
    if not annual_vol:
        return None
    text = str(annual_vol)
    if language.startswith("en"):
        m = re.fullmatch(r"(\d+(?:\.\d+)?)万\+?", text)
        if m:
            n = Decimal(m.group(1)) * 10000
            text = f"{n:,.0f}+"
        return f"{text} sold in the last year"
    return f"年销 {text}"


def map_item(raw: dict[str, Any], *, language: str) -> NormalizedListing | None:
    basic: dict[str, Any] = raw.get("item_basic_info") or {}
    price: dict[str, Any] = raw.get("price_promotion_info") or {}
    publish: dict[str, Any] = raw.get("publish_info") or {}
    item_id = raw.get("item_id")
    title = (basic.get("title") or "").strip()
    url = https(publish.get("click_url") or publish.get("coupon_share_url"))
    if not item_id or not title or not url:
        return None  # without an id, title and link there is nothing honest to show

    tags = [
        str(t.get("tag_name"))
        for t in unwrap_list(price.get("promotion_tag_list"))
        if t.get("tag_name")
    ]
    coupon = raw.get("coupon_info") or {}
    if coupon.get("coupon_sale_text_info"):
        tags.append(str(coupon["coupon_sale_text_info"]))

    shop = basic.get("shop_title")
    user_type = basic.get("user_type")
    store_badge = (
        USER_TYPES.get(int(user_type))
        if isinstance(user_type, int | str) and str(user_type).isdigit()
        else None
    )
    text = " ".join(filter(None, [title, basic.get("sub_title"), basic.get("short_title")]))
    verdict = classify(text, shop_name=shop, is_brand_platform_store=str(user_type) == "1")

    images = [https(basic.get("pict_url")), https(basic.get("white_image"))]
    images += [https(u) for u in unwrap_list(basic.get("small_images"))]
    image_urls = list(dict.fromkeys(u for u in images if u))

    condition = ListingCondition.unknown
    if _USED.search(text):
        condition = ListingCondition.used_good
    elif _NEW.search(text):
        condition = ListingCondition.new

    dsr = _decimal(basic.get("shop_dsr"))
    seller = None
    if basic.get("seller_id") or shop:
        seller = NormalizedSeller(
            external_id=str(basic.get("seller_id") or shop),
            name=shop,
            country="CN",
            rating=(dsr / 10000).quantize(Decimal("0.01")) if dsr and dsr <= 50000 else None,
        )

    free_domestic = any(_FREE_SHIPPING.search(t) for t in tags)
    english = language.startswith("en")
    category = detect_category(
        basic.get("category_name"), basic.get("level_one_category_name"), title
    )
    return NormalizedListing(
        marketplace_id="taobao",
        external_id=str(item_id),
        url=url,
        title=title,
        title_language="en" if english else "zh",
        title_machine_translated=english,  # en_US titles are Taobao's own machine translation
        brand=basic.get("brand_name") or None,
        category=category,
        colors=detect_colors(title),
        image_urls=image_urls,
        price=_cny(price.get("zk_final_price")) or _cny(price.get("reserve_price")),
        list_price=_cny(price.get("reserve_price")),
        estimated_final_price=_cny(price.get("final_promotion_price")),
        localized_price=_localized(price.get("zk_final_localized_price")),
        shipping=ShippingQuote(
            cost=Money(amount=Decimal(0), currency="CNY") if free_domestic else None,
            ship_to_country="CN",
        ),
        ships_from_country="CN",
        condition=condition,
        authenticity=verdict.value,
        authenticity_reasons=verdict.reasons,
        availability=Availability.unknown,
        seller=seller,
        store_badge=store_badge,
        sales_label=_sales_label(basic.get("annual_vol"), language),
        promotion_tags=tags,
    )


def map_response(
    body: dict[str, Any], *, language: str
) -> tuple[list[NormalizedListing], int | None, bool]:
    items = unwrap_list(body.get("result_list"))
    listings = [
        listing
        for raw in items
        if isinstance(raw, dict) and (listing := map_item(raw, language=language))
    ]
    total = body.get("total_results")
    return (
        listings,
        int(total) if isinstance(total, int | str) and str(total).isdigit() else None,
        bool(body.get("has_next")),
    )
