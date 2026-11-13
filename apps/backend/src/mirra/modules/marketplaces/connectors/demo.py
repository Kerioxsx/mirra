"""A clearly fictional sample catalog for development and tests (never enabled in production).

Every listing is marked ``is_demo`` and branded "Sample label"; links point at example.com. It
exists so the search → compare → try-on flow can be built and tested without marketplace keys.
"""

from __future__ import annotations

import base64
from decimal import Decimal

from mirra.core.taxonomy import (
    Authenticity,
    Availability,
    Category,
    IntegrationType,
    ListingCondition,
)
from mirra.modules.marketplaces.base import (
    ConnectorCapabilities,
    ConnectorQuery,
    ConnectorSearchPage,
    MarketplaceConnector,
    Money,
    NormalizedListing,
    NormalizedSeller,
    ShippingQuote,
)
from mirra.modules.marketplaces.connectors.taobao.language import (
    REFINEMENTS,
    detect_category,
    detect_colors,
)

_HEX = {
    "black": "#141414",
    "white": "#f2f1ec",
    "grey": "#8a8d91",
    "navy": "#1f2a44",
    "olive": "#5f6340",
    "khaki": "#b9a77c",
    "cream": "#efe6d2",
    "brown": "#6b4a33",
    "blue": "#2f5ea8",
    "burgundy": "#6d1f2c",
    "charcoal": "#33363b",
    "camel": "#b98a4f",
}

# (id, title, category, colour, price, currency, ships_from, shipping, authenticity, condition)
_ROWS: list[
    tuple[str, str, Category, str, str, str, str, str | None, Authenticity, ListingCondition]
] = [
    (
        "d01",
        "Oversized zip-up hoodie, heavyweight fleece",
        Category.zip_up,
        "black",
        "189.00",
        "CNY",
        "CN",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d02",
        "Washed baggy jeans, wide leg",
        Category.baggy_pants,
        "blue",
        "159.00",
        "CNY",
        "CN",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d03",
        "Japanese workwear cargo pants",
        Category.cargo_pants,
        "olive",
        "219.00",
        "CNY",
        "CN",
        None,
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d04",
        "Boxy cropped tee, heavyweight cotton",
        Category.t_shirt,
        "cream",
        "69.00",
        "CNY",
        "CN",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d05",
        "Vintage-wash crewneck sweatshirt",
        Category.sweatshirt,
        "grey",
        "129.00",
        "CNY",
        "CN",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d06",
        "Nylon bomber jacket",
        Category.jacket,
        "black",
        "299.00",
        "CNY",
        "CN",
        None,
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d07",
        "Wool-blend overcoat",
        Category.coat,
        "camel",
        "129.00",
        "USD",
        "US",
        "8.00",
        Authenticity.seller_claimed,
        ListingCondition.new,
    ),
    (
        "d08",
        "Canvas high-top sneakers",
        Category.sneakers,
        "white",
        "59.00",
        "USD",
        "US",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d09",
        "Leather lace-up boots",
        Category.boots,
        "brown",
        "140.00",
        "EUR",
        "DE",
        None,
        Authenticity.unverified,
        ListingCondition.used_good,
    ),
    (
        "d10",
        "Ribbed knit beanie",
        Category.beanie,
        "charcoal",
        "39.00",
        "CNY",
        "CN",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d11",
        "Six-panel cotton cap",
        Category.cap,
        "navy",
        "22.00",
        "USD",
        "US",
        "4.50",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d12",
        "Nylon crossbody bag",
        Category.bag,
        "black",
        "99.00",
        "CNY",
        "CN",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d13",
        "Relaxed oxford shirt",
        Category.shirt,
        "blue",
        "45.00",
        "GBP",
        "GB",
        "3.95",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d14",
        "Chunky cable sweater",
        Category.sweater,
        "cream",
        "249.00",
        "CNY",
        "CN",
        None,
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d15",
        "Straight-leg selvedge jeans",
        Category.jeans,
        "navy",
        "98.00",
        "USD",
        "US",
        None,
        Authenticity.seller_claimed,
        ListingCondition.used_like_new,
    ),
    (
        "d16",
        "Pleated midi skirt",
        Category.skirt,
        "black",
        "139.00",
        "CNY",
        "CN",
        "0",
        Authenticity.unverified,
        ListingCondition.new,
    ),
    (
        "d17",
        "Same-style padded vest (look-alike, no brand claimed)",
        Category.vest,
        "olive",
        "119.00",
        "CNY",
        "CN",
        "0",
        Authenticity.style_alternative,
        ListingCondition.new,
    ),
    (
        "d18",
        "Sample listing flagged as replica (shown to test labelling)",
        Category.sneakers,
        "white",
        "260.00",
        "CNY",
        "CN",
        None,
        Authenticity.replica_advertised,
        ListingCondition.new,
    ),
]

