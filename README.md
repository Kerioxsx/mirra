# Mirra

**An AI fashion dresser.** Search every store, try it on a 3D avatar, and let an AI stylist build
the look, on the web and on desktop, from one codebase.

Mirra combines a 3D virtual dressing room (think character customisation in a game), a universal
clothing search engine, price comparison, an AI personal stylist and a digital wardrobe. Search
results, the dresser and the stylist share one outfit model, so finding a piece, seeing it on you
and building an outfit happen together.

> **Status: Phase 1 (foundation) complete, plus an early 3D dresser.** Accounts, the style profile
> and the 3D dresser work today on web and desktop. Marketplace search, the AI stylist and the
> wardrobe are next. They're designed and stubbed honestly in the UI, with no fake data.
> See [the roadmap](docs/development/roadmap.md).

## What works today

- **3D Dresser.** A studio with a procedural mannequin you can shape (height, build, shoulders,
  hips, leg length, skin, hair) and dress in parametric garments for 34 categories. You can layer
  pieces (a tee under a hoodie under a coat), and conflicts are handled for you (a dress replaces
  jeans, and the app says why). You can also recolour any piece, undo and redo, use camera presets
  and a turntable, pick a quality tier, and the look is saved on the device. Every garment shows how
  faithful it is (`exact` / `approximate` / `generic`).
- **Accounts on web and desktop.** Register, sign in, sessions that survive reloads (rotating refresh
  tokens; httpOnly cookie on web, OS keychain on desktop), profile, style preferences and account
  deletion.
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
| Backend (real Postgres, schema rebuilt from migrations) | `cd apps/backend && uv run pytest` | 25 |
| Shared packages (Vitest) | `pnpm test` | 29 |
| End-to-end (static export + API + Postgres, Playwright) | `pnpm --filter @mirra/web build && pnpm test:e2e` | 11 |
| Desktop secure store (Rust) | `cd apps/desktop/src-tauri && cargo test` | 2 |

Quality gates: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm check:api` (generated
types match the backend), `ruff`, `mypy --strict`, `alembic check`.

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Decisions (ADRs)](docs/adr/README.md)
- [Risks & dependencies](docs/architecture/risks.md)
- [Marketplace access research](docs/architecture/marketplaces.md)
- [3D avatar & garment strategy](docs/architecture/3d-asset-strategy.md)
- [Database](docs/architecture/database.md) · [AI workflows](docs/architecture/ai-workflows.md) · [API](docs/api/README.md)
- [Setup](docs/development/setup.md) · [Conventions](docs/development/conventions.md) · [Roadmap](docs/development/roadmap.md) · [Agents & task breakdown](docs/development/agents.md)

## Principles

Mirra never invents product data. It labels approximate 3D previews and replica listings as what
they are, and it uses marketplaces only through official APIs, affiliate feeds and partnerships.
