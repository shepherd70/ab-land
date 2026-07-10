# ab-land — Task Tracker

> Living checklist of what's shipped, in flight, and queued for **ab-land**.
> Keep it current: when a PR merges, move its items to **Shipped**; when you start
> something, mark it **In progress**. This tracks *work* — see `CLAUDE.md` for the
> engineering charter and `docs/alberta-land-app-discovery-prompt.md` for origins.
>
> Reminder: ab-land reports **Crown agreement tenure**, never land-title ownership.

**Legend:** ✅ done · 🔨 in progress · ⬜ queued · 💤 dormant (blocked on external input) · 🚫 out of scope

_Last updated: 2026-07-10 · `main` @ `22a269e`_

---

## ✅ Shipped (merged to `main`)

- ✅ **#1 — Scaffold** — ingest pipeline, SQLite store, search-first UI, MapLibre wiring.
- ✅ **#2 — Offline ingest tests** — end-to-end PNG ingest coverage against fixture JSON (no network).
- ✅ **#3 — Company matching** — alias / predecessor grouping for company-profile search (`company_aliases.ts`).
- ✅ **#4 — ATS spatial search** — legal-land-description lookup with an offline coarse grid filter (`ats_grid.ts`).
- ✅ **#5 — Map** — attributed (OGL-Alberta) basemap, controls, fit-to-data (`basemap.ts`, `MapView.tsx`).
- ✅ **#6 — All mineral families** — 8 families field-verified & enabled in `config/sources.ts` (PNG/31, oil_sands/24, coal/39, minerals/57, brine/63, geothermal/72, carbon_seq/52+51, pore_space/75); searchable `target_substance` in FTS.
- ✅ **#7 — Map explorer (`/map`)** — province-wide interactive map: clustered centroid overview, R\*Tree-backed viewport polygon fetch on zoom-in, family color/legend/filters, click-through popup → holding (`MapExplorer.tsx`, `lib/map/families.ts`, `/api/map/{centroids,features}`, `dispositions_rtree`). First route-handler tests land here (`api_map.test.ts`, `map_viewport.test.ts`). Follow-up fix: `/map` fills the viewport height (PR #9).
- ✅ **#8 — Live-data correctness** — `lib/tenure.ts`: field-verified `AgreementType` code→label map (PNG lease/licence × Plains/Northern/Foothills bound by joining public offering notices ↔ GeoView issuances via the `TTYYMM####` number structure; other codes from type-specific leaf layers; legacy 001/002/003 from `ZoneDesc` substances; `A##` = application; `010` deliberately unmapped → "Type 010"). `9999-12-31` expiry renders "Continued / no expiry" in table, detail, and popup. Holding page is multi-tract aware (per-tract table, per-family sections for number collisions); company profile counts agreements vs parcels (`summarizeHoldings`). Coal `CoalCategory` labeled as policy restriction, substance row hidden when absent (brine).
- ✅ **#9 — Company-profile map** — the company page plots the holder's parcels (`CompanyMap.tsx`) via `GET /api/companies/[name]/features`. Payload-size guard: a lean stats query (`companyGeometryStats`) totals stored polygon bytes BEFORE fetching geometry; ≤ ~8 MB ships family-colored polygons, above it degrades to centroid circles with a "showing parcel centres" notice (CNRL: 15.5k parcels / 23 MB stored → ~4 MB of points). Budget injectable via `?budget=` for tests/tuning. Popup HTML extracted to shared `lib/map/popup.ts` (explorer + company map); legend chips show only the families the holder actually has. Field-verified in-browser: Tourmaline = polygons, CNRL = centroids, alias broadening (Cenovus ⇄ Husky) works through the route.

## 🔨 In progress

- _(nothing active — `main` is clean and CI is green)_

## ⬜ Next up — map follow-ups

- ⬜ **Simplified geometry column.** Giant parcels (max ~3.5 MB) are re-sent whole per viewport move;
  add an ingest-time simplified-geometry column if panning lags.
- ⬜ **Application rows in tenure layers.** Geothermal/72 contains `A60` and PNG/31 two `A59` rows
  (applications, not granted tenure). They're ingested and labeled "– application"; decide whether
  to exclude or badge them in search/map views.

## 💤 Dormant — blocked on external input

- 💤 **Surface dispositions (Tier B / Altalis DIDs+).** Import-seam only (`scripts/ingest_surface.ts`); stays dormant until the user lawfully places files in `data/altalis/`. No public API.

## 🚫 Out of scope (do not build)

- 🚫 **Title / ownership (SPIN2 / ARLO, LINC, owner contact).** Gated, pay-per-search, scraping violates ToS. If a feature seems to need it — stop and flag.

## 🧱 Infra & quality

- ✅ **CI** — GitHub Actions (`.github/workflows/ci.yml`): `npm ci → lint → typecheck → test → build` on every PR and push to `main` (Node 24).
- ✅ **Test suites (8)** — ATS parsing (`ats`), company matching (`company_names`, `company_aliases`), spatial helpers (`geo`, `ats_grid`, `ats_search`), basemap config (`basemap`), offline minerals ingest (`ingest_minerals`).
- 🔨 **Route-handler tests** — the map handlers (`/api/map/{features,centroids}`, `api_map.test.ts`) and the company-map handler (`/api/companies/[name]/features`, `api_company_features.test.ts`) have tests against temp SQLite fixtures; the original 3 (`search`, `holdings/[id]`, `companies/[name]`) are still untested.
- ⬜ **Dependency hygiene** — 2 moderate postcss advisories inside Next's build toolchain are accepted (build-time only, single-user local app). Never `npm audit fix --force` (see memory `ab-land-npm-audit-fix-force`); revisit when Next bumps its bundled postcss.
