# Local development

## Prerequisites

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22+ | web app, shared packages |
| pnpm | 10 (via `corepack enable`) | JS workspaces |
| Python | 3.12+ | backend |
| uv | 0.11+ | Python deps and runs |
| PostgreSQL | 16 with `pgvector` | database (or use Docker) |
| Redis | 7 (optional) | rate limiting across processes |
| Rust | stable | desktop app only |
| Tauri system libs | see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) | desktop app only |

## 1. Services

With Docker:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

Or with a local Postgres (as superuser):

```sql
CREATE ROLE mirra LOGIN PASSWORD 'mirra' CREATEDB;
CREATE DATABASE mirra OWNER mirra;
CREATE DATABASE mirra_test OWNER mirra;
-- in both databases:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
```

## 2. Backend

```bash
cd apps/backend
cp .env.example .env          # adjust if needed
uv sync
uv run alembic upgrade head
uv run uvicorn mirra.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs>.

## 3. Web

```bash
pnpm install
pnpm dev                       # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:8000`.

## 4. Desktop

```bash
pnpm dev:desktop               # starts the web dev server and opens the Tauri window
pnpm build:desktop             # production bundle for the current OS
```

On Linux the keychain needs a Secret Service provider (GNOME Keyring or KWallet) for staying signed
in between launches.

## Tests

```bash
cd apps/backend && uv run pytest          # backend (uses the mirra_test database)
pnpm test                                 # shared package unit tests (Vitest)
pnpm --filter @mirra/web build && pnpm test:e2e   # Playwright: static export + API + Postgres
cd apps/desktop/src-tauri && cargo test   # desktop secure-store tests
```

## Quality gates (same as CI)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm check:api
cd apps/backend && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run alembic check
```

## Changing the API

1. Change Pydantic schemas / routes in `apps/backend`.
2. `pnpm gen:api` — regenerates `packages/shared-types/src/api.gen.ts` and `taxonomy.gen.ts`.
3. Fix TypeScript errors, commit the generated files with the change.
