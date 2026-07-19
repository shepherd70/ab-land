# ab-land — Task Tracker

> Living checklist of what's shipped, in flight, and queued for **ab-land**.
> Keep it current: when a PR merges, move its items to **Shipped**; when you start
> something, mark it **In progress**. This tracks *work* — see `CLAUDE.md` for the
> engineering charter and `docs/alberta-land-app-discovery-prompt.md` for origins.
>
> Reminder: ab-land reports **Crown agreement tenure**, never land-title ownership.

**Legend:** ✅ done · 🔨 in progress · ⬜ queued · 💤 dormant (blocked on external input) · 🚫 out of scope

_Last updated: 2026-07-16 · `main` @ `1417359`_

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

- ✅ **#11 — `8888-12-31` expiry sentinel** — field-verified live against GeoView layer 31
  (2026-07-10): the 4,432 ACTIVE PNG parcels carrying `8888-12-31` share the exact field profile of
  the verified-continued `9999` rows (past `ContinuationDate`, `ContinuationPending='N'`, empty
  `CancelCode`), and no public GoA source distinguishes the sentinels (checked GeoView user manual,
  GeoDiscover metadata, all ETS PNG-continuation guides). `formatExpiry` now renders both as
  "Continued / no expiry"; `HoldingDetail` compares displayed expiry (not raw dates) so
  mixed-sentinel agreements no longer claim "varies by tract". The 75%-vs-1% correlation with
  multi-interval `ZoneDesc` is recorded as a correlate only — deliberately not labeled.

- ✅ **#12 — Dropped the orphaned `/api/companies/[name]` route** — it returned every holding
  *with* geometry (~23 MB for CNRL) and nothing called it: since PR #15 the profile page queries
  SQLite directly (`listByCompany` paged, no geometry) and the map uses `/api/map/*`. Deleted the
  handler + its two tests rather than adding a size guard; resurrect from git if a
  scripting/export API is ever wanted.

- ✅ **#13 — Map first paint off the main thread** — `/api/map/centroids` now serves GeoJSON and
  `MapExplorer` hands MapLibre the *URL*, so the worker fetches/parses/clusters and the payload
  never blocks the main thread (the old path did `res.json()` on 1.5–10 MB + built the
  FeatureCollection client-side, twice in company mode). Verified live: CNRL profile worst
  main-thread task **137 ms** (was a multi-second freeze that twice froze the tab); province
  `/map` (~77k) stays interactive with one 798 ms task when the payload lands. Company maps now
  frame at construction via server-side `companyBounds()` (merged parcel bboxes) — no province
  flash. Rode along: unchecking every family used to send `families=""` (= no filter) so polygons
  showed ALL families; both paths now short-circuit to an empty FeatureCollection. Deliberately
  skipped `clusterMaxZoom`/`maxzoom` tuning — freeze fixed, tuning changes cluster visuals.

## 🔨 In progress

- 🔨 **#14 — Map-first UI.** The home page is now the province-wide zoomable explorer; browse →
  zoom → click a parcel → holding. Search moved onto the map as a floating overlay
  (`MapSearch.tsx`): debounced `/api/search` (auto kind), company hits link to profiles, parcel
  hits zoom to and highlight the agreement (all tracts, via `/api/holdings/[id]` geometry, drawn
  on a `selected-agreement` source that stays visible at any zoom). `/map` redirects to `/`;
  `SearchPanel.tsx` and the search-first home are gone; header/back-links point at the map.

## ⬜ Next up

- _(empty — the queued work is the two Map follow-ups below)_

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
- ✅ **Route-handler tests** — all 4 API handlers covered against temp SQLite fixtures: map handlers in `api_map.test.ts`, and `search` / `holdings/[id]` in `api_routes.test.ts` (FTS company search, agreement prefix, route-level ATS auto-detection, 400s, summary-vs-full-geometry contracts).
- ⬜ **Dependency hygiene** — 2 moderate postcss advisories inside Next's build toolchain are accepted (build-time only, single-user local app). Never `npm audit fix --force` (see memory `ab-land-npm-audit-fix-force`); revisit when Next bumps its bundled postcss.
