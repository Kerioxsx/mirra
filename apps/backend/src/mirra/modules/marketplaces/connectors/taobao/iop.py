"""Client for the Taobao Global Open Platform (open.taobao.global), Alibaba's IOP protocol.

For approved cross-border distributors: product details, image search (/product/similar/get),
dropship purchase orders. Endpoint field contracts are only available inside the developer console
once an app is approved, so product endpoints are wired after approval; this client (signing,
transport, OAuth token create/refresh, errors) is ready and verified against Alibaba's published
signature example.

Signature: HMAC-SHA256(app_secret, api_path + sorted k+v), uppercase hex. Timestamp: ms epoch.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from collections.abc import Callable, Mapping
from typing import Any

import httpx

from mirra.modules.marketplaces.base import ConnectorUnavailable

DEFAULT_GATEWAY = "https://api.taobao.global/rest"


class IopError(ConnectorUnavailable):
    def __init__(self, type_: str | None, code: str, message: str, request_id: str | None) -> None:
        super().__init__(f"Taobao Global {type_ or 'API'} error {code}: {message}")
        self.type = type_
        self.code = code
        self.message = message
        self.request_id = request_id


def iop_sign(api_path: str, params: Mapping[str, str], secret: str) -> str:
    payload = api_path + "".join(
        f"{k}{params[k]}" for k in sorted(params) if k != "sign" and params[k] != ""
    )
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest().upper()


class IopClient:
    def __init__(
        self,
        *,
        app_key: str,
        app_secret: str,
        gateway: str = DEFAULT_GATEWAY,
        http: httpx.AsyncClient | None = None,
        timeout: float = 10.0,
        clock_ms: Callable[[], int] | None = None,
    ) -> None:
        self._key = app_key
        self._secret = app_secret
        self._gateway = gateway.rstrip("/")
        self._http = http or httpx.AsyncClient(timeout=timeout)
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))

    def build_params(
        self, api_path: str, params: Mapping[str, Any], access_token: str | None = None
    ) -> dict[str, str]:
        all_params = {k: str(v) for k, v in params.items() if v is not None}
        all_params.update(
            {"app_key": self._key, "timestamp": str(self._clock_ms()), "sign_method": "sha256"}
        )
        if access_token:
            all_params["access_token"] = access_token
        all_params["sign"] = iop_sign(api_path, all_params, self._secret)
        return all_params

    async def call(
        self,
        api_path: str,
        params: Mapping[str, Any] | None = None,
        access_token: str | None = None,
    ) -> dict[str, Any]:
        if not api_path.startswith("/"):
            raise ValueError("api_path must start with '/'")
        try:
            resp = await self._http.post(
                self._gateway + api_path,
                data=self.build_params(api_path, params or {}, access_token),
            )
            body: dict[str, Any] = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ConnectorUnavailable(f"Taobao Global unreachable: {type(exc).__name__}") from exc
        code = str(body.get("code", "0"))
        if code != "0":
            raise IopError(
                body.get("type"), code, str(body.get("message", "")), body.get("request_id")
            )
        return body

    async def create_token(self, code: str) -> dict[str, Any]:
        """Exchange an OAuth authorization code (valid 30 minutes) for tokens."""
        return await self.call("/auth/token/create", {"code": code})

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """Refresh tokens; always persist the newest refresh_token returned."""
        return await self.call("/auth/token/refresh", {"refresh_token": refresh_token})

    def authorize_url(self, redirect_uri: str, state: str) -> str:
        q = httpx.QueryParams(
            response_type="code",
            redirect_uri=redirect_uri,
            force_auth="true",
            client_id=self._key,
            state=state,
        )
        return f"{self._gateway.removesuffix('/rest')}/oauth/authorize?{q}"

    async def aclose(self) -> None:
        await self._http.aclose()
