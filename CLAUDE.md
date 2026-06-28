# CLAUDE.md — ab-land

> Engineering charter & system prompt for **ab-land**. Read this fully before changing anything.
> ab-land reports **Crown agreement tenure (who holds the agreement)** — it is **NOT** a land-title
> ownership system. Never present results as legal title/ownership.

## 1. Project overview
ab-land is a **single-user, local web app** for exploring **Alberta Crown mineral tenure** (and,
optionally, surface land dispositions). It ingests open Government-of-Alberta tenure data into a
local SQLite database and lets the user:
- **Search** by company name, agreement number, or ATS legal land description.
- **Drill into** a holding: holder / designated representative, agreement type, status, term &
  expiry dates, and parcel polygon (on a map).
- **View a company profile** aggregating all of a company's holdings, as a list and on a map.

## 2. DATA SOURCE MAP — read first; it drives architecture, legality, and auth

### Tier A — OPEN, ingested live (the spine)
**Alberta Energy "GeoView" ArcGIS REST services**
- Base: `https://gis.energy.gov.ab.ca/arcgis/rest/services/Geoview`
- **Verified:** `Mineral_Agreements_Ext_PROD/MapServer/31` = "Petroleum and Natural Gas Agreement".
  Fields: `AgreementType, AgreementNumber, Tract, Status, DesRep, DesRepId, Participants,
  CurrentExpiryDate, ContinuationDate, CancelDate, TermDate, CancelCode, ZoneDesc,
  TransferPending, ContinuationPending`, polygon geometry. Query -> JSON/GeoJSON,
  maxRecordCount 1000, supportsPagination true.
- Other families (oil sands, coal, metallic/industrial minerals, brine, geothermal, carbon
  sequestration, pore space) live in sibling layers of the same `Mineral_Agreements_Ext_PROD`
  service. **All eight families are now field-verified and enabled in `config/sources.ts`**
  (verified 2026-06): PNG/31, oil-sands/24, coal/39, minerals/57, brine/63, geothermal/72,
  carbon-seq/52+51, pore-space/75. We ingest only tenure leaf layers (agreements/leases); ArcGIS
  group nodes, Applications, and Postings are excluded. Note: geothermal is taken from layer 72 of
  this service (more complete) rather than the separate `Geothermal_Agreements_Ext_PROD`. Always
  field-verify a layer against the live service before adding it here.
- **Licence: Open Government Licence – Alberta.** Attribute it in the UI + README.
- Always request `outSR=4326` (WGS84 lon/lat) so geometry is MapLibre-ready.
- Be polite: page at maxRecordCount, throttle, cache to the DB. Never hammer the service.

### Tier B — LICENSED, manual import only (surface leases)
Surface dispositions (**DIDs / DIDs+**) holder data is the **Altalis** "Disposition Mapping"
product — subscription / AOI purchase, **no public API**, account-gated. The
`maps.alberta.ca/genesis_winauth/...` endpoint is Windows-auth gated; some GeoDiscover disposition
layers are internal-use.
- The app ingests **only files the user lawfully obtained** and placed in `data/altalis/`.
- Surface features stay dormant until such files exist.

### Excluded — gated title (do NOT integrate)
**SPIN2 / ARLO** (land-title ownership, LINC, owner contact): pay-per-search, no public API,
scraping violates ToS. Out of scope. If a feature seems to need title ownership, **stop and flag
it** — do not try to obtain it.

## 3. Architecture & data flow
```
GeoView ArcGIS REST (Tier A) ─┐
                              ├─► ingest adapters ─► normalize+validate (Zod) ─► SQLite
Altalis files (Tier B) ───────┘                                                    │
                                                                                    ▼
                  React UI (search-first) + MapLibre  ◄─  Next.js route handlers (/api/*)
```
- **Ingest** runs offline via `npm run ingest` (manual or Windows Task Scheduler); idempotent
  upsert; weekly refresh.
- **App** only reads SQLite — no live ArcGIS calls at request time (snappy, resilient, offline).

