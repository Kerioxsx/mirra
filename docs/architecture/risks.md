# Technical risks & dependencies

Ranked by (likelihood × impact). Each risk has an owner and a mitigation that
is already built into the plan.

| # | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | **Marketplace access.** Depop, Grailed and Taobao have no buyer-side API available to us. Amazon needs affiliate sales history. | High | High | eBay first (open API); affiliate feeds for brands; demo connector for development; partnership applications start in Phase 2. The connector capability model means new sources plug in without UI changes. | Search |
| R2 | **3D garment realism and cost.** Authoring rigged, morph-compatible garments is slow, skilled work. | High | High | Small curated library + parametric approximate garments with honest labelling. One rig, one base mesh. Budget art time explicitly in Phase 5. | 3D |
| R3 | **AI hallucinating products, prices or availability.** | Medium | High | Structured outputs only; every product/listing id is validated against the database; prices come from listings, never from the model; unknown fields stay `null`. Golden-set tests for the stylist. | AI |
| R4 | **Visual search quality** — garment detection in busy outfit photos, colour constancy under bad lighting. | Medium | Medium | Detect → crop → embed per garment; combine embedding similarity with structured attribute filters; let users pick the crop. Measure top-k precision on a labelled set before launch. | AI |
| R5 | **WebGL performance on low-end hardware and in Tauri webviews** (WebKitGTK on Linux is the weakest). | Medium | Medium | Quality tiers, DPR caps, lazy GLB loading, KTX2 textures, meshopt. Test on WebKitGTK early (the CI desktop job builds against it). | Performance |
| R6 | **Auth across web and desktop.** Cookies don't cross from `tauri://localhost`; tokens in JS storage are XSS-exposed. | Medium | High | Access token in memory only; refresh in httpOnly cookie (web) or OS keychain (desktop); rotation + reuse detection; strict CSP. | Security |
| R7 | **Static export limits** (no server routes, no middleware, no dynamic segments without pre-generation). | Low | Medium | All data via FastAPI; query-param routes; documented in ADR-001. | Frontend |
| R8 | **Cost of AI calls** (vision + LLM per request). | Medium | Medium | Cache analyses by image hash; embeddings computed once per image in background jobs; cheap models for parsing, larger models only for composition; per-user rate limits. | AI / Perf |
| R9 | **Counterfeit listings** shown as authentic. | Medium | High | `authenticity` field per listing; keyword + seller-signal classifier flags "replica/rep/1:1/UA" style listings as `replica_advertised`; never upgrade authenticity from model output alone. | Search |
| R10 | **Privacy of uploaded photos.** | Low | High | Private bucket, signed URLs, hard delete, no photos required, EXIF stripped on upload. | Security |
| R11 | **Data freshness / ToS caching limits** (prices change; some APIs limit how long data may be stored). | Medium | Medium | `fetched_at` / `expires_at` on listings; refresh on view; price history stored only where terms allow. | Search |
| R12 | **Taxonomy drift** between Python, TS and DB. | Medium | Low | Backend enums → OpenAPI → generated TS; compile-time equality test against runtime constants; CI fails if generated types are stale. | Lead |

## External dependencies

| Dependency | Needed from | Blocking? |
|---|---|---|
| eBay developer account + production keyset | Phase 2 | Yes, for live search (demo connector covers dev) |
| Affiliate network publisher approval (Awin/CJ/Rakuten) | Phase 2–3 | No, but long lead time |
| Vision + LLM provider API key | Phase 3 | Yes for AI features |
| Embedding model (self-hosted CLIP/SigLIP-class or hosted) | Phase 3 | Yes for visual search |
| 3D artist time / Blender base avatar | Phase 5 | Yes for exact garments |
| Apple/Microsoft code-signing certificates | Phase 8 | Yes for distributable desktop builds |
