# ab-land — Task Tracker

> Living checklist of what's shipped, in flight, and queued for **ab-land**.
> Keep it current: when a PR merges, move its items to **Shipped**; when you start
> something, mark it **In progress**. This tracks *work* — see `CLAUDE.md` for the
> engineering charter and `docs/alberta-land-app-discovery-prompt.md` for origins.
>
> Reminder: ab-land reports **Crown agreement tenure**, never land-title ownership.

**Legend:** ✅ done · 🔨 in progress · ⬜ queued · 💤 dormant (blocked on external input) · 🚫 out of scope

_Last updated: 2026-07-10 · `main` @ `f789553`_

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
- ✅ **#9 — Company-profile map** — `/companies/[name]` embeds a company-seeded `MapExplorer`
  (`company` prop → `?company=` on `/api/map/{centroids,features}` → alias-expanded `holder_norm IN`
  filter, indexed). Map fits to the company's holdings; clusters, family filters, and popups work on
  the filtered data; province `/map` unchanged.

- ✅ **#10 — Company holdings pagination** — the profile table renders 100 rows per page
  (`?page=N`, `Pagination.tsx`) instead of every parcel. `listByCompany` takes `{limit, offset}` with
  a deterministic order; totals come from `companyHoldingsSummary` (SQL `COUNT(DISTINCT …)`) since a
  page can't be counted. CNRL went from **21.2 MB / 2.8 s TTFB → 0.15 MB / 0.19 s**. The map still
  covers every parcel (it reads `/api/map/*`, not the page rows).

## 🔨 In progress

- _(nothing active — `main` is clean and CI is green)_

## ⬜ Next up

- ⬜ **`8888-12-31` expiry sentinel is unhandled.** `formatExpiry` maps only `9999-*` to
  "Continued / no expiry"; **4,432 ACTIVE PNG parcels** carry `8888-12-31` and render as a literal
  year-8888 date in the table, holding detail, and map popup. Every one of them has a
  `continuation_date` set (same as the 9999 rows), so it looks like a second continued-sentinel —
  but **field-verify against GeoView before labeling it** (per the §2 rule that burned us on `010`).
- ⬜ **Slow first paint of the map for huge holders.** Clustering ~15.5k centroids blocks the main
  thread for several seconds on the CNRL profile (froze the tab twice while testing). Pre-existing,
  independent of pagination — paging does *not* remount the map (verified: zero `/api/*` requests on
  a page change). Consider `clusterMaxZoom`/worker tuning or a server-side cluster index.
- ⬜ **`/api/companies/[name]` has no size guard.** It still returns every row *with* geometry
  (~23 MB for CNRL). Unused by the UI; add `limit`/`offset` or drop it.

## ⬜ Map follow-ups

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
- ✅ **Test suites (8)** — ATS parsing (`ats`), company matching (`company_names`, `company_aliases` — now also covers `listByCompany` paging and `companyHoldingsSummary`), spatial helpers (`geo`, `ats_grid`, `ats_search`), basemap config (`basemap`), offline minerals ingest (`ingest_minerals`).
- ✅ **Route-handler tests** — all 5 API handlers covered against temp SQLite fixtures: map handlers in `api_map.test.ts`, and `search` / `holdings/[id]` / `companies/[name]` in `api_routes.test.ts` (FTS company search, agreement prefix, route-level ATS auto-detection, 400s, summary-vs-full-geometry contracts).
- ⬜ **Dependency hygiene** — 2 moderate postcss advisories inside Next's build toolchain are accepted (build-time only, single-user local app). Never `npm audit fix --force` (see memory `ab-land-npm-audit-fix-force`); revisit when Next bumps its bundled postcss.
