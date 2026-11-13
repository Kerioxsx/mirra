# AI modules & workflows

> Planned for Phases 3–4. This document is the contract the AI agent builds against.

## Principles

1. **Modules, not one prompt.** Each module has typed Pydantic input/output and can be tested alone.
2. **Ground truth comes from the database.** Models propose; code verifies. Any product or listing
   id in model output must exist, and prices, shipping and availability are always read from
   `marketplace_listings`, never from model text.
3. **Structured outputs only.** JSON-schema-constrained responses; anything that fails validation
   is retried once and otherwise dropped, never "repaired" by guessing.
4. **Label estimates.** Fit predictions, colour harmony and similarity scores are shown as
   estimates.
5. **Spend carefully.** Cache image analyses by SHA-256; embed each image once in a background job;
   use small models for parsing and larger ones only for composition; per-user rate limits.

## Modules

| Module | Input | Output |
|---|---|---|
| Fashion Analyst | free text (+ user preferences) | `StyleBrief`: aesthetics, budget, occasion, must-haves, avoid-list, sizes |
| Visual Search | image (upload id) | `GarmentDetection[]`: bbox, category, colours, pattern, material look, silhouette, fit, logo guess (with confidence), embedding |
| Product Research | `StyleBrief` or `GarmentDetection` | `CandidateListing[]` (ids only, from connectors + local catalog) |
| Price Comparison | product/listing id | ranked `Offer[]` with total cost (price + known shipping), similarity, seller reliability, condition, authenticity flag |
| Outfit Designer | brief + owned items + candidates | `OutfitProposal[]`: items by slot, rationale per item, colour/style scores |
| Wardrobe Assistant | user id | owned items by slot, gaps, "complete my wardrobe" suggestions ranked by new combinations unlocked |
| Fit & Size | product + user sizes | size recommendation with confidence and the evidence used |

## Workflow A — image → products

```
upload (validate type/size, strip EXIF, store privately)
  → Visual Search: detect garments, crop, describe, embed (cached by hash)
  → per garment: vector search in product_embeddings  ∪  connector image search (eBay search_by_image)
  → merge + re-rank: 0.6 visual similarity + 0.2 attribute match + 0.2 user preference
  → user picks a mode: closest / exact / cheapest / same brand / same aesthetic / colour / silhouette
```

## Workflow B — outfit generation

```
request text → Fashion Analyst → StyleBrief
  → Wardrobe Assistant: owned items per slot
  → missing slots → Product Research (budget-aware)
  → Outfit Designer: N proposals, scored
  → validate every id; compute totals from listings (unknown prices flagged, not zeroed)
  → return proposals → web loads one into outfit-engine → dresser renders it
```

## Workflow C — deal finder

```
product → attributes (brand, mpn/gtin, category, colours, embedding)
  → exact matches by gtin/mpn/canonical_key across connectors
  → near matches by embedding + attributes
  → rank by total cost, similarity, seller reliability, reviews, condition, availability
  → label each: brand-direct · authenticated · secondhand · alternative · listed-as-replica
```

## Replica detection

Rule-based first (title/description terms such as "replica", "rep", "1:1", "UA", "inspired"; price
far below market for the exact product; seller signals), with a classifier later. A listing can be
*downgraded* to `replica_advertised` by rules; it is never *upgraded* to `authenticated` by a model —
only by a marketplace authentication programme or brand-direct source.

## Evaluation

- Visual search: top-5 precision on a labelled set of ≥ 300 outfit photos.
- Stylist: golden prompts with assertions (budget respected, all ids valid, owned items used first,
  no fabricated fields).
- Replica rules: precision/recall on a hand-labelled listing sample.
