# Buying through purchasing agents (KakoBuy)

> Researched on KakoBuy's own site, 2026-11-15. Agent terms change, so re-check them before
> relying on the fee figures below.

Purchasing agents buy items from Chinese marketplaces for overseas shoppers. They receive the item
at a warehouse in China, offer QC photos, and ship internationally. Mirra supports **KakoBuy** as a
way to buy listings from Taobao, Tmall, Weidian and 1688.

## How the integration works

KakoBuy has no public API. Its item pages are created from a marketplace link:

```
https://www.kakobuy.com/item/details?url=<URL-encoded marketplace item link>
```

This format was verified against KakoBuy's site. Loading it redirects to
`item2.kakobuy.com/item/details` and shows the item for that link; unknown paths go to the home
page. Mirra builds these links and never scrapes KakoBuy.

| Piece | What it does |
|---|---|
| `modules/agents/links.py` | Recognises Taobao, Tmall, Weidian and 1688 item links (desktop and mobile forms), unwraps KakoBuy item pages and deep links that carry the original (`?url=`, `?h5Url=`), and pulls a link out of share text. **No network calls.** Short links (`m.tb.cn`…) are rejected with a hint to paste the full link. |
| `modules/agents/kakobuy.py` | Builds the KakoBuy link (with an optional referral code), estimates delivered cost via KakoBuy, and decides when the route is unavailable. |
| `POST /api/v1/links/resolve` | Pasted link → source, item id, canonical link, KakoBuy route, and the stored Mirra listing if search already found the same item. |
| `GET /api/v1/listings/{id}` → `purchase_routes` | The KakoBuy route for listings from Chinese marketplaces. |

### Delivered cost via KakoBuy

Based on KakoBuy's "How does shopping agent service charge?" help page:

- "kakobuy promise for free shopping agent service … kakobuy require no handling fees", so the
  service fee line is **0**.
- Total = item cost (product + shipping to KakoBuy's warehouse) + international shipping + customs
  charges.
- Customs declaration: "generally RMB 8.00 (Depending on the shipping method)". Shown as an
  estimate.
- International shipping depends on weight, shipping line and destination. It stays **unknown**
  unless the operator sets `MIRRA_FORWARDING_RATE_PER_KG`, and is then shown as an estimate.

Without exchange rates, the breakdown is shown in the listing's own currency (exact) rather than
not at all.

### When KakoBuy is not offered

| Case | Behaviour |
|---|---|
| Listing advertises itself as a replica | **Refused.** KakoBuy's Anti-Counterfeiting Policy says "The purchase of counterfeit products is strictly prohibited" and warns of declined orders, suspended accounts and withheld funds. Mirra never routes these listings, which also protects the shopper. |
| No original item link (e.g. Taobao affiliate results whose deep link doesn't contain it) | Unavailable, with instructions to copy the item link from the marketplace and paste it into Discover. Mirra never reconstructs links from encrypted affiliate item ids. |
| Demo listing | Unavailable. |
| Not from a Chinese marketplace | No route shown. |

QC photos are described as showing condition, **not authenticity**.

## Configuration

```
MIRRA_KAKOBUY_ENABLED=true
MIRRA_KAKOBUY_LINK_TEMPLATE=https://www.kakobuy.com/item/details?url={url}
MIRRA_KAKOBUY_REFERRAL_CODE=            # from your KakoBuy affiliate ("Distribution") account
MIRRA_KAKOBUY_REFERRAL_PARAM=affcode    # confirm the parameter name in that account
MIRRA_KAKOBUY_SERVICE_FEE_PERCENT=0
MIRRA_KAKOBUY_DECLARATION_FEE_CNY=8.00
MIRRA_KAKOBUY_TERMS_CHECKED=2026-11-15
```

KakoBuy's help centre has a "Distribution" section (its affiliate programme), but its entries
didn't render for us. The referral parameter name is therefore **unverified**; confirm it in
your KakoBuy affiliate dashboard before relying on referral credit.

## Open items

- Confirm the referral parameter and affiliate terms with KakoBuy.
- Whether live Taobao affiliate deep links carry the original item link (enabling one-tap KakoBuy
  from search results) can only be checked with real credentials.
- Other agents can be added as further routes behind the same `PurchaseRoute` contract.

## Sources

- KakoBuy, Services & Fees: <https://www.kakobuy.com/service/help/question?id=63>
- KakoBuy, Anti-Counterfeiting Policy: <https://www.kakobuy.com/service/help/question?id=125&cid=35>
- KakoBuy home (supported platforms): <https://www.kakobuy.com/>
- Context on agent enforcement (Pandabuy raid, 2024): <https://www.worldtrademarkreview.com/article/exclusive-pandabuy-raided-chinese-shopping-agent-faces-criminal-action-multiple-rights-holders>
