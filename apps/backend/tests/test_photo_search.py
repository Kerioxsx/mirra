from decimal import Decimal

from fastapi import FastAPI
from httpx import AsyncClient

from mirra.core.taxonomy import Category, IntegrationType
from mirra.modules.marketplaces.base import (
    ConnectorCapabilities,
    ConnectorQuery,
    ConnectorSearchPage,
    MarketplaceConnector,
    Money,
    NormalizedListing,
)
from mirra.modules.search.photo import (
    MAX_PHOTO_BYTES,
    GarmentReading,
    MediaType,
    PhotoReading,
    sniff,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


class FakeDescriber:
    def __init__(self, reading: PhotoReading | None) -> None:
        self.reading = reading
        self.calls: list[tuple[int, str]] = []

    async def describe(self, data: bytes, media_type: MediaType) -> PhotoReading | None:
        self.calls.append((len(data), media_type))
        return self.reading

    async def aclose(self) -> None:
        pass


class FakeImageMarketplace(MarketplaceConnector):
    id = "ebay"
    name = "eBay"
    base_url = "https://www.ebay.com"
    integration_type = IntegrationType.official_api

    def __init__(self) -> None:
        self.images: list[bytes] = []

    def get_capabilities(self) -> ConnectorCapabilities:
        return ConnectorCapabilities(image_search=True)

    async def search_by_image(self, image: bytes, query: ConnectorQuery) -> ConnectorSearchPage:
        self.images.append(image)
        return ConnectorSearchPage(
            marketplace_id=self.id,
            listings=[
                NormalizedListing(
                    marketplace_id="ebay",
                    external_id="v1|1|0",
                    url="https://www.ebay.com/itm/1",
                    title="Olive puffer vest",
                    category=Category.vest,
                    price=Money(amount=Decimal("30.00"), currency="USD"),
                )
            ],
        )


def test_sniff_trusts_bytes_not_names():
    assert sniff(PNG) == "image/png"
    assert sniff(JPEG) == "image/jpeg"
    assert sniff(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert sniff(b"GIF89a....") == "image/gif"
    assert sniff(b"%PDF-1.7") is None


async def test_vision_reading_drives_the_search(app: FastAPI, client: AsyncClient):
    describer = FakeDescriber(
        PhotoReading(
            is_clothing=True,
            garments=[
                GarmentReading(
                    category=Category.hoodie,
                    colors=["black"],
                    pattern="solid",
                    details=["hood", "zip"],
                    query="black zip-up hoodie",
                ),
                GarmentReading(
                    category=Category.jeans,
                    colors=["blue"],
                    pattern=None,
                    details=["wide leg"],
                    query="blue wide leg jeans",
                ),
            ],
        )
    )
    app.state.describer = describer
    res = await client.post("/api/v1/search/photo", files={"image": ("me.png", PNG, "image/png")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["photo"]["source"] == "vision"
    assert body["photo"]["query"] == "black zip-up hoodie"
    assert body["photo"]["category"] == "hoodie"
    assert [g["query"] for g in body["photo"]["garments"]] == [
        "black zip-up hoodie",
        "blue wide leg jeans",
    ]
    assert body["results"], "the demo catalog has hoodies"
    assert describer.calls == [(len(PNG), "image/png")]

    # pick the second garment
    second = await client.post(
        "/api/v1/search/photo",
        files={"image": ("me.png", PNG, "image/png")},
        data={"garment": "1"},
    )
    assert second.json()["photo"]["query"] == "blue wide leg jeans"
    assert second.json()["photo"]["garment_index"] == 1


async def test_without_vision_the_hint_from_the_device_is_searched(client: AsyncClient):
    res = await client.post(
        "/api/v1/search/photo",
        files={"image": ("vest.jpg", JPEG, "image/jpeg")},
        data={"hint": "olive puffer vest", "category": "vest"},
    )
    assert res.status_code == 200, res.text
    photo = res.json()["photo"]
    assert (photo["source"], photo["query"], photo["category"]) == (
        "hint",
        "olive puffer vest",
        "vest",
    )
    assert photo["vision_available"] is False

    # only a category: its name is the query
    cat_only = await client.post(
        "/api/v1/search/photo",
        files={"image": ("vest.jpg", JPEG, "image/jpeg")},
        data={"category": "sneakers"},
    )
    assert cat_only.json()["photo"]["query"] == "Sneakers"


async def test_marketplaces_with_image_search_get_the_photo(app: FastAPI, client: AsyncClient):
    fake = FakeImageMarketplace()
    app.state.registry.register(fake)
    res = await client.post(
        "/api/v1/search/photo",
        files={"image": ("vest.png", PNG, "image/png")},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["photo"]["source"] == "image_only"
    assert body["results"][0]["listing"]["title"] == "Olive puffer vest"
    assert fake.images == [PNG]


async def test_bad_photos_are_refused_with_a_reason(app: FastAPI, client: AsyncClient):
    pdf = await client.post(
        "/api/v1/search/photo", files={"image": ("x.png", b"%PDF-1.7 ...", "image/png")}
    )
    assert pdf.status_code == 422
    assert "JPEG, PNG" in pdf.json()["error"]["message"]

    big = await client.post(
        "/api/v1/search/photo",
        files={"image": ("big.png", PNG + b"\x00" * MAX_PHOTO_BYTES, "image/png")},
    )
    assert big.status_code == 422

    nothing = await client.post(
        "/api/v1/search/photo", files={"image": ("x.png", PNG, "image/png")}
    )
    assert nothing.status_code == 422
    assert "Pick what kind of piece" in nothing.json()["error"]["message"]

    app.state.describer = FakeDescriber(PhotoReading(is_clothing=False, garments=[]))
    cat = await client.post("/api/v1/search/photo", files={"image": ("cat.png", PNG, "image/png")})
    assert cat.status_code == 422
    assert "doesn't seem to show clothing" in cat.json()["error"]["message"]


class _Resp:
    def __init__(self, stop_reason: str, parsed: PhotoReading | None) -> None:
        self.stop_reason = stop_reason
        self.parsed_output = parsed


async def test_claude_describer_handles_refusals_errors_and_long_lists(monkeypatch):
    import anthropic
    import httpx2

    from mirra.modules.search.photo import ClaudeDescriber

    d = ClaudeDescriber(api_key="test-key", model="claude-opus-5-5")
    garment = GarmentReading(
        category=Category.t_shirt, colors=["white"], pattern=None, details=[], query="white tee"
    )
    sent: dict[str, object] = {}

    async def ok(**kwargs: object) -> _Resp:
        sent.update(kwargs)
        return _Resp("end_turn", PhotoReading(is_clothing=True, garments=[garment] * 6))

    monkeypatch.setattr(d._client.beta.messages, "parse", ok)
    reading = await d.describe(PNG, "image/png")
    assert reading is not None and len(reading.garments) == 4
    assert sent["model"] == "claude-opus-5-5"
    assert sent["output_format"] is PhotoReading
    assert sent["fallbacks"] == "default"
    content = sent["messages"][0]["content"]  # type: ignore[index]
    assert content[0]["source"]["media_type"] == "image/png"

    async def refused(**kwargs: object) -> _Resp:
        return _Resp("refusal", None)

    monkeypatch.setattr(d._client.beta.messages, "parse", refused)
    assert await d.describe(PNG, "image/png") is None

    async def broken(**kwargs: object) -> _Resp:
        req = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        raise anthropic.InternalServerError(
            "boom", response=httpx2.Response(500, request=req), body=None
        )

    monkeypatch.setattr(d._client.beta.messages, "parse", broken)
    assert await d.describe(PNG, "image/png") is None
    await d.aclose()
