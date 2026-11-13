from datetime import date
from decimal import Decimal

from mirra.core.taxonomy import Authenticity, Category
from mirra.modules.marketplaces.base import Money
from mirra.modules.marketplaces.connectors.taobao.language import (
    detect_category,
    detect_colors,
    translate_query,
)
from mirra.modules.pricing.authenticity import classify
from mirra.modules.pricing.fx import parse_ecb_xml
from mirra.modules.pricing.landed_cost import ForwardingRate, estimate_landed_cost
from tests.helpers import FIXED_RATES


def test_translate_query() -> None:
    t = translate_query("Find me an oversized vintage jacket that matches black baggy jeans")
    assert t.translated
    assert set(t.query.split()) == {"宽松", "复古", "夹克", "黑色", "宽松牛仔裤"}
    brand = translate_query("Carhartt cargo pants")
    assert brand.query == "Carhartt 工装裤" and brand.passthrough == ["carhartt"]
    assert translate_query("连帽卫衣 黑色").query == "连帽卫衣 黑色"  # Chinese passes through
    assert translate_query("t-shirt").query == "T恤"  # not 衬衫 from "shirt"
    assert translate_query("women's tee").query == "女 T恤" or set(
        translate_query("women's tee").query.split()
    ) == {"女", "T恤"}


def test_detect_category_avoids_substring_traps() -> None:
    assert detect_category("连帽卫衣 男款") is Category.hoodie
    assert detect_category("连帽外套 冬季") is Category.jacket  # 连帽 contains 帽, not a hat
    assert detect_category("纯棉T恤 包邮") is Category.t_shirt  # 包邮 (free shipping) is not a bag
    assert detect_category("Graphic T-shirt") is Category.t_shirt
    assert detect_category("Oxford shirt") is Category.shirt
    assert detect_category("Sweatshirt") is Category.sweatshirt
    assert detect_category(None, "斜挎包 尼龙") is Category.bag
    assert detect_category("毛线帽") is Category.beanie
    assert detect_category("something else") is None


def test_detect_colors_prefers_specific_shades() -> None:
    assert detect_colors("米白色 宽松卫衣 黑色logo") == ["cream", "black"]
    assert detect_colors("Navy and white stripe") == ["navy", "white"]


def test_authenticity_rules() -> None:
    assert classify("纯原 高仿 球鞋").value is Authenticity.replica_advertised
    assert (
        classify("AJ1 复刻 篮球鞋").value is Authenticity.unverified
    )  # 复刻 alone = retro re-release
    assert classify("复刻 原单 球鞋").value is Authenticity.replica_advertised  # two weak signals
    official = classify(
        "Air Jordan 1 复刻", shop_name="Nike官方旗舰店", is_brand_platform_store=True
    )
    assert official.value is Authenticity.brand_direct
    # an "official"-named shop that isn't a vetted platform store gets no upgrade
    assert (
        classify("卫衣", shop_name="Nike官方旗舰店", is_brand_platform_store=False).value
        is Authenticity.unverified
    )
    alt = classify("Arc同款 冲锋衣")
    assert alt.value is Authenticity.style_alternative and "look-alike" in alt.reasons[0]
    assert classify("rep 1:1 sneakers").value is Authenticity.replica_advertised
    assert classify("Represent hoodie").value is Authenticity.unverified  # 'rep' only as a word


ECB = """<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube><Cube time='2026-11-12'><Cube currency='USD' rate='1.0800'/><Cube currency='CNY' rate='7.8000'/></Cube></Cube>
</gesmes:Envelope>"""


def test_parse_ecb_and_cross_rates() -> None:
    rates = parse_ecb_xml(ECB)
    assert rates.as_of == date(2026, 11, 12)
    usd = rates.convert(Money(amount=Decimal("78.00"), currency="CNY"), "USD")
    assert usd == Money(amount=Decimal("10.80"), currency="USD")
    assert rates.convert(Money(amount=Decimal(1), currency="CNY"), "XYZ") is None


def test_landed_cost_estimates_and_unknowns() -> None:
    price = Money(amount=Decimal("239.00"), currency="CNY")
    without = estimate_landed_cost(
        price=price,
        target_currency="USD",
        fx=FIXED_RATES,
        domestic_shipping=Money(amount=Decimal(0), currency="CNY"),
        domestic_shipping_label="Shipping within China",
        category=Category.hoodie,
        cross_border=True,
        forwarding=None,
    )
    assert without is not None and not without.complete
    assert without.components[0].amount == Money(amount=Decimal("33.09"), currency="USD")
    assert without.components[2].amount is None and "forwarder" in (
        without.components[2].note or ""
    )
    assert without.total_known == Money(amount=Decimal("33.09"), currency="USD")

    with_fwd = estimate_landed_cost(
        price=price,
        target_currency="USD",
        fx=FIXED_RATES,
        domestic_shipping=Money(amount=Decimal(0), currency="CNY"),
        domestic_shipping_label="Shipping within China",
        category=Category.hoodie,
        cross_border=True,
        forwarding=ForwardingRate(per_kg=Money(amount=Decimal("12"), currency="USD")),
    )
    assert with_fwd is not None and with_fwd.complete
    assert with_fwd.components[2].amount == Money(
        amount=Decimal("9.60"), currency="USD"
    )  # 0.8 kg × 12
    assert with_fwd.components[2].estimate is True
    assert with_fwd.total_known == Money(amount=Decimal("42.69"), currency="USD")

    # no FX rates → a foreign price can't be expressed, so no fake total
    assert (
        estimate_landed_cost(
            price=price,
            target_currency="USD",
            fx=None,
            domestic_shipping=None,
            domestic_shipping_label="Shipping",
            category=None,
            cross_border=True,
            forwarding=None,
        )
        is None
    )
