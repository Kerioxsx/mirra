# Taobao integration

> Researched November 2026. Taobao is Mirra's **priority marketplace**. This page records how
> Mirra gets Taobao data through authorized channels, what's built, what's verified, and what you
> need to do to go live.

## Access paths (authorized only)

| # | Path | What it gives | Who can get it | Status in Mirra |
|---|---|---|---|---|
| 1 | **Taobao affiliate API for overseas publishers**: `taobao.ovs.tbk.material.item.optional` on the Taobao Open Platform (TOP) router | Keyword search over the Taobao + Tmall affiliate catalog; **English titles** (`language=en_US`); site-localized prices (TW, HK, MY, SG, AU, CA, MO, or GLOBAL); shop, rating, annual sales, brand, category, coupons; affiliate deep links to `intl.taobao.com` (commission on purchases). No user authorization needed. Current API ("正式版"), replacing the deprecated `taobao.ovs.tbk.dg.material.optional.upgrade`. | A Taobao affiliate (Alimama, `pub.alimama.com`) publisher with overseas API access, plus a TOP app key/secret and an adzone (promotion slot) id. Exact eligibility rules for overseas publishers aren't published in the docs we could reach, so confirm when applying. | **Built and wired into search.** Live as soon as credentials are set. |
| 2 | **Taobao Global Open Platform**: `open.taobao.global`, gateway `https://api.taobao.global/rest` | Cross-border supply platform for overseas distributors: product details, **image search** (`/product/similar/get`), categories, same-product matching, **dropship purchase orders**, refunds, stock/price-change messages. | Companies. Register a cross-border supply account at `distributor.taobao.global`, a developer account at `open.taobao.global`, then an app of type "Global Supply and Marketing Platform" (reviewed in ~2–3 working days). The manual describes a high bar and a test-traffic requirement before going online. | **Client built and verified** (signing, transport, OAuth). Product endpoints get wired after approval, because their field contracts are only visible in the developer console. |
| 3 | **Affiliate network deep links** (e.g. Involve Asia's "Taobao (Deeplinkable)" CPS offer, Indoleads) | Commission-tracked links to any Taobao item. No product data. | Publishers approved by the network. | Not needed while path 1 provides affiliate links; useful for items found via path 2. |
| 4 | **TaoWorld** (Alibaba International cross-border supply platform for "cross-border sellers and purchasing agents") | Full-chain sourcing for purchasing agents. | Business partnership. | Worth contacting if Mirra adds checkout/consolidation. |

**Rejected:** scraping taobao.com, reverse-engineered "Taobao APIs", and hosted scraper services.
They violate Taobao's terms and the project's rule of authorized access only, and they break without
warning.

## How it works in Mirra

```
"black oversized zip-up hoodie"
  → glossary translation → "拉链连帽卫衣 宽松 黑色"        (brand names pass through unchanged)
  → TOP request, signed (md5 | hmac | hmac-sha256), site from the shopper's ship-to country
  → taobao.ovs.tbk.material.item.optional (language=en_US)
  → mapping: English title (flagged as machine-translated), CNY price, list price, the marketplace's
    promo estimate, localized price, Tmall badge, shop + rating, sales, coupons
  → authenticity rules → brand_direct | unverified | style_alternative | replica_advertised (+ reasons)
  → FX (ECB daily reference rates, incl. CNY) → ≈ price in the shopper's currency
  → landed cost: item + shipping within China (free when tagged 包邮, else unknown)
                 + international shipping (estimated only if MIRRA_FORWARDING_RATE_PER_KG is set)
  → Discover card → "Try on" → approximate garment in the 3D dresser, exact CNY price kept
```

Code: `apps/backend/src/mirra/modules/marketplaces/connectors/taobao/`
(`top.py`, `iop.py`, `ovs.py`, `language.py`, `connector.py`), plus `modules/pricing/` and
`modules/search/`.

### Taobao-specific honesty rules

- **Replicas.** Taobao carries many. Strong terms (高仿, 莆田, 纯原, 公司级, 1:1, "high imitation",
  "Putian"…) mark a listing `replica_advertised` and the card is outlined in red. Weak terms (复刻,
  原单, 原厂, 尾单) need two hits, because 复刻 is also used for official retro releases.
- **Look-alikes.** 同款 / 平替 ("same style", or "same paragraph" in machine translation) become
  `style_alternative`, shown as "Look-alike, not the brand". These are legitimate alternatives,
  never presented as the branded item.
- **Official stores.** Only a Tmall store (`user_type=1`) named "官方旗舰店 / Official Flagship
  Store" becomes `brand_direct`. A Taobao shop using that name gets no upgrade.
- **Prices.** The raw price is the CNY selling price. The coupon estimate (`final_promotion_price`)
  is labelled "marketplace estimate". Converted prices are shown with ≈ and the ECB rate date.
- **Shipping.** 包邮 means free shipping *inside China*. Mirra never presents it as free delivery to
  the buyer. International shipping is unknown unless a forwarding rate is configured, and is
  always labelled an estimate.
- **Condition.** Never assumed. Only 全新 / 二手 in the title set new / used.
- **Affiliate disclosure** is shown under results, and links carry `rel="sponsored"`.

## Verification status

| Item | How it's verified |
|---|---|
| TOP md5 signature | Reproduces the published example signature `F7A5E0B2…` (unit test) |
| Taobao Global HMAC-SHA256 signature | Reproduces the published example `4190D323…` from the development manual (unit test) |
| Response mapping | Fixture following the documented response tree of API 72807 (unit + e2e tests through a mock gateway) |
| Query translation, category/colour detection, authenticity rules, FX, landed cost | Unit tests |
| Full stack (UI → API → connector → mock gateway → UI → dresser) | Playwright e2e |
| **Live Taobao API** | **Not yet. Needs your credentials.** |

The docs we read contain inconsistencies (e.g. a localized-price example with swapped values, and
field tables whose nesting disagrees with the JSON examples). The mapping rejects malformed values
rather than guessing. Expect small adjustments after the first live call.

## Going live — checklist

1. **Taobao affiliate account.** Sign up as a publisher at `pub.alimama.com` (Taobao Union /
   淘宝联盟). Ask for overseas (海外) API access for the `taobao.ovs.tbk.*` APIs, and confirm the
   eligibility rules for your country and entity type.
2. **TOP app.** On the Taobao Open Platform, create an app and request the Taobao affiliate
   (淘宝客) API permissions. Note the **App Key** and **App Secret**.
3. **Adzone.** In `pub.alimama.com` → promotion management → promotion slots (推广管理-推广位管理),
   create a slot. The adzone id is the last number in `mm_xxx_xxx_<adzone_id>`.
4. **Configure the API** (environment, never committed):
   ```
   MIRRA_TAOBAO_APP_KEY=…
   MIRRA_TAOBAO_APP_SECRET=…
   MIRRA_TAOBAO_ADZONE_ID=…
   # optional
   MIRRA_TAOBAO_SIGN_METHOD=md5          # or hmac / hmac-sha256
   MIRRA_TAOBAO_LANGUAGE=en_US           # or zh_CN
   MIRRA_FORWARDING_RATE_PER_KG=12.00    # your forwarder's rate, enables delivered-cost estimates
   MIRRA_FORWARDING_CURRENCY=USD
   ```
5. **First live call.** Search from Discover. Check that the Taobao chip says "N results" and
   compare a few cards against the listings on Taobao. Report any field that looks wrong.
6. **Optional, for image search and checkout:** apply to the Taobao Global Open Platform
   (`distributor.taobao.global` → `open.taobao.global`). Once approved, set
   `MIRRA_TAOBAO_GLOBAL_APP_KEY` / `_APP_SECRET` and the product endpoints get wired.

## Next steps (engineering)

- Chinese size mapping (Chinese sizes run small; 170/88A style codes → S/M/L).
- Taobao Global: `/product/similar/get` for photo search, then `/product/details/query` for SKUs.
- LLM translator behind `translate_query` for queries the glossary doesn't cover.

## Sources

- Overseas affiliate search API (current): <https://jaq-doc.alibaba.com/docs/api.htm?apiId=72807>
- Deprecated predecessor: <https://jaq-doc.alibaba.com/docs/api.htm?apiId=69450>
- Domestic affiliate search API: <https://developer.alibaba.com/docs/api.htm?apiId=64759>
- Taobao Global Open Platform development manual: <https://developer.alibaba.com/docs/doc.htm?treeId=735&articleId=121120&docType=1>
- TOP signature & invocation (affiliate doc, deprecated API but same protocol): <https://developer.alibaba.com/docs/doc.htm?treeId=674&articleId=118934&docType=1>
- Taobao distributor/dropshipping programme overview (third party, 2024): <https://www.howtotao.com/taobao-official-dropshipping/>
- TaoWorld: <https://taoworld.taobao.global/apps/partnership>
- Involve Asia Taobao offer: <https://app.involve.asia/directory/taobao-deeplink-affiliate-program>
- ECB reference rates: <https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html>
