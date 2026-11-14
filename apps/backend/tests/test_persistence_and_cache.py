import copy
import json
from pathlib import Path

import httpx
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select

from mirra.core.db import get_sessionmaker
from mirra.modules.marketplaces.connectors.taobao.connector import TaobaoConnector
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.marketplaces.models import Marketplace, MarketplaceListing, PriceHistory, Seller
from mirra.modules.marketplaces.registry import ConnectorRegistry
from mirra.modules.search.cache import MemoryPageCache

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/taobao_ovs_material_item_optional.json").read_text()
)


def counting_taobao(responses: list[dict]) -> tuple[TaobaoConnector, list[int]]:
    calls = [0]

    def handler(req: httpx.Request) -> httpx.Response:
        calls[0] += 1
        return httpx.Response(200, json=responses[min(calls[0], len(responses)) - 1])

    client = TopClient(
        app_key="k", app_secret="s", http=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    return TaobaoConnector(client=client, adzone_id="1"), calls


async def test_results_get_stable_ids_sellers_and_price_history(
    app: FastAPI, client: AsyncClient
) -> None:
    cheaper = copy.deepcopy(FIXTURE)
    item = cheaper["ovs_tbk_material_item_optional_response"]["result_list"][
        "material_item_summary_info"
    ][0]
    item["price_promotion_info"]["zk_final_price"] = "199.00"
    conn, calls = counting_taobao([FIXTURE, FIXTURE, cheaper])
    app.state.registry = ConnectorRegistry([conn])

    first = (await client.get("/api/v1/search", params={"q": "hoodie"})).json()["results"]
    app.state.page_cache = MemoryPageCache()  # bypass the cache to simulate later searches
    second = (await client.get("/api/v1/search", params={"q": "hoodie"})).json()["results"]
    app.state.page_cache = MemoryPageCache()
    third = (await client.get("/api/v1/search", params={"q": "hoodie"})).json()["results"]
    assert calls[0] == 3

    ids = [r["listing_id"] for r in first]
    assert all(ids) and ids == [r["listing_id"] for r in second] == [r["listing_id"] for r in third]

    async with get_sessionmaker()() as s:
        assert (await s.get(Marketplace, "taobao")).integration_type == "official_api"
        assert await s.scalar(select(func.count()).select_from(MarketplaceListing)) == 3
        assert await s.scalar(select(func.count()).select_from(Seller)) == 3
        row = (
            await s.execute(
                select(MarketplaceListing).where(
                    MarketplaceListing.external_id == "TEST-tmall-flagship-0001"
                )
            )
        ).scalar_one()
        assert str(row.price_amount) == "199.00" and row.url.startswith("https://intl.taobao.com")
        assert row.raw["store_badge"] == "Tmall" and row.expires_at > row.fetched_at
        history = (
            (
                await s.execute(
                    select(PriceHistory.price_amount)
                    .where(PriceHistory.listing_id == row.id)
                    .order_by(PriceHistory.observed_at)
                )
            )
            .scalars()
            .all()
        )
    assert [str(p) for p in history] == ["239.00", "199.00"]  # unchanged price isn't duplicated


async def test_repeat_searches_are_served_from_cache(app: FastAPI, client: AsyncClient) -> None:
    conn, calls = counting_taobao([FIXTURE])
    app.state.registry = ConnectorRegistry([conn])
    a = await client.get("/api/v1/search", params={"q": "hoodie"})
    b = await client.get("/api/v1/search", params={"q": "hoodie"})
    c = await client.get("/api/v1/search", params={"q": "jeans"})
    assert calls[0] == 2  # the repeat of "hoodie" never reached Taobao
    assert a.json()["results"] == b.json()["results"] and c.status_code == 200


async def test_memory_cache_expires_and_is_bounded() -> None:
    from mirra.modules.marketplaces.base import ConnectorSearchPage

    cache = MemoryPageCache(max_entries=2)
    page = ConnectorSearchPage(marketplace_id="x", listings=[])
    await cache.set("a", page, ttl=-1)
    assert await cache.get("a") is None
    for k in ("b", "c", "d"):
        await cache.set(k, page)
    assert await cache.get("b") is None and await cache.get("d") is not None