_REASONS = {
    Authenticity.style_alternative: [
        "Sample: listing says “same style” — a look-alike, not the branded product"
    ],
    Authenticity.replica_advertised: ["Sample: listing advertises itself as a replica"],
}


def _image(hex_color: str) -> str:
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 360'>"
        "<rect width='300' height='360' fill='#ece8df'/>"
        f"<rect x='70' y='60' width='160' height='220' rx='28' fill='{hex_color}'/>"
        "<text x='150' y='330' font-family='monospace' font-size='18' "
        "text-anchor='middle' fill='#6d6c66'>DEMO</text>"
        "</svg>"
    )
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def _listing(
    row: tuple[str, str, Category, str, str, str, str, str | None, Authenticity, ListingCondition],
) -> NormalizedListing:
    rid, title, cat, color, price, cur, origin, ship, auth, cond = row
    return NormalizedListing(
        marketplace_id="demo",
        external_id=rid,
        url=f"https://example.com/mirra-demo/{rid}",
        title=title,
        brand="Sample label",
        category=cat,
        colors=[color],
        image_urls=[_image(_HEX[color])],
        price=Money(amount=Decimal(price), currency=cur),
        shipping=ShippingQuote(
            cost=Money(amount=Decimal(ship), currency=cur) if ship is not None else None,
            ship_to_country=origin if origin == "CN" else None,
        ),
        ships_from_country=origin,
        condition=cond,
        authenticity=auth,
        authenticity_reasons=_REASONS.get(auth, []),
        availability=Availability.in_stock,
        seller=NormalizedSeller(external_id="demo-seller", name="Demo seller", country=origin),
        is_demo=True,
    )


CATALOG = [_listing(r) for r in _ROWS]


class DemoConnector(MarketplaceConnector):
    id = "demo"
    name = "Sample catalog (demo)"
    base_url = "https://example.com/mirra-demo"
    integration_type = IntegrationType.demo

    def get_capabilities(self) -> ConnectorCapabilities:
        return ConnectorCapabilities(
            text_search=True,
            images=True,
            price=True,
            shipping=True,
            filters=["price_min", "price_max", "sort", "category"],
        )

    async def search_products(self, query: ConnectorQuery) -> ConnectorSearchPage:
        text = (query.text or "").strip()
        cat = query.category or detect_category(text)
        colors = detect_colors(text)
        words = [w for w in text.lower().split() if len(w) > 2]
        hits = []
        for item in CATALOG:
            hay = f"{item.title} {item.category} {' '.join(item.colors)}".lower()
            if cat and item.category != cat and item.category not in REFINEMENTS.get(cat, set()):
                continue
            if colors and not set(colors) & set(item.colors):
                continue
            if not cat and not colors and words and not any(w in hay for w in words):
                continue
            hits.append(item)
        if query.sort in ("price_asc", "price_desc"):
            hits.sort(
                key=lambda i: i.price.amount if i.price else Decimal(0),
                reverse=query.sort == "price_desc",
            )
        page = hits[query.offset : query.offset + query.limit]
        more = query.offset + query.limit < len(hits)
        return ConnectorSearchPage(
            marketplace_id=self.id,
            listings=page,
            total=len(hits),
            next_offset=query.offset + query.limit if more else None,
            query_sent=text,
        )