## 4. Tech stack
Next.js (App Router) + TypeScript (strict) + Tailwind · SQLite via `better-sqlite3` (+ FTS5) ·
`@turf/turf` for spatial ops · `maplibre-gl` (free, attributed basemap) · `zod` validation ·
`tsx` to run TS scripts · `vitest` for tests. No data-source secrets (data is open).

## 5. Data model — normalized "disposition core"
One table `dispositions` (every source maps into it) + an FTS5 shadow table for name search.
See `src/lib/db/schema.sql` and `src/lib/types.ts`. Key points:
- Natural key: `UNIQUE(source, agreement_number, tract)`.
- `holder_norm` is computed in `lib/matching/company_names.ts` (handles Ltd/Inc/ULC variants,
  predecessors after transfers). **Matching is heuristic — never assert exactness or ownership.**
- All geometry stored as WGS84 (EPSG:4326) GeoJSON, plus precomputed bbox + centroid columns.
- FTS5 over `holder_desrep, participants, agreement_number`.

## 6. Coding standards
- **Naming:** folders `hyphen-case`; our modules `snake_case.ts`; React components
  `PascalCase.tsx`; framework files keep Next.js names (`page.tsx`, `layout.tsx`, `route.ts`).
- **Structure:** UI in `src/app` + `src/components`; logic in `src/lib`; CLI entrypoints in
  `scripts/`; the source registry in `config/`.
- **Imports:** inside `src/` use the `@/*` alias. `scripts/` and `config/` are outside `src/`,
  so they import via relative paths (and inject the source registry into `lib` functions).
- **TypeScript:** strict; no `any` (use `unknown` + Zod); explicit return types on exported fns.
- **Validation/errors:** parse ALL external data with Zod; ingest fails loudly with a clear
  message + the offending record; unvalidated ArcGIS/Altalis data must never reach the DB.
- **Spatial:** request `outSR=4326`; store lon/lat GeoJSON; precompute bbox + centroid on ingest.

## 7. Source-file header (every .ts/.tsx we author)
```ts
/**
 * <one-line purpose>
 *
 * @module <path/name>
 * Data source: <none | GeoView ArcGIS REST (OGL-Alberta) | Altalis DIDs+ (licensed, user-supplied)>
 * @see CLAUDE.md §<n>
 */
```
Data-touching modules MUST name the source + access tier + licence in the header.

## 8. Commit convention
Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`), optional scope
(`feat(ingest): ...`). Short-lived branches off `main`.

## 9. Dependency & docs policy
npm only; commit `package-lock.json`; prefer native `fetch`/stdlib over new deps and justify any
addition. TSDoc on exported functions/types. Keep README + this file current with architecture.

## 10. Testing & CI
Vitest unit tests for: field normalization, company-name matching, spatial helpers, ATS parsing;
a few route-handler tests against a temp SQLite fixture. Ingest must be testable **offline**
(fixture JSON, no network). GitHub Actions CI: install -> lint -> typecheck -> `vitest run` ->
`next build`.

## 11. Guardrails — DO / DON'T
**DO:** treat all external responses as untrusted (Zod); throttle + page ArcGIS politely and cache
to SQLite; attribute OGL-Alberta; show a "Crown agreement tenure, not land title" disclaimer; keep
all data out of git.

**DON'T:**
- Scrape/redistribute Altalis, or call any `*genesis_winauth*` / authenticated endpoint.
- Touch SPIN2 / ARLO or any title / LINC / owner-contact system.
- Commit the SQLite db, Altalis files, or anything under `data/`.
- Present holder/company matches as legal ownership, or as exact/authoritative.
- Add secrets to the repo; if ever needed, use `.env` (gitignored).

## 12. Common commands
`npm run dev` · `npm run db:init` · `npm run ingest` (+ `:minerals` / `:surface`) ·
`npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

---
<!-- Next.js framework guidance for coding agents (from create-next-app). -->
@AGENTS.md
