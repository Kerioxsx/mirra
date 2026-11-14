import uuid

from httpx import AsyncClient

from tests.conftest import bearer, register


async def _ids(client: AsyncClient, q: str, headers: dict[str, str] | None = None) -> list[str]:
    r = await client.get("/api/v1/search", params={"q": q}, headers=headers or {})
    return [x["listing_id"] for x in r.json()["results"]]


async def test_save_list_unsave(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    a, b = (await _ids(client, "pants"))[:2]
    first = await client.post("/api/v1/saved", json={"listing_id": a}, headers=h)
    assert first.status_code == 201 and first.json()["listing"]["is_demo"] is True
    await client.post("/api/v1/saved", json={"listing_id": b}, headers=h)
    again = await client.post("/api/v1/saved", json={"listing_id": a}, headers=h)  # idempotent
    assert again.status_code == 201

    saved = (await client.get("/api/v1/saved", headers=h)).json()
    assert [s["listing_id"] for s in saved] == [b, a]  # newest first, no duplicates
    assert saved[0]["listing"]["url"].startswith("https://example.com/mirra-demo/")

    assert (await client.delete(f"/api/v1/saved/{a}", headers=h)).status_code == 204
    assert [s["listing_id"] for s in (await client.get("/api/v1/saved", headers=h)).json()] == [b]


async def test_saved_requires_auth_and_real_listing(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/saved")).status_code == 401
    h = bearer((await register(client))["access_token"])
    r = await client.post("/api/v1/saved", json={"listing_id": str(uuid.uuid4())}, headers=h)
    assert r.status_code == 404


async def test_history_records_searches_and_events_and_can_be_cleared(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    listing = (await _ids(client, "boots", h))[0]
    await _ids(client, "cargo pants", h)
    for event in ("viewed", "clicked_out"):
        r = await client.post("/api/v1/shopping/events", json={"event": event, "listing_id": listing}, headers=h)
        assert r.status_code == 204
    await client.post("/api/v1/saved", json={"listing_id": listing}, headers=h)

    hist = (await client.get("/api/v1/shopping/history", headers=h)).json()
    assert [s["query"] for s in hist["searches"]] == ["cargo pants", "boots"]
    assert [e["event"] for e in hist["events"]] == ["clicked_out", "viewed"]
    assert hist["events"][0]["listing"]["id"] == listing

    bad = await client.post("/api/v1/shopping/events", json={"event": "purchased", "listing_id": listing}, headers=h)
    assert bad.status_code == 422

    assert (await client.delete("/api/v1/shopping/history", headers=h)).status_code == 204
    assert (await client.get("/api/v1/shopping/history", headers=h)).json() == {"searches": [], "events": []}
    assert len((await client.get("/api/v1/saved", headers=h)).json()) == 1  # saved items are kept


async def test_users_only_see_their_own_data(client: AsyncClient) -> None:
    ha = bearer((await register(client, email="a@example.com"))["access_token"])
    hb = bearer((await register(client, email="b@example.com"))["access_token"])
    listing = (await _ids(client, "jeans", ha))[0]
    await client.post("/api/v1/saved", json={"listing_id": listing}, headers=ha)
    assert (await client.get("/api/v1/saved", headers=hb)).json() == []
    assert (await client.get("/api/v1/shopping/history", headers=hb)).json()["searches"] == []
