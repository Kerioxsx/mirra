import json
from decimal import Decimal
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from mirra.core.config import get_settings
from mirra.core.taxonomy import Authenticity, Category
from mirra.modules.agents.kakobuy import build_link, kakobuy_route
from mirra.modules.agents.links import LinkError, parse_item_link
from mirra.modules.marketplaces.base import Money, NormalizedListing, ShippingQuote
from mirra.modules.marketplaces.connectors.taobao.connector import TaobaoConnector
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.marketplaces.registry import ConnectorRegistry
from mirra.modules.pricing.fx import StaticFxProvider
from tests.helpers import FIXED_RATES

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/taobao_ovs_material_item_optional.json").read_text()
)


@pytest.mark.parametrize(
    ("text", "source", "item_id"),
    [
        ("https://item.taobao.com/item.htm?id=712345678901&spm=a1z10", "taobao", "712345678901"),
        ("item.taobao.com/item.htm?id=712345678901", "taobao", "712345678901"),
        ("https://world.taobao.com/item/712345678901.htm", "taobao", "712345678901"),
        ("https://h5.m.taobao.com/awp/core/detail.htm?id=712345678901", "taobao", "712345678901"),
        ("https://detail.tmall.com/item.htm?id=623456789012&skuId=1", "tmall", "623456789012"),
        ("https://detail.m.tmall.com/item.htm?id=623456789012", "tmall", "623456789012"),
        ("https://weidian.com/item.html?itemID=4123456789", "weidian", "4123456789"),
        ("https://shop1234.v.weidian.com/item.html?itemID=4123456789", "weidian", "4123456789"),
        ("https://detail.1688.com/offer/612345678901.html", "1688", "612345678901"),
        ("https://m.1688.com/offer/612345678901.html", "1688", "612345678901"),
        # agent pages and deep links that carry the original
        (
            "https://www.kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D4123456789&affcode=x",
            "weidian",
            "4123456789",
        ),
        (
            "https://item2.kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D712345678901",
            "taobao",
            "712345678901",
        ),
        (
            "https://intl.taobao.com/dp?h5Url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D712345678901",
            "taobao",
            "712345678901",
        ),
        # share text with the link inside
        (
            "【淘宝】看看这个 https://item.taobao.com/item.htm?id=712345678901 好看",
            "taobao",
            "712345678901",
        ),
    ],
)
def test_parse_item_links(text: str, source: str, item_id: str) -> None:
    link = parse_item_link(text)
    assert (link.source, link.item_id) == (source, item_id)


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("https://m.tb.cn/h.abc123", "short link"),
        ("https://www.ebay.com/itm/1234567", "supports item links"),
        ("https://item.taobao.com/item.htm?id=abc", "supports item links"),
        ("black hoodie", "doesn't look like a link"),
        ("", "Paste a product link"),
    ],
)
def test_rejects_unsupported_links_with_a_reason(text: str, reason: str) -> None:
    with pytest.raises(LinkError, match=reason):
        parse_item_link(text)


def test_build_link_encodes_source_and_adds_referral() -> None:
    s = get_settings().model_copy(update={"kakobuy_referral_code": "mirra123"})
    link = build_link(parse_item_link("https://weidian.com/item.html?itemID=4123456789"), s)
    assert link == (
        "https://www.kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D4123456789"
        "&affcode=mirra123"
    )
    assert "affcode" not in build_link(
        parse_item_link("https://weidian.com/item.html?itemID=1234567"), get_settings()
    )


def _listing(**kw: object) -> NormalizedListing:
    base = {
        "marketplace_id": "taobao",
        "external_id": "x",
        "url": "https://intl.taobao.com/dp?h5Url=x",
        "title": "Zip-up hoodie",
        "category": Category.zip_up,
        "price": Money(amount=Decimal("239.00"), currency="CNY"),
        "shipping": ShippingQuote(cost=Money(amount=Decimal(0), currency="CNY")),
        "ships_from_country": "CN",
        "source_url": "https://item.taobao.com/item.htm?id=700000000001",
    }
    return NormalizedListing(**{**base, **kw})  # type: ignore[arg-type]


