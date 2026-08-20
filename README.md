# ab-land

Local explorer for **Alberta Crown mineral tenure**. The home page **is** the map: a zoomable,
province-wide, clustered, family-colored explorer — browse, zoom into parcels, and click through
to any holding. Search (company, agreement number, or ATS legal land description) sits right on
the map and zooms to what it finds; company profiles aggregate a holder's agreements as a list
and a map.

> **Crown agreement tenure, not land title.** This tool shows who holds a Crown *agreement*, not
> who owns the *land title*. Mineral data © Government of Alberta, used under the
> [Open Government Licence – Alberta](https://open.alberta.ca/licence). Surface (Altalis DIDs+) data
> is licensed and **user-supplied** — see below.

## Quick start

```bash
npm install
npm run db:init       # create the local SQLite schema
npm run ingest        # pull open mineral data (+ import any Altalis files) into SQLite
npm run ingest:ats    # one-time authoritative ATS cache (large; see below)
npm run dev           # http://localhost:3000
```

## Data sources

| Tier | Source | Access | Used for |
|------|--------|--------|----------|
| A (open) | Alberta Energy **GeoView** ArcGIS REST | Open, OGL–Alberta, no auth | Mineral agreements — all 8 families verified & enabled (PNG, oil sands, coal, metallic/industrial minerals, brine, geothermal, carbon sequestration, pore space) |
| A (open) | Alberta Energy **ATS Grid** (`ATS_Grid_Ext_PROD/4`) | Open, OGL–Alberta, no auth | Authoritative legal-subdivision polygons for offline ATS search |
| B (licensed) | **Altalis** DIDs / DIDs+ files | You buy/license and drop into `data/altalis/` | Surface dispositions (optional, dormant until files present) |

**Excluded:** SPIN2 / ARLO land-title ownership (gated, no public API) — out of scope.

The app never scrapes gated or authenticated endpoints. See **[CLAUDE.md](./CLAUDE.md)** for the
full architecture, data model, and guardrails.

## Scripts

- `npm run dev` / `build` / `start` / `lint` — Next.js
- `npm run db:init` — create/migrate the SQLite schema (also builds the map spatial index; re-run
  once on an existing DB to backfill it — the map explorer returns a `503` until it exists)
- `npm run ingest` — full ingest (`:minerals` and `:surface` run a single tier)
- `npm run ingest:ats` — download and atomically publish the separate authoritative ATS cache
- `npm test` / `npm run test:watch` — Vitest
- `npm run typecheck` — `tsc --noEmit`

## Refresh safety and freshness

Mineral ingest is a snapshot operation: all enabled GeoView layers are downloaded into a local
staging table, validated, and then published together in one short SQLite transaction. A failed
layer leaves the previous complete snapshot untouched. Rows that disappeared upstream are removed
on a successful publish, and every attempt is recorded in `ingest_runs`.

The header shows the last complete refresh and warns after eight days by default. See
**[docs/OPERATIONS.md](./docs/OPERATIONS.md)** for weekly scheduling, failure checks, and the
guarded override for a verified large upstream row-count change.

## Authoritative ATS search

ATS search uses the official GeoView Legal Sub-Division polygons cached in SQLite—not regular-grid
arithmetic. An LSD query loads one official polygon; quarter and section queries compose four or
sixteen LSD polygons. The disposition R*Tree supplies candidates, then exact polygon intersection
removes bbox false positives.

Run `npm run ingest:ats` after `db:init`. This is a separate one-time/occasional job because the
source contains roughly four million cells and produces a large local cache (budget at least a few
GB of free disk during its atomic staging swap). The command validates every response, compares
downloaded rows with server counts before and after the run, and preserves the prior complete cache
if anything fails. ATS searches return an explicit unavailable message until this cache is populated.

## Layout

```
config/   what to ingest (source registry)       scripts/  offline CLI jobs (ingest, db init)
data/     local SQLite + user-supplied files      src/lib   testable core logic
src/app   routes + API (read-only over SQLite)    src/components  React + MapLibre views
```
