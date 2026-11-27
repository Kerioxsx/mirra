from httpx import AsyncClient

from mirra.core.taxonomy import Category
from mirra.modules.marketplaces.base import NormalizedListing
from mirra.modules.sizing import cn
from mirra.modules.sizing.guide import kind_of, size_guide


def test_national_code_reads_as_the_wearers_body():
    top = cn.read_label("175/92A")
    assert top is not None
    assert (top.system, top.kind, top.basis) == ("gb_code", "top", "standard")
    assert top.body.height_cm == (172.5, 177.5)
    assert top.body.chest_cm == (90.0, 94.0)
    assert top.body_type == "A"

    bottom = cn.read_label("160/68A", kind="bottom", cut="womens")
    assert bottom is not None
    assert bottom.body.waist_cm == (66.0, 70.0)
    assert bottom.body.chest_cm is None
    assert "14 to 18 cm" in bottom.note  # women's body type A, GB/T 1335.2


def test_letters_follow_typical_hang_tags_and_say_so():
    mens = cn.read_label("L", kind="top", cut="mens")
    assert mens is not None
    assert mens.basis == "typical"
    assert mens.body.chest_cm == (90, 94)  # 175/92
    womens = cn.read_label("XXL", kind="bottom", cut="womens")
    assert womens is not None and womens.label == "XXL"
    assert womens.body.waist_cm == (78, 82)  # 175/80
    assert "shops vary" in womens.note


def test_waists_and_shoes():
    chi = cn.read_label("2尺2")
    assert chi is not None and chi.system == "waist_chi"
    assert chi.body.waist_cm == (71.6, 75.0)
    inches = cn.read_label("29")
    assert inches is not None and inches.system == "waist_inches"
    shoe = cn.read_label("42", kind="shoe")
    assert shoe is not None and shoe.body.foot_mm == (257.5, 262.5)
    assert cn.read_label("36") is None  # a shoe or a waist: needs the garment's kind
    assert cn.read_label("36", kind="shoe") is not None
    assert cn.read_label("banana") is None


def test_labels_in_titles():
    assert cn.labels_in_text("2026新款男士连帽卫衣宽松 M-3XL 175/92A") == [
        "175/92A",
        "M",
        "L",
        "XL",
        "2XL",
        "3XL",
    ]
    assert cn.labels_in_text("Retro basketball sneakers white 39-44 yards") == [
        str(n) for n in range(39, 45)
    ]
    # a number range with no size word is a price or a year, not sizes
    assert cn.labels_in_text("hoodie 2024-2026 collection") == []
    assert cn.labels_in_text("百搭T恤 均码") == ["One size"]
    assert cn.guess_cut("男士卫衣") == "mens"
    assert cn.guess_cut("Women's wide leg jeans") == "womens"
    assert cn.guess_cut("hoodie") == "unisex"


def test_advice_picks_the_closest_and_admits_it_is_an_estimate():
    a = cn.advise(["S", "M", "L", "XL", "2XL"], "top", "mens", cn.Measurements(178, 95))
    assert a.label == "XL"
    assert "estimate" in a.reason.lower()
    shoes = cn.advise(
        [str(n) for n in range(38, 45)], "shoe", "unisex", cn.Measurements(foot_mm=262)
    )
    assert shoes.label == "42"
    none = cn.advise(["M", "L"], "top", "mens", cn.Measurements())
    assert none.label is None and "measurements" in none.reason


def test_listing_size_guide_only_for_chinese_marketplaces():
    listing = NormalizedListing(
        marketplace_id="taobao",
        external_id="1",
        url="https://example.com/1",
        title="Men's heavyweight hoodie M-XL",
        original_title="男士重磅卫衣 M-XL",
        category=Category.hoodie,
    )
    guide = size_guide(listing)
    assert guide is not None
    assert guide.labels == ["M", "L", "XL"]
    assert (guide.kind, guide.cut) == ("top", "mens")
    assert guide.readings[0].basis == "typical"
    ebay = listing.model_copy(update={"marketplace_id": "ebay"})
    assert size_guide(ebay) is None
    plain = listing.model_copy(update={"title": "hoodie", "original_title": "卫衣"})
    assert size_guide(plain) is None
    assert kind_of(Category.sneakers) == "shoe"
    assert kind_of(Category.jeans) == "bottom"
    assert kind_of(None) == "unknown"


async def test_advice_endpoint(client: AsyncClient):
    res = await client.post(
        "/api/v1/sizes/advice",
        json={
            "labels": ["170/88A", "175/92A", "180/96A"],
            "kind": "top",
            "cut": "mens",
            "measurements": {"height_cm": 176, "chest_cm": 93},
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["suggested"] == "175/92A"
    assert len(body["readings"]) == 3
    assert body["readings"][1]["chest_cm"] == {"min": 90.0, "max": 94.0}
    assert "size chart" in body["disclaimer"]

    bad = await client.post("/api/v1/sizes/advice", json={"labels": []})
    assert bad.status_code == 422
    silly = await client.post(
        "/api/v1/sizes/advice", json={"labels": ["M"], "measurements": {"height_cm": 900}}
    )
    assert silly.status_code == 422
