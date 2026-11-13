import json
from decimal import Decimal
from pathlib import Path

import httpx

from mirra.core.taxonomy import Authenticity, Category, ListingCondition
from mirra.modules.marketplaces.base import ConnectorQuery
from mirra.modules.marketplaces.connectors.taobao.connector import TaobaoConnector
from mirra.modules.marketplaces.connectors.taobao.ovs import map_response, site_for, unwrap_list
from mirra.modules.marketplaces.connectors.taobao.top import TopClient
from mirra.modules.pricing.fx import StaticFxProvider
from tests.helpers import FIXED_RATES

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/taobao_ovs_material_item_optional.json").read_text()
)
BODY = FIXTURE["ovs_tbk_material_item_optional_response"]


def test_maps_documented_fields() -> None:
    listings, total, has_next = map_response(BODY, language="en_US")
    assert total == 1234 and has_next is True
    assert [item.external_id for item in listings] == [
        "TEST-tmall-flagship-0001",
        "TEST-taobao-alt-0002",
        "TEST-replica-0003",
    ]

    hoodie = listings[0]
    assert hoodie.marketplace_id == "taobao"
    assert hoodie.url == "https://intl.taobao.com/dp?h5Url=test-0001"
    assert hoodie.category is Category.zip_up
    assert hoodie.colors == ["black"]
    assert hoodie.price.amount == Decimal("239.00") and hoodie.price.currency == "CNY"
    assert hoodie.list_price.amount == Decimal("299.00")
    assert hoodie.estimated_final_price.amount == Decimal("219.00")
    assert hoodie.localized_price.currency == "HKD" and hoodie.localized_price.amount == Decimal(
        "259.50"
    )
    assert hoodie.image_urls == [
        "https://img.example.com/test/hoodie.jpg",
        "https://img.example.com/test/hoodie-white.jpg",
        "https://img.example.com/test/hoodie-2.jpg",
    ]
    assert hoodie.store_badge == "Tmall"
    assert hoodie.authenticity is Authenticity.brand_direct
    assert "official flagship store" in hoodie.authenticity_reasons[0]
    assert hoodie.seller.rating == Decimal("4.84") and hoodie.seller.country == "CN"
    assert hoodie.sales_label == "12,000+ sold in the last year"
    assert hoodie.shipping.cost.amount == 0  # 包邮 = free shipping inside China, not to the buyer
    assert hoodie.ships_from_country == "CN"
    assert "满200元减20元" in hoodie.promotion_tags
    assert hoodie.title_machine_translated is True
    assert hoodie.condition is ListingCondition.unknown  # never assumed


def test_labels_alternatives_and_replicas() -> None:
    listings, _, _ = map_response(BODY, language="en_US")
    vest, sneaker = listings[1], listings[2]
    assert vest.authenticity is Authenticity.style_alternative
    assert vest.category is Category.vest
    assert vest.url.startswith("https://intl.taobao.com")  # protocol-relative link fixed
    assert vest.shipping.cost is None  # no free-shipping tag → unknown, not zero
    assert sneaker.authenticity is Authenticity.replica_advertised
    assert sneaker.category is Category.sneakers
    assert sneaker.list_price is None and sneaker.estimated_final_price is None


def test_rejects_malformed_localized_price() -> None:
    raw = json.loads(json.dumps(BODY))
    item = raw["result_list"]["material_item_summary_info"][0]
    # the API docs show an example with these values swapped — it must not become a price
    item["price_promotion_info"]["zk_final_localized_price"] = {
        "formatted_price": "HK$",
        "formatted_price_number": "HKD",
        "currency_symbol": "600",
        "currency_code": "0.80",
    }
    listings, _, _ = map_response(raw, language="en_US")
    assert listings[0].localized_price is None


def test_unwrap_list_shapes_and_sites() -> None:
    assert unwrap_list({"string": ["a", "b"]}) == ["a", "b"]
    assert unwrap_list(["a"]) == ["a"]
    assert unwrap_list(None) == []
    assert site_for("hk") == "HK" and site_for("US") == "GLOBAL" and site_for(None) == "GLOBAL"


async def test_connector_translates_query_and_converts_price_filters() -> None:
    sent: dict[str, str] = {}

    def handler(req: httpx.Request) -> httpx.Response:
        sent.update(dict(httpx.QueryParams(req.content.decode())))
        return httpx.Response(200, json=FIXTURE)

    client = TopClient(
        app_key="k", app_secret="s", http=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    conn = TaobaoConnector(client=client, adzone_id="12345678", fx=StaticFxProvider(FIXED_RATES))
    page = await conn.search_products(
        ConnectorQuery(
            text="black oversized zip-up hoodie",
            currency="USD",
            price_max=Decimal("50"),
            ship_to_country="SG",
            sort="price_asc",
            limit=20,
            offset=20,
        )
    )
    assert sent["method"] == "taobao.ovs.tbk.material.item.optional"
    assert sent["adzone_id"] == "12345678" and sent["site"] == "SG" and sent["language"] == "en_US"
    assert sent["q"] == page.query_sent == "拉链连帽卫衣 宽松 黑色"
    assert sent["sort"] == "final_promotion_price:asc"
    assert sent["page_no"] == "2" and sent["page_size"] == "20"
    assert sent["end_price"] == "361"  # 50 USD → CNY at the fixture rate (7.2222…), rounded
    assert "start_price" not in sent
    assert page.next_offset == 40 and len(page.listings) == 3
