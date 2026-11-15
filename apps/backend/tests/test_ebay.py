import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from mirra.core.taxonomy import Authenticity, Category, ListingCondition
from mirra.modules.marketplaces.base import ConnectorQuery
from mirra.modules.marketplaces.connectors.ebay.browse import build_params, map_item, map_page
from mirra.modules.marketplaces.connectors.ebay.client import EbayClient, EbayError
from mirra.modules.marketplaces.connectors.ebay.connector import EbayConnector
from mirra.modules.pricing.fx import StaticFxProvider
from tests.helpers import FIXED_RATES

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/ebay_browse_item_summary_search.json").read_text()
)
NOW = datetime(2026, 11, 15, tzinfo=UTC)


def test_mapping_follows_the_documented_shape():
    listings, total, next_offset = map_page(FIXTURE, "US")
    assert total == 1250 and next_offset == 3
    hoodie, sneakers, vest = listings
    assert hoodie.external_id == "v1|110551234567|0"
    assert hoodie.url.startswith("https://www.ebay.com/itm/110551234567?mkevt")  # affiliate link
    assert hoodie.source_url == "https://www.ebay.com/itm/110551234567"
    assert hoodie.price is not None and hoodie.price.amount == Decimal("39.99")
    assert hoodie.list_price is not None and hoodie.list_price.amount == Decimal("54.99")
    assert hoodie.condition == ListingCondition.new_with_tags
    assert hoodie.category == Category.hoodie
    assert "black" in hoodie.colors
    assert hoodie.shipping is not None and hoodie.shipping.cost is not None
    assert hoodie.shipping.cost.amount == 0
    assert hoodie.seller is not None and hoodie.seller.feedback_score == 15421
    assert len(hoodie.image_urls) == 2

    assert sneakers.authenticity == Authenticity.authenticated
    assert "Authenticity Guarantee" in sneakers.authenticity_reasons[0]
    assert sneakers.condition == ListingCondition.used_good
    # calculated shipping depends on the address: unknown, never guessed
    assert sneakers.shipping is not None and sneakers.shipping.cost is None

    assert vest.authenticity == Authenticity.replica_advertised
    assert vest.ships_from_country == "CN"


def test_delivery_days_come_from_estimated_dates():
    item = FIXTURE["itemSummaries"][0]
    listing = map_item(item, "US", now=NOW)
    assert listing is not None and listing.shipping is not None
    assert (listing.shipping.min_days, listing.shipping.max_days) == (5, 9)
    assert map_item({"title": "no id"}, None) is None


def test_query_parameters():
    p = build_params(
        ConnectorQuery(
            text="black hoodie",
            brand="Acme",
            price_min=Decimal("10"),
            price_max=Decimal("50"),
            currency="USD",
            conditions=[ListingCondition.new],
            ship_to_country="de",
            sort="price_asc",
            limit=24,
            offset=24,
        ),
        "USD",
    )
    assert p["q"] == "Acme black hoodie"
    assert p["category_ids"] == "11450"
    assert p["filter"] == (
        "price:[10..50],priceCurrency:USD,conditionIds:{1000|1500|1750},deliveryCountry:DE"
    )
    assert p["sort"] == "price"
    assert (p["limit"], p["offset"]) == ("24", "24")
    # a foreign-currency bound is never sent as if it were dollars
    eur = build_params(ConnectorQuery(text="x", price_max=Decimal("40"), currency="EUR"), "USD")
    assert "filter" not in eur


def _transport(calls: list[httpx.Request], *, fail_first_search: bool = False):
    state = {"searches": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.path == "/identity/v1/oauth2/token":
            assert request.headers["Authorization"].startswith("Basic ")
            assert b"grant_type=client_credentials" in request.content
            return httpx.Response(
                200, json={"access_token": f"tok{len(calls)}", "expires_in": 7200}
            )
        if request.url.path.endswith("/item_summary/search"):
            state["searches"] += 1
            if fail_first_search and state["searches"] == 1:
                return httpx.Response(401, json={"errors": [{"message": "Invalid access token"}]})
            return httpx.Response(200, json=FIXTURE)
        if request.url.path.endswith("/item_summary/search_by_image"):
            body = json.loads(request.content)
            assert body["image"]  # base64 image
            return httpx.Response(200, json=FIXTURE)
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _client(calls: list[httpx.Request], **kw: object) -> EbayClient:
    return EbayClient(
        client_id="id",
        client_secret="secret",
        campaign_id="5330000000",
        http=httpx.AsyncClient(transport=_transport(calls, **kw)),  # type: ignore[arg-type]
    )


async def test_search_sends_marketplace_location_and_campaign_and_reuses_the_token():
    calls: list[httpx.Request] = []
    conn = EbayConnector(client=_client(calls), fx=StaticFxProvider(FIXED_RATES))
    page = await conn.search_products(ConnectorQuery(text="black hoodie", ship_to_country="GB"))
    assert len(page.listings) == 3
    await conn.search_products(ConnectorQuery(text="white sneakers"))
    token_calls = [c for c in calls if c.url.path.endswith("/token")]
    assert len(token_calls) == 1
    search = next(c for c in calls if c.url.path.endswith("/search"))
    assert search.headers["X-EBAY-C-MARKETPLACE-ID"] == "EBAY_US"
    assert search.headers["X-EBAY-C-ENDUSERCTX"] == (
        "contextualLocation=country%3DGB,affiliateCampaignId=5330000000"
    )
    assert search.headers["Authorization"] == "Bearer tok1"
    await conn.aclose()


async def test_expired_token_is_refreshed_once():
    calls: list[httpx.Request] = []
    conn = EbayConnector(client=_client(calls, fail_first_search=True))
    page = await conn.search_products(ConnectorQuery(text="hoodie"))
    assert page.listings
    assert len([c for c in calls if c.url.path.endswith("/token")]) == 2


async def test_image_search_and_foreign_currency_bounds_are_converted():
    calls: list[httpx.Request] = []
    conn = EbayConnector(client=_client(calls), fx=StaticFxProvider(FIXED_RATES))
    page = await conn.search_by_image(
        b"\x89PNG fake", ConnectorQuery(price_max=Decimal("40"), currency="EUR")
    )
    assert len(page.listings) == 3
    req = next(c for c in calls if c.url.path.endswith("search_by_image"))
    assert "priceCurrency%3AUSD" in str(req.url) or "priceCurrency:USD" in str(req.url)
    assert "q=" not in str(req.url)


async def test_errors_surface_as_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"errors": [{"message": "invalid_client"}]})

    client = EbayClient(
        client_id="id",
        client_secret="bad",
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    with pytest.raises(EbayError, match="invalid_client"):
        await client.token()
