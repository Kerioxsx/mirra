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

## Endpoints

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
| GET | `/api/v1/search` | optional bearer | Search all live connectors. Params: `q`, `marketplace` (repeatable), `sort` (`relevance`/`price_asc`/`price_desc`), `price_min`, `price_max`, `category`, `currency`, `ship_to`, `page`, `page_size`. Returns results (listing + converted price + landed cost), per-marketplace status (`ok`/`error`/`timeout`/`not_configured`/`blocked`, with the query actually sent, e.g. Chinese for Taobao) and the FX source/date. Signed-in users get their profile's currency/ship-to and a search-history entry. 60/min per IP. |
| GET | `/api/v1/listings/{id}` | optional bearer | A stored listing priced for the shopper (`currency`, `ship_to` or profile), with landed cost, Mirra's observed price history, freshness (`fetched_at`, `stale`) `saved` state and `purchase_routes` (e.g. KakoBuy, with delivered cost or the reason it's unavailable). |
| GET | `/api/v1/listings/{id}/alternatives` | optional bearer | Deal finder: similar pieces across live marketplaces, cheapest first, with a heuristic `match_score` (estimate), reasons and `savings`. Replica listings are excluded and counted in `excluded_replicas`. 30/min per IP. |
| GET | `/api/v1/saved` | bearer | Saved listings, newest first |
| POST | `/api/v1/saved` | bearer | Save a stored listing (`listing_id`); idempotent |
| DELETE | `/api/v1/saved/{listing_id}` | bearer | Unsave |
| POST | `/api/v1/shopping/events` | bearer | Record `viewed` or `clicked_out` for a listing |
| GET | `/api/v1/shopping/history` | bearer | Recent searches and listing events (50 each) |
| DELETE | `/api/v1/shopping/history` | bearer | Delete all searches and events (saved items are kept) |
| POST | `/api/v1/links/resolve` | — | Recognise a pasted Taobao/Tmall/Weidian/1688/KakoBuy link (no network calls): source, item id, canonical link, purchasing-agent routes and any stored Mirra listing for the same item. 422 with a shopper-facing reason for unsupported or short links. 60/min per IP. |
| GET | `/api/v1/outfits` | bearer | Saved outfits with items, listing summaries and per-currency totals |
| POST | `/api/v1/outfits` | bearer | Save a look: `{name, items: [{category, color_hex, listing_id?}]}`. Region/layer come from the backend taxonomy; slot conflicts and one-piece conflicts are rejected (422); every `listing_id` must be a stored listing of the same category. Totals are computed from stored listing prices. |
| GET | `/api/v1/outfits/{id}` | bearer | One outfit (404 if not yours) |
| PATCH | `/api/v1/outfits/{id}` | bearer | Rename |
| DELETE | `/api/v1/outfits/{id}` | bearer | Delete |

## Planned (by phase)

- **Phase 2 (remaining):** exact-product offers by GTIN/MPN once a connector provides them.
- **Phase 3:** `POST /uploads`, `DELETE /uploads/{id}`, `POST /visual-search`.
- **Phase 4:** `POST /stylist/outfits`, `POST /stylist/chat`.
- **Phase 5:** `GET /garments`, `GET/PUT /avatars`.
- **Phase 6:** `GET/POST/PATCH/DELETE /wardrobe`, `GET /wardrobe/complete`.
