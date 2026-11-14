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
- [x] Testing infrastructure: pytest, Vitest, Playwright e2e, cargo
- [x] CI workflow (backend, frontend, e2e, desktop) — *written; first run happens on GitHub*
- [x] **Ahead of plan:** 3D dresser spike — R3F studio, procedural mannequin with body/appearance
      controls, parametric garments for all 34 categories with layering, conflicts, recolour,
      undo/redo, camera presets, quality tiers, local persistence

## Phase 2 — Shopping engine (weeks 3–5) · **in progress (Taobao first)**

- [x] **Taobao connector**: overseas affiliate API (`taobao.ovs.tbk.material.item.optional`), TOP
      signing verified against the published vector, documented response mapping, English titles,
      Tmall detection, coupons, sales; EN→ZH fashion query translation; site from ship-to country
- [x] **Taobao Global Open Platform client** (IOP signing verified, OAuth token create/refresh);
      product endpoints wired after distributor approval
- [x] Authenticity rules (English, Chinese and machine-translated vocabulary; official Tmall flagship
      stores; "same style" look-alikes as a separate label, migration 0002)
- [x] FX from ECB daily reference rates; landed-cost estimates (unknowns stay unknown)
- [x] Demo connector (clearly labelled sample catalog, disabled in production)
- [x] Search service: parallel fan-out with timeouts, partial results, per-marketplace status,
      price sort that never ranks unknown prices as cheapest, search history for signed-in users
- [x] `GET /api/v1/search`
- [x] Discover UI: search, sort, currency, max price, result cards (attribution, seller, rating,
      converted price, delivered-cost breakdown, authenticity reasons), affiliate disclosure
- [x] "Try on" from a result → approximate garment in the dresser with the exact original price,
      persisted on the device
- [ ] **Live Taobao verification**: needs affiliate credentials (see taobao.md checklist)
- [ ] Chinese size mapping
- [ ] eBay Browse connector
- [x] Persist listings (own seller, price, shipping, URL, full record) + price history; 24 h
      freshness window
- [x] Connector result cache (Redis, or in-process) so repeat searches don't hit provider limits
- [x] Listing page: gallery, delivered-cost breakdown, observed price history, save, try on
- [x] Deal finder (Workflow C): similar & cheaper across live marketplaces, match-score estimates,
      savings, replicas excluded
- [x] Saved products; shopping events (views, click-outs) → Shopping History page, deletable
- [x] **KakoBuy purchasing agent**: verified item-link format, offline link parser (Taobao, Tmall,
      Weidian, 1688, KakoBuy, deep links), delivered cost via KakoBuy from its published fees,
      replica listings refused, paste-a-link in Discover. See purchase-agents.md
- [ ] Exact-product offers by GTIN/MPN (when a connector provides identifiers)

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
- [x] Outfits API + account-synced saved outfits (save from the dresser, reopen, rename, delete)
- [ ] Avatar persistence to the account

## Phase 6 — Digital wardrobe (weeks 14–15)

- [ ] Wardrobe CRUD, uploads, link import, auto-categorisation
- [ ] "Complete my wardrobe"

## Phase 7 — Advanced (weeks 16–18)

- [ ] Etsy, Amazon Creators API, affiliate feed ingestion
- [ ] Price history charts, outfit sharing, personalised recommendations, rendering upgrades

## Phase 8 — Testing & release (weeks 19–20)

- [ ] Security review, load tests, performance budgets, code signing, production deployment
