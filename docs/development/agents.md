# Agent organization & task breakdown

Mirra is built by a lead architect and specialised coding agents. Every agent reads
`docs/architecture/overview.md`, this file, and `conventions.md` before starting.

## Ownership map

| Agent | Owns (may edit freely) | Coordinates with |
|---|---|---|
| **Lead Architect** | `docs/**`, root config, `packages/shared-types`, `scripts/`, `.github/`, cross-module interfaces (`modules/marketplaces/base.py`, `core/taxonomy.py`, `core/contracts.py`) | everyone — reviews every integration before merge |
| **Frontend** | `apps/web/src/{app,components,features/!(dresser)}`, `packages/ui`, `packages/api-client` | Lead (API contracts), 3D (dresser UI) |
| **3D** | `packages/dresser-engine`, `packages/garment-system`, `packages/outfit-engine`, `apps/web/src/features/dresser`, `assets/**` | Frontend, Performance |
| **Backend** | `apps/backend/src/mirra/{core,db}`, modules `auth`, `users`, `avatars`, `wardrobe`, `outfits`, `garments`, `shopping`, `uploads`, `migrations/` | Lead, Security |
| **AI** | modules `visual_search`, `stylist`, `recommendations` | Backend, Search |
| **Search** | modules `marketplaces/connectors/**`, `search`, `pricing`, `products` | Backend, AI |
| **QA** | `apps/backend/tests`, `apps/web/e2e`, `*.test.ts` | everyone |
| **Security** | auth/session code reviews, CSP, `apps/desktop/src-tauri/src/secure_store.rs`, dependency audits | Backend, Frontend |
| **Performance** | render quality tiers, asset budgets, caching, query plans | 3D, Backend |

## Rules

1. Respect ownership. To change another agent's files, open a coordination note (PR comment or
   issue) and get the owner's or Lead's agreement.
2. Don't duplicate modules — search first (`packages/*`, `modules/*`).
3. Any change to an API schema: update the backend, run `pnpm gen:api`, commit generated files, and
   update `docs/api/README.md`.
4. Every change ships tests. Report incomplete work explicitly in the PR.
5. The Lead reviews and merges integrations.

## Task breakdown — Phase 2

| # | Task | Agent | Depends on | Done when |
|---|---|---|---|---|
| 2.1 | eBay OAuth token client (client-credentials, caching, refresh) | Search | — | unit tests with mocked token endpoint |
| 2.2 | eBay connector: `search_products`, `get_product`, `get_seller`, sizes/colours from aspects, shipping, condition/authenticity mapping | Search | 2.1 | recorded-fixture tests for each method |
| 2.3 | Demo connector + fixture catalog, labelled `demo`, prod-disabled | Search | — | tests; refuses to load in production |
| 2.4 | Listing/product upsert + canonical-key matching + price history | Backend | — | pytest with real Postgres |
| 2.5 | Search service: parse → fan-out (timeouts, partial results) → normalize → rank → cache | Search | 2.2–2.4 | pytest incl. one connector failing |
| 2.6 | `/search`, `/products/{id}`, `/products/{id}/offers`, search history, shopping events | Backend | 2.5 | API tests + regenerated types |
| 2.7 | Replica keyword rules + authenticity labelling | Search | 2.2 | precision tests on labelled titles |
| 2.8 | Discover UI: search bar, filters, sort, results grid, product page, attribution, link-out | Frontend | 2.6 | Playwright with demo connector |
| 2.9 | "Try on" → `approximateGarment` in the dresser; product price in outfit totals | 3D + Frontend | 2.8 | e2e: search → try on → total shows price |
| 2.10 | Redis caching, connector rate limits | Performance | 2.5 | load test notes |
| 2.11 | Security review of outbound connectors and stored listing data | Security | 2.2 | review notes, no secrets in logs |

## Task breakdown — Phases 3–6 (summary)

- **AI:** detection + attribute extraction (3.x), embeddings worker (3.x), stylist modules (4.x),
  wardrobe recommendations (6.x).
- **3D:** base avatar + rig (5.1), GLB pipeline + manifest CI (5.2), loader/re-binding/cache (5.3),
  curated library (5.4).
- **Backend:** uploads (3.1), outfits API (5.5), avatars API (5.6), wardrobe API (6.1).
- **Frontend:** visual search UI (3.x), stylist chat (4.x), saved outfits (5.x), wardrobe (6.x).
- **QA:** golden-prompt suite (4.x), visual-search eval set (3.x), regression suite per phase.
