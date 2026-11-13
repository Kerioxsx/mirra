# Mirra — Technical Architecture

> Status: living document. Last revised at the start of Phase 1.
> Owner: Lead Architect. Every agent reads this before touching code.

Mirra is an AI fashion ecosystem: a 3D virtual dressing room, an AI stylist, a
universal clothing search engine, price comparison, and a personal digital
wardrobe, on web and desktop from one codebase.

## 1. System map

```
                       ┌──────────────────────────────────────────────┐
                       │                apps/web (Next.js)             │
                       │  static export · React 19 · Tailwind · R3F    │
                       │                                                │
   Browser ───────────▶│  routes: home, discover, dresser, stylist,     │
                       │  wardrobe, outfits, history, settings          │
   Tauri 2 webview ───▶│                                                │
   (apps/desktop)      │  packages: ui · api-client · shared-types ·    │
                       │  dresser-engine · garment-system · outfit-engine│
                       └───────────────┬──────────────────────────────┘
                                       │ HTTPS · JSON · OpenAPI-typed
                                       ▼
                       ┌──────────────────────────────────────────────┐
                       │           apps/backend (FastAPI)              │
                       │                                                │
                       │  auth · users · avatars · products · search ·  │
                       │  marketplaces(connectors) · pricing ·          │
                       │  wardrobe · outfits · garments · stylist ·     │
                       │  visual_search · recommendations · shopping    │
                       └──────┬───────────┬───────────┬────────────────┘
                              │           │           │
                  ┌───────────▼──┐  ┌─────▼────┐  ┌───▼──────────────┐
                  │ PostgreSQL 16 │  │  Redis   │  │ S3-compatible    │
                  │ + pgvector    │  │ cache,   │  │ object storage   │
                  │ (+ citext)    │  │ limits,  │  │ (uploads, GLBs,  │
                  │               │  │ queue    │  │  thumbnails)     │
                  └───────────────┘  └──────────┘  └──────────────────┘
                              ▲
                              │ background workers (Celery, Phase 3+)
                              │ image analysis · embeddings · price refresh
                  ┌───────────┴──────────────────────────────────────┐
                  │ External: marketplace APIs (eBay first), vision   │
                  │ + language models, embedding model                │
                  └──────────────────────────────────────────────────┘
```

## 2. Key decisions (summary — full records in `docs/adr/`)

| # | Decision | Why |
|---|----------|-----|
| ADR-001 | **One Next.js app, built as a static export**, served on the web and bundled into Tauri. | Tauri needs static assets; a static export means one router and one component tree for both platforms. All data comes from FastAPI, so we lose nothing by giving up Next's server features. |
| ADR-002 | **Short-lived JWT access tokens + rotating opaque refresh tokens.** Web keeps the refresh token in an httpOnly cookie; desktop keeps it in the OS keychain through a Tauri command. | Static export rules out server sessions in Next. Cookies don't cross from `tauri://localhost` to the API, so desktop needs a body transport. Rotation with reuse detection limits the damage of a stolen token. |
| ADR-003 | **Every marketplace is an independent connector** behind one interface that declares its capabilities. eBay Browse API is the first real source. | It is the only large fashion marketplace with an open, documented, self-serve search API, including image search. See `marketplaces.md`. |
| ADR-004 | **pgvector inside Postgres** for embeddings, not a separate vector database. | One database to run, transactional joins between vectors and product rows, HNSW indexes are good enough at MVP scale. |
| ADR-005 | **Curated, rigged 3D garments plus parametric "approximate" garments.** No automatic photo-to-3D. | A product photo can't become an accurately fitted garment. Approximate previews are always labelled. See `3d-asset-strategy.md`. |
| ADR-006 | **Backend enums are the source of truth for taxonomy**; TypeScript types are generated from OpenAPI and compile-time-checked against runtime constants. | One taxonomy across Python, TS and the database. |
| ADR-007 | **The AI stylist is a set of modules inside the backend**, each with structured inputs/outputs, orchestrated by plain Python. Not one giant prompt, not microservices. | Testable, cheap to evolve, and every product an AI mentions can be checked against real database rows. |

## 3. Platform strategy

- `apps/web` is the single UI. `next build` produces `apps/web/out/`
  (`output: "export"`, `trailingSlash: true`).
