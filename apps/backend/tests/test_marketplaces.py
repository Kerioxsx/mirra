from httpx import AsyncClient


async def test_lists_catalog_with_honest_status(client: AsyncClient) -> None:
    r = await client.get("/api/v1/marketplaces")
    assert r.status_code == 200
    by_id = {m["id"]: m for m in r.json()}
    assert by_id["ebay"]["integration_type"] == "official_api"
    # without credentials nothing is live, and nothing claims capabilities it doesn't have
    assert all(not m["enabled"] for m in by_id.values())
    assert not any(by_id["ebay"]["capabilities"][k] for k in ("text_search", "image_search"))
    for blocked in ("depop", "grailed", "taobao"):
        assert by_id[blocked]["status"] == "blocked"
