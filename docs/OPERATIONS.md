# ab-land operations

The app reads a local SQLite snapshot and never calls GeoView while serving a page. Refresh the
open mineral data weekly so holder, status, and term information do not silently age.

## One-time setup

```bash
npm ci
npm run db:init
npm run ingest:minerals
npm run ingest:ats
```

The app header reports the last complete mineral refresh. It turns stale after eight days; set
`DATA_STALE_AFTER_DAYS` in `.env.local` if a different warning window is required.

## Safe refresh behavior

`npm run ingest:minerals` stages every enabled GeoView layer before changing live data. It then:

1. rejects invalid records through the existing Zod normalizers;
2. rejects an empty layer or a drop below `INGEST_MIN_ROW_FRACTION` (default `0.5`);
3. replaces all enabled mineral layers in one SQLite transaction;
4. removes rows no longer present upstream; and
5. records the batch and per-layer outcome in `ingest_runs`.

Any failure before or during publication preserves the previous complete snapshot. Only after
manually verifying that a large upstream reduction is intentional should you run once with:

```bash
INGEST_ALLOW_DESTRUCTIVE_REFRESH=1 npm run ingest:minerals
```

Do not leave that override in `.env.local`.

## Weekly scheduling

Use the machine that owns `data/ab-land.sqlite`; a cloud job cannot update this local database.

### Linux cron

Run `crontab -e` and adapt the absolute repository and npm paths:

```cron
15 3 * * 1 cd /absolute/path/to/ab-land && /usr/bin/npm run ingest:minerals >> data/ingest.log 2>&1
```

### Windows Task Scheduler

Create a weekly task with:

- **Program:** `C:\Program Files\nodejs\npm.cmd`
- **Arguments:** `run ingest:minerals`
- **Start in:** the absolute `ab-land` repository directory

Configure the task to retry after a failure. The next page request will show a red refresh-failure
badge while continuing to serve the last successful snapshot.

## Inspect recent runs

```bash
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('./data/ab-land.sqlite', { readonly: true }); console.table(db.prepare('SELECT started_at, finished_at, family, source_layer, rows_upserted, rows_deleted, status, message FROM ingest_runs ORDER BY id DESC LIMIT 12').all()); db.close();"
```

An old `running` row means the process was interrupted before it could record success or failure;
live mineral rows were not published unless the batch row reached `ok`.

## Authoritative ATS cache

`npm run ingest:ats` is intentionally separate from the weekly mineral refresh. The official
Legal Sub-Division layer contains roughly four million polygons, changes infrequently, and needs
substantial temporary disk space while the new table is staged. Budget at least a few GB free.

The job orders and pages the layer, validates every ATS key and polygon, verifies the downloaded
row count against the server both before and after transfer, and atomically swaps tables only when
the complete snapshot agrees. A failed or interrupted run leaves the previous live ATS table in
place; a later run removes any abandoned staging table before restarting.

Tune only if necessary with `ATS_INGEST_PAGE_SIZE`, `ATS_INGEST_THROTTLE_MS`, and
`ATS_GEOMETRY_PRECISION`. The defaults request 5,000 cells per page, pause 100 ms between pages,
and retain six WGS84 decimal places. Re-run after an announced ATS grid update or if the search API
reports that the cache is unavailable; it does not belong in the weekly mineral schedule.
