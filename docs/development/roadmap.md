# Roadmap & status

Estimates are for a focused team and are planning figures, not deadlines. A box is ticked only when
the feature is implemented **and** covered by passing tests.

## Phase 1 — Foundation (weeks 1–2) · **done**

- [x] Monorepo (pnpm workspaces + uv), shared TS config, ESLint, Prettier, EditorConfig
- [x] FastAPI backend: config, error envelope, security headers, CORS, health/readiness
- [x] PostgreSQL + pgvector schema for the whole domain (20 tables), reversible Alembic migration
- [x] Authentication: register, login, refresh rotation with reuse detection, logout, rate limiting,
      argon2id, web cookie + desktop keychain transports
- [x] Users: profile, style preferences, account deletion
- [x] Marketplace connector contract, registry and honest marketplace catalog endpoint
- [x] Generated API contracts (OpenAPI → TypeScript, taxonomy) with drift check
- [x] Next.js 16 static-export web app: navigation for all 8 sections, auth pages, settings
- [x] Tauri 2 desktop shell using the same build; keychain commands with key allow-list; CSP
- [x] Design system (`@mirra/ui`)
- [x] Testing infrastructure: pytest (25), Vitest (29), Playwright e2e (11), cargo (2)
- [x] CI workflow (backend, frontend, e2e, desktop) — *written; first run happens on GitHub*
- [x] **Ahead of plan:** 3D dresser spike — R3F studio, procedural mannequin with body/appearance
      controls, parametric garments for all 34 categories with layering, conflicts, recolour,
      undo/redo, camera presets, quality tiers, local persistence

## Phase 2 — Shopping engine (weeks 3–5) · next

- [ ] eBay Browse connector (OAuth client credentials, search, item, seller, aspects → sizes/colours,
      shipping, condition mapping) with recorded-fixture tests
- [ ] Demo connector (clearly labelled sample catalog, disabled in production)
- [ ] Search service: query parsing, fan-out with timeouts, normalization, upsert of products and
      listings, caching in Redis, search history
- [ ] `/search`, `/products/{id}`, `/products/{id}/offers` endpoints
- [ ] Discover UI: results grid, filters, sorting, product detail, marketplace attribution, link-out
      tracking (shopping events)
- [ ] Price comparison (exact match by GTIN/MPN/canonical key) and replica rules
- [ ] "Try on" from a product → approximate garment in the dresser
- [ ] Apply to affiliate networks (lead time)

## Phase 3 — Visual AI (weeks 6–7)

- [ ] Private uploads (S3), EXIF stripping, user deletion
- [ ] Garment detection + attribute extraction (vision model)
- [ ] Embedding pipeline (Celery worker) + HNSW search
- [ ] Image and outfit search modes in Discover

## Phase 4 — AI stylist (weeks 8–9)

- [ ] Fashion Analyst, Product Research, Outfit Designer modules with structured outputs
- [ ] Id validation layer + golden-prompt tests
- [ ] Stylist chat UI; load proposals into the dresser

## Phase 5 — 3D dresser (weeks 10–13)

- [ ] Blender base avatar `mirra-base@1` (rig + shape keys) replacing the procedural mannequin
- [ ] Curated GLB library (~20 garments), manifest validation in CI, KTX2/meshopt pipeline
- [ ] GLB loader with skeleton re-binding and LRU cache
- [ ] Outfits API + account-synced saved outfits; avatar persistence

## Phase 6 — Digital wardrobe (weeks 14–15)

- [ ] Wardrobe CRUD, uploads, link import, auto-categorisation
- [ ] "Complete my wardrobe"

## Phase 7 — Advanced (weeks 16–18)

- [ ] Etsy, Amazon Creators API, affiliate feed ingestion
- [ ] Price history charts, outfit sharing, personalised recommendations, rendering upgrades

## Phase 8 — Testing & release (weeks 19–20)

- [ ] Security review, load tests, performance budgets, code signing, production deployment
