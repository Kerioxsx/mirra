from httpx import AsyncClient


async def test_lists_catalog_with_honest_status(client: AsyncClient) -> None:
    r = await client.get("/api/v1/marketplaces")
    assert r.status_code == 200
    data = r.json()
    by_id = {m["id"]: m for m in data}
    assert data[0]["id"] == "taobao"  # the priority marketplace leads the list
    assert by_id["taobao"]["integration_type"] == "official_api"
    # without credentials no real marketplace is live, and none claims capabilities it lacks
    assert all(not m["enabled"] for k, m in by_id.items() if k != "demo")
    assert not any(by_id["taobao"]["capabilities"][k] for k in ("text_search", "image_search"))
    assert by_id["taobao"]["status"] == "planned"
    for blocked in ("depop", "grailed"):
        assert by_id[blocked]["status"] == "blocked"
    # the dev-only sample catalog is live and says what it is
    assert by_id["demo"]["enabled"] and by_id["demo"]["integration_type"] == "demo"
