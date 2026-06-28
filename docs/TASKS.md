# ab-land — Task Tracker

> Living checklist of what's shipped, in flight, and queued for **ab-land**.
> Keep it current: when a PR merges, move its items to **Shipped**; when you start
> something, mark it **In progress**. This tracks *work* — see `CLAUDE.md` for the
> engineering charter and `docs/alberta-land-app-discovery-prompt.md` for origins.
>
> Reminder: ab-land reports **Crown agreement tenure**, never land-title ownership.

**Legend:** ✅ done · 🔨 in progress · ⬜ queued · 💤 dormant (blocked on external input) · 🚫 out of scope

_Last updated: 2026-06-28 · `main` @ `e7c12a0`_

---

## ✅ Shipped (merged to `main`)

- ✅ **#1 — Scaffold** — ingest pipeline, SQLite store, search-first UI, MapLibre wiring.
- ✅ **#2 — Offline ingest tests** — end-to-end PNG ingest coverage against fixture JSON (no network).
- ✅ **#3 — Company matching** — alias / predecessor grouping for company-profile search (`company_aliases.ts`).
- ✅ **#4 — ATS spatial search** — legal-land-description lookup with an offline coarse grid filter (`ats_grid.ts`).
- ✅ **#5 — Map** — attributed (OGL-Alberta) basemap, controls, fit-to-data (`basemap.ts`, `MapView.tsx`).
- ✅ **#6 — All mineral families** — 8 families field-verified & enabled in `config/sources.ts` (PNG/31, oil_sands/24, coal/39, minerals/57, brine/63, geothermal/72, carbon_seq/52+51, pore_space/75); searchable `target_substance` in FTS.

## 🔨 In progress

- _(nothing active — `main` is clean and CI is green)_

## ⬜ Next up — live-data correctness (highest value)

Real quirks of the live GeoView data the normalizer/UI currently ignore (see memory `ab-land-data-quirks`; verify layer ids + field names against the live ArcGIS REST directory before coding):

- ⬜ **AgreementType code → label map.** `AgreementType` is a numeric code (`004`, `054`, `070–075`…), not a label — needs a lookup before the UI is meaningful. Applies to **all** families.
- ⬜ **Expiry sentinel handling.** `CurrentExpiryDate` returns `9999-12-31` for continued/active agreements → render as "Continued / no expiry," not a literal date. All families.
- ⬜ **Multi-tract agreements.** One agreement can span multiple tracts (e.g. `5495110028` → `01`, `02`). Natural key is `(source, agreement_number, tract)` — UI/aggregation must never assume one row per agreement.
- ⬜ **Per-family field nuances.** brine (63) `TargetSubstance` is always null; coal (39) `CoalCategory` is policy-restriction text, not a commodity. Ensure detail views label these correctly.

## 💤 Dormant — blocked on external input

- 💤 **Surface dispositions (Tier B / Altalis DIDs+).** Import-seam only (`scripts/ingest_surface.ts`); stays dormant until the user lawfully places files in `data/altalis/`. No public API.

## 🚫 Out of scope (do not build)

- 🚫 **Title / ownership (SPIN2 / ARLO, LINC, owner contact).** Gated, pay-per-search, scraping violates ToS. If a feature seems to need it — stop and flag.

## 🧱 Infra & quality

- ✅ **CI** — GitHub Actions (`.github/workflows/ci.yml`): `npm ci → lint → typecheck → test → build` on every PR and push to `main` (Node 24).
- ✅ **Test suites (8)** — ATS parsing (`ats`), company matching (`company_names`, `company_aliases`), spatial helpers (`geo`, `ats_grid`, `ats_search`), basemap config (`basemap`), offline minerals ingest (`ingest_minerals`).
- ⬜ **Route-handler tests** — none of the 3 `/api/*` handlers (`search`, `holdings/[id]`, `companies/[name]`) are tested yet; charter §10 calls for a few against a temp SQLite fixture.
- ⬜ **Dependency hygiene** — 2 moderate postcss advisories inside Next's build toolchain are accepted (build-time only, single-user local app). Never `npm audit fix --force` (see memory `ab-land-npm-audit-fix-force`); revisit when Next bumps its bundled postcss.
