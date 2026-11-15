# Mirra

**An AI fashion dresser.** Search every store, try it on a 3D avatar, and let an AI stylist build
the look, on the web and on desktop, from one codebase.

Mirra combines a 3D virtual dressing room (think character customisation in a game), a universal
clothing search engine, price comparison, an AI personal stylist and a digital wardrobe. Search
results, the dresser and the stylist share one outfit model, so finding a piece, seeing it on you
and building an outfit happen together.

> **Status: Phase 1 complete; Phase 2 under way with Taobao first.** Accounts, the style profile,
> the 3D dresser and marketplace search work on web and desktop. The Taobao connector (official
> overseas affiliate API) is built and goes live once credentials are configured; see
> [docs/architecture/taobao.md](docs/architecture/taobao.md). The AI stylist and wardrobe are next.
> See [the roadmap](docs/development/roadmap.md).

## What works today

- **3D Dresser.** A studio with a rigged avatar (`mirra-rig@1`: one continuous skinned body,
  twenty bones, four poses) you can shape (height, build, shoulders, hips, leg length, skin, hair)
  and dress in garments for 34 categories. Garments are built around the body and each layer
  encloses the ones under it, so nothing pokes through, in any pose. You can layer
  pieces (a tee under a hoodie under a coat), and conflicts are handled for you (a dress replaces
  jeans, and the app says why). You can also recolour any piece, undo and redo, use camera presets
  and a turntable, pick a quality tier, and the look is saved on the device. Every garment shows how
  faithful it is (`exact` / `approximate` / `generic`).
- **Accounts on web and desktop.** Register, sign in, sessions that survive reloads (rotating refresh
  tokens; httpOnly cookie on web, OS keychain on desktop), profile, style preferences and account
  deletion.
- **eBay.** A Browse API connector (keyword and photo search in clothing, shoes and accessories,
  condition, seller feedback, delivery cost and dates to your country, eBay's Authenticity
  Guarantee shown as a label) goes live once eBay developer keys are configured.
- **Search, Taobao first.** One search fans out to every connected marketplace. Taobao queries are
  translated to Chinese, results come back with English titles. Prices are converted (≈, at ECB
  rates), delivered cost is estimated without inventing unknowns, and every listing is labelled:
  brand store, look-alike or replica. "Try on" puts any result on your avatar as a labelled
  approximate preview.
- **Listing pages, deal finder, saved items and history.** Every result gets a stable Mirra
  listing with observed price history. "Similar & cheaper" finds the same look across connected
  marketplaces (replicas never suggested). Save pieces, and see searches and opened listings in a
  private, deletable Shopping History.
- **Chinese sizes, read.** Taobao, Tmall and Weidian listings show what each size is cut for
  (the national code such as 175/92A, typical letter sizes, waist inches or chi, shoe sizes) and
  suggest one from your measurements, labelled as an estimate.
- **Buy through KakoBuy.** Taobao, Tmall, Weidian and 1688 items can be bought via the KakoBuy
  purchasing agent. Paste any link (or a KakoBuy link) into Discover, or use "Other ways to buy"
  on a listing, with delivered cost from KakoBuy's published fees. Listings advertised as
  replicas are never routed (KakoBuy prohibits counterfeits too).
- **Saved outfits.** Save a look from the dresser to your account (basics plus real products with
  their prices) and reopen it on any device.
- **Honest marketplace catalog.** The API reports which marketplaces are live, planned, or blocked
  pending a partnership. The research behind each status is in
  [marketplaces.md](docs/architecture/marketplaces.md).

## Repository

```
apps/
  web/          Next.js 16 static export: the one UI for web and desktop
  desktop/      Tauri 2 shell that bundles apps/web/out, plus keychain commands
  backend/      FastAPI + SQLAlchemy + Alembic + pgvector
packages/
  ui/              design tokens and primitives
  shared-types/    generated OpenAPI types + taxonomy (from the backend)
  api-client/      typed client with single-flight token refresh
  dresser-engine/  React Three Fiber studio, mannequin, parametric garments
  garment-system/  garment definitions, fidelity, layering and conflict rules
  outfit-engine/   outfit state, undo/redo, price totals
assets/          avatars, garments, textures, icons (Phase 5 GLB pipeline)
infrastructure/  docker compose, database init, deployment notes
docs/            architecture, API, development, decisions
```

## Quick start

```bash
# services (or use a local Postgres 16 with pgvector; see docs/development/setup.md)
docker compose -f infrastructure/docker/docker-compose.yml up -d

# API
cd apps/backend && uv sync && uv run alembic upgrade head
uv run uvicorn mirra.main:app --reload --port 8000

# web (new terminal, repo root)
pnpm install && pnpm dev            # http://localhost:3000

# desktop (needs Rust + Tauri system libraries)
pnpm dev:desktop
```

## Tests

| Suite | Command | Count |
|---|---|---|
| Backend (real Postgres, schema rebuilt from migrations; Taobao signing vs. published vectors) | `cd apps/backend && uv run pytest` | 105 |
| Shared packages (Vitest) | `pnpm test` | 34 |
| End-to-end (static export + API + Postgres + mock Taobao gateway, Playwright) | `pnpm --filter @mirra/web build && pnpm test:e2e` | 20 |
| Desktop secure store (Rust) | `cd apps/desktop/src-tauri && cargo test` | 2 |

Quality gates: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm check:api` (generated
types match the backend), `ruff`, `mypy --strict`, `alembic check`.

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Decisions (ADRs)](docs/adr/README.md)
- [Risks & dependencies](docs/architecture/risks.md)
- [Marketplace access research](docs/architecture/marketplaces.md) · [**Taobao integration**](docs/architecture/taobao.md) · [Purchasing agents (KakoBuy)](docs/architecture/purchase-agents.md)
- [3D avatar & garment strategy](docs/architecture/3d-asset-strategy.md)
- [Database](docs/architecture/database.md) · [AI workflows](docs/architecture/ai-workflows.md) · [API](docs/api/README.md)
- [Setup](docs/development/setup.md) · [Conventions](docs/development/conventions.md) · [Roadmap](docs/development/roadmap.md) · [Agents & task breakdown](docs/development/agents.md)

## Principles

Mirra never invents product data. It labels approximate 3D previews and replica listings as what
they are, and it uses marketplaces only through official APIs, affiliate feeds and partnerships.
