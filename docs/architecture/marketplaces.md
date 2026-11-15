# Marketplace access — what is realistically available

> Researched November 2026. Policies change; re-verify before building each
> connector and record the date you checked. Nothing here is legal advice —
> read each marketplace's API/affiliate terms before shipping a connector.

## Ground rules

1. Only authorized access: official APIs, affiliate/product feeds, signed
   partnerships. **No scraping** of sites whose terms forbid it, no use of
   undocumented internal endpoints (for example, search keys embedded in a
   site's page config).
2. Each connector declares its capabilities. The search engine works with
   whatever subset is available and never invents missing fields.
3. Respect data-freshness and caching rules in each provider's terms
   (`marketplace_listings.expires_at` exists for this).
4. Outbound links use the provider's affiliate program when one exists, and
   disclose that to users.

## Assessment

| Marketplace | Access path | Self-serve? | Fashion fit | Verdict |
|---|---|---|---|---|
| **eBay** | Buy **Browse API** (`item_summary/search`, `search_by_image`, `item/{id}`), OAuth client-credentials app token. eBay Partner Network for affiliate links. | **Yes** — free developer account; production keys after a short review; default call limits are enough for an MVP. | Huge new + secondhand clothing inventory, item aspects (brand, size, colour), condition, seller feedback, shipping cost. | **Built** (`connectors/ebay/`): keyword and image search in Clothing, Shoes & Accessories (category 11450), price, condition, seller feedback, shipping cost and delivery dates for the shopper's country, eBay Partner Network links when a campaign id is set, and the Authenticity Guarantee as a label. Live once `MIRRA_EBAY_CLIENT_ID` / `MIRRA_EBAY_CLIENT_SECRET` are set. Verified against a fixture written to the documented response shape, not yet against the live API. Image search is labelled experimental by eBay. |
| **Etsy** | Open API v3 (API key + OAuth). | Yes, app review required for commercial use. | Strong for vintage and independent makers. | **Strong second candidate.** |
| **Amazon** | **Creators API** (PA-API 5.0 has been retired). Needs an Associates account with qualifying sales; new credentials are issued inside Associates Central. | Partially — gated on affiliate sales history. | Broad catalogue, reviews. | Phase 7, once there is affiliate traffic. |
| **ASOS / Nike / Adidas / large retailers** | **Affiliate network product feeds** (Awin, CJ, Rakuten Advertising, Impact — which network depends on brand and region). Feeds are CSV/XML/JSON, refreshed daily. | Yes, but each advertiser approves the publisher individually. | Brand-direct new products, authentic by construction. | Build one generic **`affiliate_feed` connector** that ingests feeds into our own catalogue; search runs locally. |
| **Independent stores (Shopify etc.)** | Per-store Storefront API tokens or the store's own affiliate feed, with permission. | Per store. | Long tail of independent labels. | Via `affiliate_feed` or per-store partnerships. Don't crawl. |
| **Depop** | **Selling API** — an enterprise partner API for managing a seller's own listings/orders. Invite-only (`developers@depop.com`). Not a buyer-side search API. | No. | Excellent for Gen-Z secondhand. | **Blocked** — requires a partnership. Apply early; no connector until a buyer-side agreement exists. |
| **Grailed** | No official public API. Third-party scraper services exist; they are unaffiliated and likely conflict with Grailed's terms. | No. | Excellent for designer/streetwear resale. | **Blocked** — partnership only. |
| **Taobao / Tmall** | **Overseas Taobao affiliate API** (`taobao.ovs.tbk.material.item.optional`): keyword search, English titles, localized prices, affiliate links. **Taobao Global Open Platform** for distributors: image search, details, dropship orders. | Affiliate: publisher approval at pub.alimama.com. Global: company approval. | Massive, very price-competitive, Japanese/Chinese streetwear. | **Priority, connector built.** See [taobao.md](taobao.md). |
| **Google Shopping** | No public shopping-search API for third parties (the Content API is for merchants managing their own products). Third-party SERP APIs exist; their terms vary. | — | — | Don't depend on it. |

## Plan

0. **Now:** Taobao connector (overseas affiliate API) is built and wired into search;
   live once credentials are configured. See [taobao.md](taobao.md).
1. **Phase 2:** `ebay` connector: search and image search are built (live with keys); item
   details and sizes from aspects come next. Plus a `demo` connector that serves a
   small, clearly labelled sample catalogue so development and tests run
   without credentials. The demo connector is disabled in production.
2. **Phase 2/3:** `affiliate_feed` connector framework (ingest → normalize →
   upsert products and listings → embed images). Apply to Awin/CJ/Rakuten as a
   publisher early, because approval takes weeks.
3. **Phase 7:** Etsy, Amazon Creators API. Depop/Grailed only with signed agreements.

## Connector contract

Defined in `apps/backend/src/mirra/modules/marketplaces/base.py`:

```
get_capabilities() -> ConnectorCapabilities
search_products(query: ConnectorQuery) -> ConnectorSearchPage
get_product(external_id) -> NormalizedListing | None
get_seller(external_id) -> NormalizedSeller | None
get_product_images(external_id) -> list[str]
get_available_sizes(external_id) -> list[str] | None
get_price(external_id) -> Money | None
get_shipping(external_id, ship_to) -> ShippingQuote | None
check_availability(external_id) -> Availability
```

A connector raises `CapabilityNotSupported` for anything it can't do; the
search engine catches it and degrades. `None` means "unknown", never "zero".

## Sources

- Amazon PA-API 5.0 deprecation notice: <https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation>
- eBay Browse API overview: <https://developer.ebay.com/api-docs/buy/browse/static/overview.html>
- eBay `search_by_image`: <https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/searchByImage>
- Depop Partner API docs: <https://partnerapi.depop.com/api-docs/>
- Grailed (no public API) — API Evangelist profile: <https://providers.apievangelist.com/providers/grailed/>
- Taobao API access notes (third party): <https://otcommerce.com/how-to-start-working-with-taobao-api/>
