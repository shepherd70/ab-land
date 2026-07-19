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
npm run dev           # http://localhost:3000
```

## Data sources

| Tier | Source | Access | Used for |
|------|--------|--------|----------|
| A (open) | Alberta Energy **GeoView** ArcGIS REST | Open, OGL–Alberta, no auth | Mineral agreements — all 8 families verified & enabled (PNG, oil sands, coal, metallic/industrial minerals, brine, geothermal, carbon sequestration, pore space) |
| B (licensed) | **Altalis** DIDs / DIDs+ files | You buy/license and drop into `data/altalis/` | Surface dispositions (optional, dormant until files present) |

**Excluded:** SPIN2 / ARLO land-title ownership (gated, no public API) — out of scope.

The app never scrapes gated or authenticated endpoints. See **[CLAUDE.md](./CLAUDE.md)** for the
full architecture, data model, and guardrails.

## Scripts

- `npm run dev` / `build` / `start` / `lint` — Next.js
- `npm run db:init` — create/migrate the SQLite schema (also builds the map spatial index; re-run
  once on an existing DB to backfill it — the map explorer returns a `503` until it exists)
- `npm run ingest` — full ingest (`:minerals` and `:surface` run a single tier)
- `npm test` / `npm run test:watch` — Vitest
- `npm run typecheck` — `tsc --noEmit`

## Layout

```
config/   what to ingest (source registry)       scripts/  offline CLI jobs (ingest, db init)
data/     local SQLite + user-supplied files      src/lib   testable core logic
src/app   routes + API (read-only over SQLite)    src/components  React + MapLibre views
```
