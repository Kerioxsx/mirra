# API

FastAPI, versioned under `/api/v1`. Interactive docs at `http://localhost:8000/docs` in development.
The OpenAPI document is the contract: TypeScript types are generated from it (`pnpm gen:api`) and
CI fails if they drift (`pnpm check:api`).

## Conventions

- JSON everywhere; `snake_case` fields.
- Errors always use one envelope:
  ```json
  { "error": { "code": "validation_error", "message": "Request validation failed", "details": [...] } }
  ```
  Codes in use: `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`,
  `validation_error`, `rate_limited`, `refresh_superseded`, `refresh_reused`, `method_not_allowed`.
- Money is serialized as a decimal string (`"129.99"`) plus a currency code.
- Operation ids are `<tag>_<function>` (e.g. `auth_login`).
- Auth: `Authorization: Bearer <access token>`. Auth endpoints also require
  `X-Mirra-Client: web|desktop`.

## Endpoints (Phase 1)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness |
| GET | `/health/ready` | — | Readiness (database) — 503 when degraded |
| POST | `/api/v1/auth/register` | client header | Create account → tokens. Rate limited. |
| POST | `/api/v1/auth/login` | client header | Sign in → tokens. Rate limited. Generic error for unknown email / wrong password. |
| POST | `/api/v1/auth/refresh` | client header + cookie (web) or body (desktop) | Rotate refresh token → new tokens |
| POST | `/api/v1/auth/logout` | client header | Revoke the current refresh token, clear cookie |
| GET | `/api/v1/users/me` | bearer | Current user |
| PATCH | `/api/v1/users/me` | bearer | Update display name |
| DELETE | `/api/v1/users/me` | bearer + password | Permanently delete the account (cascades) |
| GET | `/api/v1/users/me/preferences` | bearer | Style profile |
| PUT | `/api/v1/users/me/preferences` | bearer | Replace style profile (validated: currency, country, budget order, enum values) |
| GET | `/api/v1/marketplaces` | — | Tracked marketplaces with live status and connector capabilities |

## Planned (by phase)

- **Phase 2:** `GET /search`, `GET /products/{id}`, `GET /products/{id}/offers`, `POST /saved`,
  `GET /history`.
- **Phase 3:** `POST /uploads`, `DELETE /uploads/{id}`, `POST /visual-search`.
- **Phase 4:** `POST /stylist/outfits`, `POST /stylist/chat`.
- **Phase 5:** `GET/POST/PATCH/DELETE /outfits`, `GET /garments`, `GET/PUT /avatars`.
- **Phase 6:** `GET/POST/PATCH/DELETE /wardrobe`, `GET /wardrobe/complete`.
