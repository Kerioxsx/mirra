import json
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI
from httpx import AsyncClient

from mirra.modules.marketplaces.connectors.taobao.connector import TaobaoConnector
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.marketplaces.registry import ConnectorRegistry
from tests.conftest import bearer, register

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/taobao_ovs_material_item_optional.json").read_text()
)


async def _taobao_hoodie(app: FastAPI, client: AsyncClient) -> str:
    client_ = TopClient(
        app_key="k",
        app_secret="s",
        http=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json=FIXTURE))
        ),
    )
    app.state.registry = ConnectorRegistry([TaobaoConnector(client=client_, adzone_id="1")])
    results = (await client.get("/api/v1/search", params={"q": "hoodie"})).json()["results"]
    return next(
        r["listing_id"]
        for r in results
        if r["listing"]["external_id"] == "TEST-tmall-flagship-0001"
    )


async def test_save_a_look_with_generic_and_real_pieces(app: FastAPI, client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    hoodie = await _taobao_hoodie(app, client)
    body = {
        "name": "  Weekend layers  ",
        "items": [
            {"category": "t_shirt", "color_hex": "#EFE6D2"},
            {"category": "zip_up", "color_hex": "#141414", "listing_id": hoodie},
            {"category": "baggy_pants", "color_hex": "#4a6386"},
            {"category": "sneakers", "color_hex": "#f2f1ec"},
        ],
    }
    r = await client.post("/api/v1/outfits", json=body, headers=h)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["name"] == "Weekend layers"
    assert [(i["category"], i["body_region"], i["layer"], i["fidelity"]) for i in out["items"]] == [
        ("t_shirt", "torso", 10, "generic"),
        ("zip_up", "torso", 40, "approximate"),
        ("baggy_pants", "legs", 10, "generic"),
        ("sneakers", "feet", 10, "generic"),
    ]
    assert out["items"][0]["color_hex"] == "#efe6d2"
    assert out["items"][1]["listing"]["store_badge"] == "Tmall"
    assert out["totals"] == [{"amount": "239.00", "currency": "CNY"}]  # from the stored listing
    assert out["price_complete"] is True

    listed = (await client.get("/api/v1/outfits", headers=h)).json()
    assert [o["id"] for o in listed] == [out["id"]]
    renamed = await client.patch(f"/api/v1/outfits/{out['id']}", json={"name": "Sunday"}, headers=h)
    assert renamed.json()["name"] == "Sunday"
    assert (await client.get(f"/api/v1/outfits/{out['id']}", headers=h)).json()["items"] == out[
        "items"
    ]


async def test_rejects_impossible_layouts_and_unknown_products(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    same_slot = {
        "name": "x",
        "items": [
            {"category": "t_shirt", "color_hex": "#000000"},
            {"category": "tank_top", "color_hex": "#ffffff"},
        ],
    }
    r = await client.post("/api/v1/outfits", json=same_slot, headers=h)
    assert r.status_code == 422 and "same slot" in r.json()["error"]["message"]

    dress = {
        "name": "x",
        "items": [
            {"category": "dress", "color_hex": "#000000"},
            {"category": "jeans", "color_hex": "#000000"},
        ],
    }
    r = await client.post("/api/v1/outfits", json=dress, headers=h)
    assert r.status_code == 422 and "one-piece" in r.json()["error"]["message"]

    ghost = {
        "name": "x",
        "items": [{"category": "jeans", "color_hex": "#000000", "listing_id": str(uuid.uuid4())}],
    }
    r = await client.post("/api/v1/outfits", json=ghost, headers=h)
    assert r.status_code == 422 and r.json()["error"]["details"]["listing_ids"]

    bad_colour = {"name": "x", "items": [{"category": "jeans", "color_hex": "blue"}]}
    assert (await client.post("/api/v1/outfits", json=bad_colour, headers=h)).status_code == 422
    assert (
        await client.post("/api/v1/outfits", json={"name": "x", "items": []}, headers=h)
    ).status_code == 422


async def test_listing_category_must_match(app: FastAPI, client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    hoodie = await _taobao_hoodie(app, client)
    body = {
        "name": "x",
        "items": [{"category": "jeans", "color_hex": "#000000", "listing_id": hoodie}],
    }
    r = await client.post("/api/v1/outfits", json=body, headers=h)
    assert r.status_code == 422 and "not a jeans" in r.json()["error"]["message"]


async def test_outfits_are_private_and_deletable(client: AsyncClient) -> None:
    ha = bearer((await register(client, email="a@example.com"))["access_token"])
    hb = bearer((await register(client, email="b@example.com"))["access_token"])
    out = (
        await client.post(
            "/api/v1/outfits",
            json={"name": "Mine", "items": [{"category": "beanie", "color_hex": "#141414"}]},
            headers=ha,
        )
    ).json()
    assert (await client.get(f"/api/v1/outfits/{out['id']}", headers=hb)).status_code == 404
    assert (await client.delete(f"/api/v1/outfits/{out['id']}", headers=hb)).status_code == 404
    assert (await client.get("/api/v1/outfits", headers=hb)).json() == []
    assert (await client.delete(f"/api/v1/outfits/{out['id']}", headers=ha)).status_code == 204
    assert (await client.get("/api/v1/outfits", headers=ha)).json() == []
    assert (await client.get("/api/v1/outfits")).status_code == 401