- **Web** deploys `out/` to any static host / CDN.
- **Desktop** (`apps/desktop/src-tauri`) points `frontendDist` at
  `../../web/out` and `devUrl` at `http://localhost:3000`.
- Platform differences live behind small adapters, never `if (desktop)` spread
  through components:
  - `TokenStore` (api-client): cookie refresh on web, keychain on desktop.
  - `platform.ts` (web): detects Tauri via `window.__TAURI_INTERNALS__`.
- Dynamic pages use query parameters (`/discover/product/?id=…`) rather than
  `[id]` segments so they export statically.

## 4. Backend layout

```
apps/backend/
  src/mirra/
    main.py                 app factory, middleware, router registration
    core/                   config, db session, security, errors, rate limiting
    db/                     declarative base + model registry for Alembic
    modules/
      auth/                 register, login, refresh rotation, logout
      users/                profile + preferences
      avatars/              avatar configurations
      products/             normalized products, images, embeddings
      marketplaces/         connector interface, registry, connectors/, listings, sellers, price history
      search/               (Phase 2) query parsing, fan-out, ranking
      pricing/              (Phase 2) deal finder / comparison ranking
      garments/             garment assets + compatibility
      wardrobe/             wardrobe items
      outfits/              outfits + items
      shopping/             saved products, search history, shopping events
      uploads/              user images (protected, deletable)
      visual_search/        (Phase 3) image analysis, embeddings, similarity
      stylist/              (Phase 4) analyst, designer, wardrobe assistant…
      recommendations/      (Phase 6+)
  migrations/               Alembic
  tests/
```

Each module owns `models.py`, `schemas.py` (Pydantic), `service.py` (logic, no
HTTP), `router.py` (HTTP only). Modules call each other through services, never
through each other's routers.

## 5. Frontend packages

| Package | Responsibility | Depends on |
|---|---|---|
| `@mirra/shared-types` | Generated OpenAPI types (`api.gen.ts`) + runtime taxonomy constants checked against them. | — |
| `@mirra/api-client` | Typed fetch client, auth middleware (attach token, single-flight refresh on 401), `TokenStore` interface. | shared-types |
| `@mirra/ui` | Design tokens, primitives (Button, Field, Badge…), fidelity/authenticity badges. | — |
| `@mirra/garment-system` | Garment manifest schema, category → body region/layer rules, conflict rules, fidelity levels. | shared-types |
| `@mirra/outfit-engine` | Pure outfit state: equip/replace/layer, undo/redo, price totals that never invent missing prices. | garment-system |
| `@mirra/dresser-engine` | React Three Fiber scene: stage, camera rig, mannequin, garment rendering (GLB or parametric), quality tiers. | garment-system, outfit-engine |

Packages ship TypeScript source; Next transpiles them (`transpilePackages`).
No package build step.

## 6. Data flow examples

**Search → dresser.** Discover calls `GET /api/v1/search` → backend fans out to
enabled connectors → listings are normalized, upserted, linked to products →
results return with marketplace attribution and the original URL. "Try on"
maps the product's category + attributes to a garment: an exact curated GLB if
one is linked, otherwise a parametric approximate garment clearly labelled
*Approximate preview*.

**Stylist → dresser.** `POST /api/v1/stylist/outfits` → Fashion Analyst turns
text into a structured brief → Wardrobe Assistant pulls owned items → Product
Research searches for the gaps → Outfit Designer composes and scores → every
product id is validated against the database before the response leaves → the
web app loads the outfit into `outfit-engine` → `dresser-engine` renders it.

## 7. Cross-cutting rules

- **No fabricated data.** Missing fields are `null` and the UI shows
  "Not provided by marketplace". AI estimates are labelled as estimates.
- **Marketplace attribution** on every listing (logo/name, seller, link out).
- **Replica handling.** Listings advertised as replicas are flagged
  (`authenticity = replica_advertised`) and never shown as authentic.
- **Privacy.** Personal photos are never required. Uploaded images live in a
  private bucket behind signed URLs and can be deleted by the user (hard delete).
- **API versioning.** Everything under `/api/v1`. Breaking changes need a new
  version or an additive migration path.
