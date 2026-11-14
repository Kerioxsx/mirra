import json
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI
from httpx import AsyncClient

from mirra.modules.marketplaces.base import NormalizedListing
from mirra.modules.marketplaces.connectors.demo import DemoConnector
from mirra.modules.marketplaces.connectors.taobao.connector import TaobaoConnector
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.marketplaces.registry import ConnectorRegistry
from mirra.modules.pricing import deals
from mirra.modules.pricing.fx import StaticFxProvider
from tests.conftest import bearer, register
from tests.helpers import FIXED_RATES

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/taobao_ovs_material_item_optional.json").read_text()
)


def taobao() -> TaobaoConnector:
    client = TopClient(
        app_key="k",
        app_secret="s",
        http=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json=FIXTURE))
        ),
    )
    return TaobaoConnector(client=client, adzone_id="1")


async def _search(client: AsyncClient, q: str, **params: str) -> list[dict]:
    r = await client.get("/api/v1/search", params={"q": q, **params})
    assert r.status_code == 200, r.text
    return r.json()["results"]


async def test_listing_detail_prices_for_the_shopper(app: FastAPI, client: AsyncClient) -> None:
    app.state.registry = ConnectorRegistry([taobao()])
    app.state.fx = StaticFxProvider(FIXED_RATES)
    hoodie = next(
        r
        for r in await _search(client, "hoodie")
        if r["listing"]["external_id"] == "TEST-tmall-flagship-0001"
    )

    r = await client.get(f"/api/v1/listings/{hoodie['listing_id']}", params={"currency": "EUR"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["marketplace_name"] == "Taobao" and d["stale"] is False and d["saved"] is False
    assert d["result"]["listing"]["store_badge"] == "Tmall"
    assert d["result"]["converted_price"] == {
        "amount": "30.64",
        "currency": "EUR",
    }  # 239 CNY / 7.80
    assert [p["price"]["amount"] for p in d["price_history"]] == ["239.00"]
    assert d["fx"]["as_of"] == "2026-11-12"

    assert (await client.get(f"/api/v1/listings/{uuid.uuid4()}")).status_code == 404
    assert (await client.get("/api/v1/listings/not-a-uuid")).status_code == 422


async def test_alternatives_find_cheaper_matches_and_skip_replicas(
    app: FastAPI, client: AsyncClient
) -> None:
    app.state.registry = ConnectorRegistry([taobao(), DemoConnector()])
    app.state.fx = StaticFxProvider(FIXED_RATES)
    base = next(
        r
        for r in await _search(client, "hoodie", currency="USD")
        if r["listing"]["external_id"] == "TEST-tmall-flagship-0001"
    )

    r = await client.get(
        f"/api/v1/listings/{base['listing_id']}/alternatives", params={"currency": "USD"}
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["query_used"] == "black heavyweight oversized zip-up hoodie"  # title order
    ids = [a["result"]["listing"]["external_id"] for a in d["alternatives"]]
    assert "TEST-tmall-flagship-0001" not in ids  # never suggests itself
    assert d["excluded_replicas"] == 0  # the search is limited to the base's category
    demo = next(a for a in d["alternatives"] if a["result"]["listing"]["external_id"] == "d01")
    assert demo["result"]["listing_id"]  # persisted so it can be saved or worn
    assert (
        "Same category" in demo["match_reasons"] and "Same colour (black)" in demo["match_reasons"]
    )
    assert demo["savings"] == {"amount": "6.92", "currency": "USD"}  # 33.09 − 26.17
    prices = [
        float(a["result"]["converted_price"]["amount"])
        for a in d["alternatives"]
        if a["result"]["converted_price"]
    ]
    assert prices == sorted(prices)


async def test_alternatives_never_suggest_replicas(app: FastAPI, client: AsyncClient) -> None:
    app.state.registry = ConnectorRegistry([taobao(), DemoConnector()])
    base = next(
        r for r in await _search(client, "white sneakers") if r["listing"]["external_id"] == "d08"
    )
    d = (await client.get(f"/api/v1/listings/{base['listing_id']}/alternatives")).json()
    ids = {a["result"]["listing"]["external_id"] for a in d["alternatives"]}
    assert not ids & {"TEST-replica-0003", "d18"}  # both white sneakers, both advertise as replicas
    assert d["excluded_replicas"] == 2
    assert all(
        a["result"]["listing"]["authenticity"] != "replica_advertised" for a in d["alternatives"]
    )


async def test_detail_shows_saved_state_for_signed_in_user(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    item = (await _search(client, "boots"))[0]
    assert (
        await client.post("/api/v1/saved", json={"listing_id": item["listing_id"]}, headers=h)
    ).status_code == 201
    d = (await client.get(f"/api/v1/listings/{item['listing_id']}", headers=h)).json()
    assert d["saved"] is True


def test_match_scoring() -> None:
    def listing(**kw: object) -> NormalizedListing:
        return NormalizedListing(
            marketplace_id="m", external_id=str(kw.pop("id", "1")), url="https://x", **kw
        )  # type: ignore[arg-type]

    base = listing(title="Black oversized zip-up hoodie", category="zip_up", colors=["black"])
    twin = listing(
        id=2, title="Oversized zip-up hoodie in black", category="zip_up", colors=["black"]
    )
    related = listing(id=3, title="Grey pullover hoodie", category="hoodie", colors=["grey"])
    other = listing(id=4, title="Leather boots", category="boots", colors=["brown"])
    assert (
        deals.match(base, twin).score
        > deals.match(base, related).score
        > deals.match(base, other).score
    )
    assert deals.match(base, other).score < 0.4
    assert deals.query_for(base) == "black oversized zip-up hoodie"
