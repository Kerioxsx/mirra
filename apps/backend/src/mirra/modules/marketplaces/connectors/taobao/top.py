"""Client for the classic Taobao Open Platform (TOP) router protocol.

Used for the Taobao affiliate APIs (``taobao.ovs.tbk.*`` for overseas publishers). Protocol per the
TOP docs: system params ``method, app_key, timestamp (GMT+8 "yyyy-MM-dd HH:mm:ss"), format, v,
sign_method, sign``; signature = MD5(secret + sorted k+v + secret), or HMAC-MD5 / HMAC-SHA256
keyed by the secret, uppercase hex. Verified against the published example in tests.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from mirra.modules.marketplaces.base import ConnectorUnavailable

SignMethod = Literal["md5", "hmac", "hmac-sha256"]
DEFAULT_GATEWAY = "https://eco.taobao.com/router/rest"
_CST = timezone(timedelta(hours=8))


class TopError(ConnectorUnavailable):
    def __init__(self, code: int | str | None, msg: str, sub_code: str | None, sub_msg: str | None):
        super().__init__(f"TOP error {code}: {msg} ({sub_code}: {sub_msg})")
        self.code = code
        self.msg = msg
        self.sub_code = sub_code
        self.sub_msg = sub_msg


def top_sign(params: Mapping[str, str], secret: str, method: SignMethod) -> str:
    """Sign every parameter except ``sign`` (byte-array params are never sent by this client)."""
    payload = "".join(f"{k}{params[k]}" for k in sorted(params) if k != "sign" and params[k] != "")
    if method == "md5":
        digest = hashlib.md5((secret + payload + secret).encode()).hexdigest()  # noqa: S324 - protocol
    elif method == "hmac":
        digest = hmac.new(secret.encode(), payload.encode(), hashlib.md5).hexdigest()
    else:
        digest = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return digest.upper()


def _stringify(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def response_key(method: str) -> str:
    """``taobao.ovs.tbk.material.item.optional`` → ``ovs_tbk_material_item_optional_response``."""
    name = method.removeprefix("taobao.")
    return name.replace(".", "_") + "_response"


class TopClient:
    def __init__(
        self,
        *,
        app_key: str,
        app_secret: str,
        gateway: str = DEFAULT_GATEWAY,
        sign_method: SignMethod = "md5",
        http: httpx.AsyncClient | None = None,
        timeout: float = 8.0,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._key = app_key
        self._secret = app_secret
        self._gateway = gateway
        self._sign_method: SignMethod = sign_method
        self._http = http or httpx.AsyncClient(timeout=timeout)
        self._clock = clock or (lambda: datetime.now(UTC))

    def build_params(self, method: str, params: Mapping[str, Any]) -> dict[str, str]:
        system = {
            "method": method,
            "app_key": self._key,
            "timestamp": self._clock().astimezone(_CST).strftime("%Y-%m-%d %H:%M:%S"),
            "format": "json",
            "v": "2.0",
            "sign_method": self._sign_method,
        }
        business = {k: _stringify(v) for k, v in params.items() if v is not None}
        all_params = {**business, **system}
        all_params["sign"] = top_sign(all_params, self._secret, self._sign_method)
        return all_params

    async def call(self, method: str, params: Mapping[str, Any]) -> dict[str, Any]:
        try:
            resp = await self._http.post(self._gateway, data=self.build_params(method, params))
            resp.raise_for_status()
            body = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ConnectorUnavailable(f"Taobao gateway unreachable: {type(exc).__name__}") from exc
        if "error_response" in body:
            e = body["error_response"]
            raise TopError(e.get("code"), e.get("msg", ""), e.get("sub_code"), e.get("sub_msg"))
        key = response_key(method)
        if key not in body:
            raise ConnectorUnavailable(f"Unexpected Taobao response (missing {key})")
        result: dict[str, Any] = body[key]
        return result

    async def aclose(self) -> None:
        await self._http.aclose()
