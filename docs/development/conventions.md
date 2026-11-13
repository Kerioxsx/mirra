# Development conventions

## Repository

- **Monorepo**: pnpm workspaces for TypeScript (`apps/web`, `apps/desktop`, `packages/*`), uv for the
  backend (`apps/backend`).
- Shared packages ship TypeScript source (no build step); Next transpiles them.
- Generated files (`*.gen.ts`) are committed and never edited by hand.

## Code style

| Area | Rules |
|---|---|
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; ESLint (typescript-eslint, react-hooks); Prettier (100 cols). Type-only imports use `import type`. |
| React | Function components; client components marked `"use client"`; no data fetching in server components (static export). WebGL via `next/dynamic({ ssr: false })`. |
| Styling | Tailwind v4 with design tokens from `@mirra/ui/tokens.css`. No hard-coded colours in components except garment colours. |
| Python | Ruff (lint + format, 100 cols), mypy `--strict`. Modules split into `models` / `schemas` / `service` / `router`; routers contain no business logic. |
| Rust | `cargo fmt`, `cargo clippy`; commands return `Result<T, String>`. |

## Backend modules

- A module may import another module's `service` or `models`, never its `router`.
- Services take an `AsyncSession` and commit their own transactions.
- Raise `AppError` subclasses (`NotFound`, `Conflict`, `Unauthorized`…) — the handler turns them into
  the error envelope.
- New tables → SQLAlchemy model + `alembic revision --autogenerate`, then review the migration by
  hand (extensions, generated columns, index types).

## Data honesty rules (non-negotiable)

1. Never invent product data. Unknown fields are `null`; the UI says "Not provided".
2. `NULL` price/shipping means unknown, `0` means free.
3. Every listing shows its marketplace and links to the original listing.
4. Replica listings are labelled and never shown as authentic.
5. 3D garments always show their fidelity (`exact` / `approximate` / `generic`).
6. Unbuilt features say so plainly; no sample data presented as real.

## Testing

- Every feature ships with tests at the lowest useful level: pure logic (Vitest / pytest), API
  (pytest + httpx against a real Postgres), user flows (Playwright against the static export).
- Backend tests rebuild the schema from migrations each run.
- Don't mark a feature complete until its tests pass locally and in CI.

## Git

- Branches: `feature/<area>-<short-name>`, `fix/…`, `docs/…`.
- Commits: imperative mood, explain *why* in the body when it isn't obvious.
- PRs: describe what changed, how it was verified, and what is still incomplete.
