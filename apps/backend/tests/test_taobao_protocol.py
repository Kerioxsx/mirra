"""TOP and Taobao Global (IOP) protocol: signatures are checked against Alibaba's published examples."""

import json
from datetime import UTC, datetime

import httpx
import pytest

from mirra.modules.marketplaces.base import ConnectorUnavailable
from mirra.modules.marketplaces.connectors.taobao.iop import IopClient, IopError, iop_sign
from mirra.modules.marketplaces.connectors.taobao.top import (
    TopClient,
    TopError,
    response_key,
    top_sign,
)


def test_top_md5_signature_matches_published_example() -> None:
    # Example from the TOP "How to invoke" doc. Its spliced string is literally
    # "...service_namSPAIN_LOCAL_CORREOSesessiontest..." (a typo in the doc), which these two
    # parameters reproduce byte for byte; the expected value is the doc's.
    params = {
        "method": "aliexpress.solution.order.fulfill",
        "app_key": "12345678",
        "session": "test",
        "timestamp": "2019-01-01 12:00:00",
        "format": "json",
        "v": "2.0",
        "sign_method": "md5",
        "service_nam": "SPAIN_LOCAL_CORREOSe",
        "out_ref": "1000006270175804",
        "send_type": "all",
        "logisitics_no": "ES2019COM0000123456",
    }
    assert top_sign(params, "helloworld", "md5") == "F7A5E0B28DEFFE9E1E6E5C0E8B0530EC"


def test_iop_signature_matches_published_taobao_global_example() -> None:
    # Example from the Taobao Global Open Platform development manual (section 3.2.6).
    params = {
        "app_key": "123456",
        "access_token": "test",
        "timestamp": "1517820392000",
        "sign_method": "sha256",
        "order_id": "1234",
    }
    assert iop_sign("/order/get", params, "helloworld") == (
        "4190D32361CFB9581350222F345CB77F3B19F0E31D162316848A2C1FFD5FAB4A"
    )


def test_signatures_ignore_sign_and_empty_values() -> None:
    base = {"a": "1", "b": "2"}
    for method in ("md5", "hmac", "hmac-sha256"):
        sig = top_sign(base, "s", method)  # type: ignore[arg-type]
        assert sig == top_sign({**base, "sign": "X", "empty": ""}, "s", method)  # type: ignore[arg-type]
        assert sig.isupper()
    assert len(top_sign(base, "s", "hmac")) == 32
    assert len(top_sign(base, "s", "hmac-sha256")) == 64


def test_response_key() -> None:
    assert (
        response_key("taobao.ovs.tbk.material.item.optional")
        == "ovs_tbk_material_item_optional_response"
    )


def _top(handler, **kw) -> TopClient:  # type: ignore[no-untyped-def]
    return TopClient(
        app_key="k",
        app_secret="secret",
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        clock=lambda: datetime(2026, 1, 1, 4, 0, 0, tzinfo=UTC),
        **kw,
    )


async def test_top_client_sends_signed_form_with_gmt8_timestamp() -> None:
    seen: dict[str, str] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(dict(httpx.QueryParams(req.content.decode())))
        return httpx.Response(
            200, json={"ovs_tbk_material_item_optional_response": {"total_results": 0}}
        )

    client = _top(handler)
    out = await client.call(
        "taobao.ovs.tbk.material.item.optional", {"q": "卫衣", "is_tmall": True, "cat": None}
    )
    assert out == {"total_results": 0}
    assert seen["timestamp"] == "2026-01-01 12:00:00"  # 04:00 UTC = 12:00 China Standard Time
    assert seen["is_tmall"] == "true" and "cat" not in seen
    assert seen["format"] == "json" and seen["v"] == "2.0" and seen["sign_method"] == "md5"
    unsigned = {k: v for k, v in seen.items() if k != "sign"}
    assert seen["sign"] == top_sign(unsigned, "secret", "md5")


async def test_top_client_raises_on_error_response_and_transport_failure() -> None:
    err = {
        "error_response": {
            "code": 50,
            "msg": "Remote service error",
            "sub_code": "isv.invalid-parameter",
            "sub_msg": "非法参数",
        }
    }
    client = _top(lambda req: httpx.Response(200, json=err))
    with pytest.raises(TopError) as info:
        await client.call("taobao.ovs.tbk.material.item.optional", {})
    assert info.value.sub_code == "isv.invalid-parameter"

    def boom(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    with pytest.raises(ConnectorUnavailable):
        await _top(boom).call("taobao.ovs.tbk.material.item.optional", {})
    with pytest.raises(ConnectorUnavailable, match="missing"):
        await _top(lambda req: httpx.Response(200, json={"other": 1})).call(
            "taobao.ovs.tbk.material.item.optional", {}
        )


async def test_iop_client_signs_requests_and_surfaces_errors() -> None:
    seen: dict[str, str] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["path"] = req.url.path
        seen.update(dict(httpx.QueryParams(req.content.decode())))
        if req.url.path.endswith("/auth/token/create"):
            return httpx.Response(
                200, json={"code": "0", "access_token": "at", "refresh_token": "rt"}
            )
        return httpx.Response(
            200,
            json={
                "type": "ISV",
                "code": "IllegalAccessToken",
                "message": "bad token",
                "request_id": "r1",
            },
        )

    client = IopClient(
        app_key="123456",
        app_secret="helloworld",
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        clock_ms=lambda: 1517820392000,
    )
    tokens = await client.create_token("authcode")
    assert tokens["access_token"] == "at"
    assert seen["path"] == "/rest/auth/token/create" and seen["sign_method"] == "sha256"
    assert seen["sign"] == iop_sign(
        "/auth/token/create",
        {k: v for k, v in seen.items() if k not in ("sign", "path")},
        "helloworld",
    )
    with pytest.raises(IopError) as info:
        await client.call("/product/get", {"item_id": "1"}, access_token="x")
    assert info.value.code == "IllegalAccessToken" and info.value.type == "ISV"
    url = client.authorize_url("https://mirra.example/cb", "state123")
    assert (
        url.startswith("https://api.taobao.global/oauth/authorize?") and "client_id=123456" in url
    )


def test_fixture_is_valid_json() -> None:
    from pathlib import Path

    data = json.loads(
        (Path(__file__).parent / "fixtures/taobao_ovs_material_item_optional.json").read_text()
    )
    assert "ovs_tbk_material_item_optional_response" in data
