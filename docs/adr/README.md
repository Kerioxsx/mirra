# Architecture decision records

Short records of decisions that shape the codebase. Add a new entry rather than editing an
accepted one; mark superseded entries.

## ADR-001 — One Next.js app, statically exported, for web and desktop
**Status:** accepted (Phase 1)

**Context.** We need a web app and a desktop app without two codebases. Tauri serves static assets
from disk; it can't run a Node server.

**Decision.** `apps/web` builds with `output: "export"` and `trailingSlash: true`. The web deploy
serves `out/` from a CDN; Tauri bundles the same `out/` (`frontendDist: ../../web/out`). All data
comes from FastAPI.

**Consequences.** No Next.js route handlers, middleware or server components that fetch data.
Dynamic pages use query parameters (`/discover/product/?id=…`). WebGL components load with
`next/dynamic({ ssr: false })`.

## ADR-002 — Token model: in-memory JWT access + rotating opaque refresh
**Status:** accepted (Phase 1)

**Decision.**
- Access token: HS256 JWT, 15 minutes, held only in memory by `@mirra/api-client`.
- Refresh token: 32 random bytes, stored as SHA-256 in `auth_sessions`, 30 days, rotated on every
  use, grouped in a *family* per login.
- Transport: **web** → httpOnly `SameSite=Lax` cookie scoped to `/api/v1/auth` (Secure in
  production); **desktop** → JSON body, persisted in the OS keychain via Tauri commands with a key
  allow-list.
- Every auth request carries `X-Mirra-Client: web|desktop`. The custom header forces a CORS preflight,
  which blocks cross-site form posts riding the cookie. A token is bound to its client kind.
- Reuse of a rotated token more than 10 s after rotation revokes the whole family (theft). Reuse
  within 10 s returns `refresh_superseded` (two tabs racing) and the client retries once.

**Consequences.** The web app and API must be deployed same-site (e.g. `mirra.app` +
`api.mirra.app`) for the Lax cookie. Desktop on Linux needs a Secret Service provider (GNOME Keyring,
KWallet) for the keychain.

## ADR-003 — Independent marketplace connectors with declared capabilities
**Status:** accepted (Phase 1, implemented from Phase 2)

**Decision.** `MarketplaceConnector` (backend `modules/marketplaces/base.py`) with the methods from
the blueprint. Unsupported methods raise `CapabilityNotSupported`; `None` means unknown. A static
catalog lists every tracked marketplace with an honest status (`active`, `planned`, `blocked`).
eBay Browse API is the first live connector. See `docs/architecture/marketplaces.md`.

## ADR-004 — pgvector inside PostgreSQL
**Status:** accepted

**Decision.** Embeddings live in `product_embeddings.embedding vector(768)` with an HNSW cosine
index. One shared vision-language space (CLIP/SigLIP class) for image and text so text→image search
works. Changing dimensions requires a migration and a re-embed job.

## ADR-005 — Curated rigged garments + labelled parametric approximations
**Status:** accepted

**Decision.** Three fidelity levels (`exact`, `approximate`, `generic`), always shown in the UI. No
automatic photo-to-3D. Phase 1 ships a procedural mannequin and parametric garments driven by the
same normalized body parameters the rigged avatar will use. See `3d-asset-strategy.md`.

## ADR-006 — Backend owns the taxonomy; frontend contracts are generated
**Status:** accepted (Phase 1)

**Decision.** `mirra.core.taxonomy` defines categories, body regions, layers and enums. `pnpm gen:api`
exports `openapi.json` and the taxonomy, writing `packages/shared-types/src/api.gen.ts` and
`taxonomy.gen.ts`. CI runs `pnpm check:api` and fails on drift. The OpenAPI document is post-processed
so 422s reference the real `ErrorResponse` envelope.

## ADR-007 — AI stylist as in-process modules with structured I/O
**Status:** accepted (implemented from Phase 3/4)

**Decision.** Fashion Analyst, Visual Search, Product Research, Price Comparison, Outfit Designer,
Wardrobe Assistant and Fit & Size are Python modules in `apps/backend/src/mirra/modules/stylist/`,
each with Pydantic input/output models, orchestrated by plain code — not one giant prompt, not
microservices. Every product or listing id in model output is validated against the database before
it reaches a client; prices and availability are always read from listings, never from the model.
