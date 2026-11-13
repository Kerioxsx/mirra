from httpx import AsyncClient

from tests.conftest import PASSWORD, WEB, bearer, register


async def test_update_display_name(client: AsyncClient) -> None:
    token = (await register(client))["access_token"]
    r = await client.patch(
        "/api/v1/users/me", json={"display_name": "Ada L."}, headers=bearer(token)
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Ada L."


async def test_preferences_defaults_then_replace(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    r = await client.get("/api/v1/users/me/preferences", headers=h)
    assert r.status_code == 200
    assert r.json()["currency"] == "USD"
    assert r.json()["render_quality"] == "medium"
    assert r.json()["styles"] == []

    prefs = {
        "styles": ["japanese streetwear", "vintage"],
        "favorite_brands": ["Kapital"],
        "sizes": {"top": "M", "bottom": "32x32", "shoe": "US 10"},
        "budget_min": "50",
        "budget_max": "200.00",
        "currency": "EUR",
        "ship_to_country": "DE",
        "render_quality": "high",
    }
    r = await client.put("/api/v1/users/me/preferences", json=prefs, headers=h)
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["styles"] == ["japanese streetwear", "vintage"]
    assert got["sizes"]["shoe"] == "US 10"
    assert got["currency"] == "EUR"
    assert float(got["budget_max"]) == 200.0

    again = await client.get("/api/v1/users/me/preferences", headers=h)
    assert again.json() == got


async def test_preferences_validation(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    bad_budget = await client.put(
        "/api/v1/users/me/preferences", json={"budget_min": 300, "budget_max": 100}, headers=h
    )
    assert bad_budget.status_code == 422
    bad_currency = await client.put(
        "/api/v1/users/me/preferences", json={"currency": "dollars"}, headers=h
    )
    assert bad_currency.status_code == 422
    bad_quality = await client.put(
        "/api/v1/users/me/preferences", json={"render_quality": "ultra"}, headers=h
    )
    assert bad_quality.status_code == 422


async def test_delete_account_requires_password_and_cascades(client: AsyncClient) -> None:
    h = bearer((await register(client))["access_token"])
    await client.put("/api/v1/users/me/preferences", json={"styles": ["minimal"]}, headers=h)

    wrong = await client.request("DELETE", "/api/v1/users/me", json={"password": "nope"}, headers=h)
    assert wrong.status_code == 401
    ok = await client.request("DELETE", "/api/v1/users/me", json={"password": PASSWORD}, headers=h)
    assert ok.status_code == 204

    assert (await client.get("/api/v1/users/me", headers=h)).status_code == 401
    login = await client.post(
        "/api/v1/auth/login", json={"email": "ada@example.com", "password": PASSWORD}, headers=WEB
    )
    assert login.status_code == 401
