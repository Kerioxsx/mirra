# Deployment

| Component | Target | Notes |
|---|---|---|
| Web (`apps/web/out`) | Any static host / CDN | Build with `NEXT_PUBLIC_API_URL=https://api.<domain>`. Serve `404.html` for misses. Long cache for `/_next/static/*`. |
| API (`apps/backend`) | Container (Dockerfile) behind TLS | Run `alembic upgrade head` as a release job. Set `MIRRA_ENV=production`, a strong `MIRRA_JWT_SECRET`, `MIRRA_CORS_ORIGINS`, `MIRRA_DEMO_CONNECTOR_ENABLED=false` — the app refuses to boot otherwise. |
| Database | Managed PostgreSQL 16 with `pgvector` | Daily backups + point-in-time recovery. |
| Cache / limits | Managed Redis | `MIRRA_REDIS_URL`. |
| Object storage | S3-compatible, private bucket | Signed URLs only. |
| Desktop | GitHub Releases via `tauri build` per OS | macOS notarisation + Windows code signing (Phase 8). Update `connect-src` in `tauri.conf.json` to the production API origin. |

**Same-site requirement.** The web refresh cookie is `SameSite=Lax`, so web app and API must share a
registrable domain (e.g. `mirra.app` and `api.mirra.app`).
