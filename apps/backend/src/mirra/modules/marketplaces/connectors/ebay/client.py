"""eBay Buy APIs: OAuth (client credentials) and the Browse API's search methods.

* Token: ``POST {api}/identity/v1/oauth2/token`` with HTTP Basic ``client_id:client_secret`` and
  ``grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope``. Application tokens
  last ``expires_in`` seconds (7200 today); this client refreshes a minute early.
* Search: ``GET {api}/buy/browse/v1/item_summary/search`` (``q``, ``category_ids``, ``filter``,
  ``sort``, ``limit``, ``offset``).
* Image search: ``POST {api}/buy/browse/v1/item_summary/search_by_image`` with
  ``{"image": <base64>}`` and the same query parameters (an eBay "experimental" method).

Headers: ``X-EBAY-C-MARKETPLACE-ID`` (e.g. EBAY_US) and, when known, ``X-EBAY-C-ENDUSERCTX``
with ``contextualLocation=country=XX`` (shipping estimates for the shopper's country) and
``affiliateCampaignId`` (eBay Partner Network links in ``itemAffiliateWebUrl``).
"""

from __future__ import annotations

import base64
import time
from collections.abc import Callable, Mapping
from typing import Any

import httpx

from mirra.modules.marketplaces.base import ConnectorUnavailable

SCOPE = "https://api.ebay.com/oauth/api_scope"


class EbayError(ConnectorUnavailable):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(f"eBay API error {status}: {message}")
        self.status = status


class EbayClient:
    def __init__(
        self,
        *,
        client_id: str,
        client_secret: str,
        marketplace_id: str = "EBAY_US",
        api_base: str = "https://api.ebay.com",
        campaign_id: str | None = None,
        http: httpx.AsyncClient | None = None,
        timeout: float = 8.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._id = client_id
        self._secret = client_secret
        self.marketplace_id = marketplace_id
        self._base = api_base.rstrip("/")
        self._campaign = campaign_id
        self._http = http or httpx.AsyncClient(timeout=timeout)
        self._clock = clock
        self._token: str | None = None
        self._expires_at = 0.0

    async def token(self) -> str:
        if self._token and self._clock() < self._expires_at - 60:
            return self._token
        basic = base64.b64encode(f"{self._id}:{self._secret}".encode()).decode()
        try:
            resp = await self._http.post(
                f"{self._base}/identity/v1/oauth2/token",
                headers={
                    "Authorization": f"Basic {basic}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials", "scope": SCOPE},
            )
        except httpx.HTTPError as exc:
            raise ConnectorUnavailable(f"eBay unreachable: {type(exc).__name__}") from exc
        if resp.status_code != 200:
            raise EbayError(resp.status_code, _message(resp))
        body = resp.json()
        self._token = str(body["access_token"])
        self._expires_at = self._clock() + float(body.get("expires_in", 7200))
        return self._token

    def headers(self, token: str, ship_to: str | None) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": self.marketplace_id,
            "Accept": "application/json",
        }
        ctx = []
        if ship_to:
            ctx.append(f"contextualLocation=country%3D{ship_to.upper()}")
        if self._campaign:
            ctx.append(f"affiliateCampaignId={self._campaign}")
        if ctx:
            h["X-EBAY-C-ENDUSERCTX"] = ",".join(ctx)
        return h

    async def _send(
        self,
        method: str,
        path: str,
        params: Mapping[str, str],
        ship_to: str | None,
        json: Any = None,
    ) -> dict[str, Any]:
        for attempt in (0, 1):
            token = await self.token()
            try:
                resp = await self._http.request(
                    method,
                    f"{self._base}{path}",
                    params=dict(params),
                    headers=self.headers(token, ship_to),
                    json=json,
                )
            except httpx.HTTPError as exc:
                raise ConnectorUnavailable(f"eBay unreachable: {type(exc).__name__}") from exc
            if resp.status_code == 401 and attempt == 0:
                self._token = None  # expired or revoked: get a fresh one once
                continue
            if resp.status_code != 200:
                raise EbayError(resp.status_code, _message(resp))
            body: dict[str, Any] = resp.json()
            return body
        raise EbayError(401, "Unauthorized")

    async def search(self, params: Mapping[str, str], ship_to: str | None) -> dict[str, Any]:
        return await self._send("GET", "/buy/browse/v1/item_summary/search", params, ship_to)

    async def search_by_image(
        self, image: bytes, params: Mapping[str, str], ship_to: str | None
    ) -> dict[str, Any]:
        payload = {"image": base64.b64encode(image).decode()}
        return await self._send(
            "POST", "/buy/browse/v1/item_summary/search_by_image", params, ship_to, json=payload
        )

    async def aclose(self) -> None:
        await self._http.aclose()


def _message(resp: httpx.Response) -> str:
    try:
        errors = resp.json().get("errors") or []
        if errors:
            return str(errors[0].get("message") or errors[0].get("longMessage") or "error")
    except ValueError:
        pass
    return resp.reason_phrase or "error"
