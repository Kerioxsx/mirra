from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select, update

from mirra.core.db import get_sessionmaker
from mirra.modules.auth.models import AuthSession
from tests.conftest import DESKTOP, PASSWORD, WEB, bearer, register


async def test_register_web_sets_httponly_cookie_and_hides_refresh_token(
    client: AsyncClient,
) -> None:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "Ada@Example.com", "password": PASSWORD, "display_name": " Ada "},
        headers=WEB,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["refresh_token"] is None
    assert body["user"]["email"] == "ada@example.com"
    assert body["user"]["display_name"] == "Ada"
    cookie = r.headers["set-cookie"]
    assert "mirra_refresh=" in cookie
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth" in cookie
    assert "samesite=lax" in cookie.lower()
    assert r.headers["cache-control"] == "no-store"

    me = await client.get("/api/v1/users/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"


async def test_register_rejects_duplicate_email_case_insensitively(client: AsyncClient) -> None:
    await register(client)
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "ADA@example.com", "password": PASSWORD, "display_name": "Ada"},
        headers=WEB,
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "conflict"


async def test_register_validates_password_length(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "a@example.com", "password": "short", "display_name": "A"},
        headers=WEB,
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_client_header_is_required(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/login", json={"email": "a@example.com", "password": "x"})
    assert r.status_code == 400
    assert "X-Mirra-Client" in r.json()["error"]["message"]


async def test_login_success_and_generic_failure(client: AsyncClient) -> None:
    await register(client)
    ok = await client.post(
        "/api/v1/auth/login", json={"email": "ada@example.com", "password": PASSWORD}, headers=WEB
    )
    assert ok.status_code == 200
    wrong = await client.post(
        "/api/v1/auth/login", json={"email": "ada@example.com", "password": "nope"}, headers=WEB
    )
    unknown = await client.post(
        "/api/v1/auth/login", json={"email": "who@example.com", "password": "nope"}, headers=WEB
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


async def test_web_refresh_rotates_cookie(client: AsyncClient) -> None:
    await register(client)
    first_cookie = client.cookies.get("mirra_refresh")
    r = await client.post("/api/v1/auth/refresh", headers=WEB)
    assert r.status_code == 200, r.text
    assert client.cookies.get("mirra_refresh") != first_cookie
    me = await client.get("/api/v1/users/me", headers=bearer(r.json()["access_token"]))
    assert me.status_code == 200


async def test_reused_token_within_grace_is_superseded_not_fatal(client: AsyncClient) -> None:
    await register(client)
    old = client.cookies.get("mirra_refresh")
    assert (await client.post("/api/v1/auth/refresh", headers=WEB)).status_code == 200
    current = client.cookies.get("mirra_refresh")

    client.cookies.set("mirra_refresh", old, path="/api/v1/auth")
    r = await client.post("/api/v1/auth/refresh", headers=WEB)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "refresh_superseded"

    # the family survives a benign race: the current token still works
    client.cookies.set("mirra_refresh", current, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh", headers=WEB)).status_code == 200


async def test_reuse_after_grace_revokes_whole_family(client: AsyncClient) -> None:
    await register(client)
    old = client.cookies.get("mirra_refresh")
    assert (await client.post("/api/v1/auth/refresh", headers=WEB)).status_code == 200
    current = client.cookies.get("mirra_refresh")

    async with get_sessionmaker()() as s:  # pretend the rotation happened a minute ago
        await s.execute(
            update(AuthSession)
            .where(AuthSession.revoked_at.is_not(None))
            .values(revoked_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await s.commit()

    client.cookies.set("mirra_refresh", old, path="/api/v1/auth")
    r = await client.post("/api/v1/auth/refresh", headers=WEB)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "refresh_reused"

    client.cookies.set("mirra_refresh", current, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh", headers=WEB)).status_code == 401
    async with get_sessionmaker()() as s:
        live = (await s.execute(select(AuthSession).where(AuthSession.revoked_at.is_(None)))).all()
    assert live == []


async def test_desktop_gets_refresh_token_in_body_and_no_cookie(client: AsyncClient) -> None:
    body = await register(client, headers=DESKTOP)
    assert body["refresh_token"]
    assert client.cookies.get("mirra_refresh") is None

    r = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}, headers=DESKTOP
    )
    assert r.status_code == 200
    assert r.json()["refresh_token"] not in (None, body["refresh_token"])


async def test_refresh_token_is_bound_to_its_client_kind(client: AsyncClient) -> None:
    body = await register(client, headers=DESKTOP)
    client.cookies.set("mirra_refresh", body["refresh_token"], path="/api/v1/auth")
    r = await client.post("/api/v1/auth/refresh", headers=WEB)
    assert r.status_code == 401


async def test_logout_revokes_session_and_clears_cookie(client: AsyncClient) -> None:
    await register(client)
    r = await client.post("/api/v1/auth/logout", headers=WEB)
    assert r.status_code == 204
    assert 'mirra_refresh=""' in r.headers["set-cookie"] or "Max-Age=0" in r.headers["set-cookie"]
    assert (await client.post("/api/v1/auth/refresh", headers=WEB)).status_code == 401


async def test_desktop_logout_revokes_body_token(client: AsyncClient) -> None:
    body = await register(client, headers=DESKTOP)
    token = {"refresh_token": body["refresh_token"]}
    assert (
        await client.post("/api/v1/auth/logout", json=token, headers=DESKTOP)
    ).status_code == 204
    r = await client.post("/api/v1/auth/refresh", json=token, headers=DESKTOP)
    assert r.status_code == 401


async def test_bad_or_missing_access_token(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/users/me")).status_code == 401
    r = await client.get("/api/v1/users/me", headers=bearer("not.a.jwt"))
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


async def test_login_is_rate_limited(client: AsyncClient) -> None:
    payload = {"email": "ada@example.com", "password": "wrong-password"}
    codes = [
        (await client.post("/api/v1/auth/login", json=payload, headers=WEB)).status_code
        for _ in range(21)
    ]
    assert codes[:20] == [401] * 20
    assert codes[20] == 429