def test_route_costs_follow_kakobuys_published_fees() -> None:
    route = kakobuy_route(_listing(), get_settings(), currency="USD", fx=FIXED_RATES)
    assert route is not None and route.available
    assert route.url.startswith(
        "https://www.kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com"
    )
    labels = {c.label: c for c in route.landed_cost.components}
    assert labels["KakoBuy service fee"].amount.amount == Decimal("0.00")
    assert "free" in labels["KakoBuy service fee"].note
    assert labels["Customs declaration (per parcel)"].amount.amount == Decimal(
        "1.11"
    )  # ¥8 → USD at test rates
    assert labels["International shipping"].amount is None  # no forwarding rate configured: unknown
    assert route.landed_cost.complete is False
    assert route.terms_checked == "2026-11-15"


def test_route_refuses_replicas_demo_and_missing_links() -> None:
    s = get_settings()
    replica = kakobuy_route(_listing(authenticity=Authenticity.replica_advertised), s)
    assert replica is not None and not replica.available and replica.url is None
    assert "prohibits" in replica.unavailable_reason
    no_link = kakobuy_route(_listing(source_url=None), s)
    assert not no_link.available and "paste it into Discover" in no_link.unavailable_reason
    demo = kakobuy_route(_listing(is_demo=True), s)
    assert not demo.available
    # agents only apply to Chinese marketplaces
    assert kakobuy_route(_listing(marketplace_id="ebay", ships_from_country="US"), s) is None
    assert kakobuy_route(_listing(), s.model_copy(update={"kakobuy_enabled": False})) is None


def taobao() -> TaobaoConnector:
    client = TopClient(
        app_key="k",
        app_secret="s",
        http=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json=FIXTURE))
        ),
    )
    return TaobaoConnector(client=client, adzone_id="1")


async def test_listing_detail_offers_kakobuy_when_possible(
    app: FastAPI, client: AsyncClient
) -> None:
    app.state.registry = ConnectorRegistry([taobao()])
    app.state.fx = StaticFxProvider(FIXED_RATES)
    results = {
        r["listing"]["external_id"]: r
        for r in (await client.get("/api/v1/search", params={"q": "hoodie"})).json()["results"]
    }

    hoodie = (
        await client.get(f"/api/v1/listings/{results['TEST-tmall-flagship-0001']['listing_id']}")
    ).json()
    [route] = hoodie["purchase_routes"]
    assert route["id"] == "kakobuy" and route["available"] is True
    assert route["url"].endswith("url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D700000000001")
    assert [c["label"] for c in route["landed_cost"]["components"]] == [
        "Item",
        "Shipping within China (seller → KakoBuy warehouse)",
        "KakoBuy service fee",
        "Customs declaration (per parcel)",
        "International shipping",
    ]

    vest = (
        await client.get(f"/api/v1/listings/{results['TEST-taobao-alt-0002']['listing_id']}")
    ).json()
    assert vest["purchase_routes"][0]["available"] is False  # no original link in its deep link

    replica = (
        await client.get(f"/api/v1/listings/{results['TEST-replica-0003']['listing_id']}")
    ).json()
    assert (
        replica["purchase_routes"][0]["available"] is False
        and replica["purchase_routes"][0]["url"] is None
    )


async def test_resolve_pasted_links(app: FastAPI, client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/links/resolve",
        json={
            "url": "https://www.kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D4123456789"
        },
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert (d["source"], d["source_name"], d["item_id"]) == ("weidian", "Weidian", "4123456789")
    assert d["routes"][0]["available"] and d["routes"][0]["url"].startswith(
        "https://www.kakobuy.com/item/details?url="
    )
    assert d["listing_id"] is None

    # a link for an item Mirra already stored from search is matched to that listing
    app.state.registry = ConnectorRegistry([taobao()])
    results = (await client.get("/api/v1/search", params={"q": "hoodie"})).json()["results"]
    stored = next(
        x["listing_id"]
        for x in results
        if x["listing"]["external_id"] == "TEST-tmall-flagship-0001"
    )
    again = (
        await client.post(
            "/api/v1/links/resolve",
            json={"url": "https://item.taobao.com/item.htm?id=700000000001&spm=x"},
        )
    ).json()
    assert again["listing_id"] == stored

    bad = await client.post("/api/v1/links/resolve", json={"url": "https://m.tb.cn/h.abc"})
    assert bad.status_code == 422 and "short link" in bad.json()["error"]["message"]
