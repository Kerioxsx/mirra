import asyncio
import json
from pathlib import Path

import httpx
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select

from mirra.core.db import get_sessionmaker
from mirra.core.taxonomy import IntegrationType
from mirra.modules.marketplaces.base import (
    ConnectorCapabilities,
    ConnectorQuery,
    ConnectorSearchPage,
    ConnectorUnavailable,
    MarketplaceConnector,
)
from mirra.modules.marketplaces.connectors.demo import DemoConnector
from mirra.modules.marketplaces.connectors.taobao.connector import TaobaoConnector
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.marketplaces.registry import ConnectorRegistry
from mirra.modules.pricing.fx import StaticFxProvider
from mirra.modules.shopping.models import SearchHistory
from tests.conftest import bearer, register
from tests.helpers import FIXED_RATES

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/taobao_ovs_material_item_optional.json").read_text()
)


def taobao_connector() -> TaobaoConnector:
    client = TopClient(
        app_key="k",
        app_secret="s",
        http=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda req: httpx.Response(200, json=FIXTURE))
        ),
    )
    return TaobaoConnector(client=client, adzone_id="1", fx=StaticFxProvider(FIXED_RATES))


class Broken(MarketplaceConnector):
    id, name, base_url, integration_type = (
        "broken",
        "Broken",
        "https://x",
        IntegrationType.official_api,
    )

    def get_capabilities(self) -> ConnectorCapabilities:
        return ConnectorCapabilities(text_search=True)

    async def search_products(self, query: ConnectorQuery) -> ConnectorSearchPage:
        raise ConnectorUnavailable("secret-bearing upstream detail")


class Slow(Broken):
    id, name = "slow", "Slow"

    async def search_products(self, query: ConnectorQuery) -> ConnectorSearchPage:
        await asyncio.sleep(5)
        raise AssertionError("unreachable")


async def test_demo_search_is_labelled_and_reports_unconnected_marketplaces(
    client: AsyncClient,
) -> None:
    r = await client.get("/api/v1/search", params={"q": "black hoodie"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["results"], "the demo catalog should match"
    assert all(item["listing"]["is_demo"] for item in body["results"])
    status = {m["id"]: m for m in body["marketplaces"]}
    assert status["demo"]["status"] == "ok"
    assert (
        status["taobao"]["status"] == "not_configured"
        and "MIRRA_TAOBAO" in status["taobao"]["message"]
    )
    assert status["depop"]["status"] == "blocked"
    assert body["fx"] is None  # no rates configured in tests → foreign prices aren't converted
    cny = next(item for item in body["results"] if item["listing"]["price"]["currency"] == "CNY")
    assert cny["converted_price"] is None and cny["landed_cost"] is None


async def test_taobao_results_flow_through_search_with_costs(
    app: FastAPI, client: AsyncClient
) -> None:
    app.state.registry = ConnectorRegistry([taobao_connector()])
    app.state.fx = StaticFxProvider(FIXED_RATES)
    r = await client.get(
        "/api/v1/search", params={"q": "zip-up hoodie", "currency": "USD", "ship_to": "US"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    taobao = next(m for m in body["marketplaces"] if m["id"] == "taobao")
    assert taobao == {**taobao, "status": "ok", "count": 3, "query_sent": "拉链连帽卫衣"}
    first = body["results"][0]
    assert first["listing"]["store_badge"] == "Tmall"
    assert first["converted_price"] == {"amount": "33.09", "currency": "USD"}
    labels = [c["label"] for c in first["landed_cost"]["components"]]
    assert labels == ["Item", "Shipping within China", "International shipping"]
    assert first["landed_cost"]["complete"] is False  # no forwarding rate configured
    assert body["fx"]["as_of"] == "2026-11-12"
    kinds = {
        item["listing"]["external_id"]: item["listing"]["authenticity"] for item in body["results"]
    }
    assert kinds["TEST-replica-0003"] == "replica_advertised"
    assert kinds["TEST-taobao-alt-0002"] == "style_alternative"


async def test_one_failing_marketplace_doesnt_break_search(
    app: FastAPI, client: AsyncClient
) -> None:
    from mirra.core.config import get_settings

    get_settings().search_timeout_seconds = 0.2
    try:
        app.state.registry = ConnectorRegistry([Broken(), Slow(), DemoConnector()])
        r = await client.get("/api/v1/search", params={"q": "jeans"})
    finally:
        get_settings().search_timeout_seconds = 8.0
    status = {m["id"]: m for m in r.json()["marketplaces"]}
    assert status["broken"]["status"] == "error"
    assert status["broken"]["message"] == "Temporarily unavailable"  # upstream detail not leaked
    assert status["slow"]["status"] == "timeout"
    assert status["demo"]["status"] == "ok" and r.json()["results"]


async def test_price_sort_puts_unknown_prices_last(app: FastAPI, client: AsyncClient) -> None:
    app.state.fx = StaticFxProvider(None)  # CNY demo items can't be converted to USD
    r = await client.get(
        "/api/v1/search", params={"q": "", "sort": "price_asc", "currency": "USD", "page_size": 60}
    )
    results = r.json()["results"]
    prices = [item["converted_price"] for item in results]
    known = [float(p["amount"]) for p in prices if p]
    assert known == sorted(known)
    first_unknown = next(i for i, p in enumerate(prices) if p is None)
    assert all(p is None for p in prices[first_unknown:])


async def test_signed_in_search_uses_preferences_and_records_history(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    await client.put(
        "/api/v1/users/me/preferences", json={"currency": "EUR", "ship_to_country": "DE"}, headers=h
    )
    r = await client.get("/api/v1/search", params={"q": "boots"}, headers=h)
    assert r.json()["currency"] == "EUR"
    async with get_sessionmaker()() as s:
        rows = (await s.execute(select(SearchHistory))).scalars().all()
    assert [(row.query_text, row.result_count) for row in rows] == [
        ("boots", len(r.json()["results"]))
    ]


async def test_search_validates_input(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/search", params={"currency": "dollars"})).status_code == 422
    assert (await client.get("/api/v1/search", params={"category": "spaceship"})).status_code == 422
