/**
 * Create/migrate the local SQLite schema. Safe to re-run (idempotent DDL).
 *
 * @module scripts/init_db
 * Data source: none (local SQLite)
 * @see CLAUDE.md §5, §12
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Geometry } from "geojson";
import { applySchema, hasColumn, openDb } from "../src/lib/db/client";
import { simplifyForMap } from "../src/lib/spatial/geo";

const dbPath = process.env.DB_PATH ?? "./data/ab-land.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });

const db = openDb(dbPath);
// Checked before applySchema adds the column, so the backfill below runs
// exactly once per DB: on a fresh DB the table doesn't exist yet (no rows to
// fill), and on later runs the column is already present.
const hadSimplifiedColumn = hasColumn(db, "dispositions", "geometry_simplified_geojson");
applySchema(db);

// One-time spatial backfill: populate the R*Tree from any rows that predate it
// (e.g. an existing DB ingested before this index existed). Guarded so it runs
// only when the index is empty — kept out of applySchema, which runs on every
// ingest. After this, the schema triggers keep the index in sync.
const { e: empty } = db
  .prepare("SELECT NOT EXISTS(SELECT 1 FROM dispositions_rtree) AS e")
  .get() as { e: number };
if (empty) {
  const { changes } = db
    .prepare(
      `INSERT INTO dispositions_rtree (id, minx, maxx, miny, maxy)
       SELECT id, bbox_minx, bbox_maxx, bbox_miny, bbox_maxy
       FROM dispositions WHERE bbox_minx IS NOT NULL`,
    )
    .run();
  if (changes > 0) console.log(`Backfilled ${changes} rows into the spatial index`);
}

// One-time geometry backfill: rows ingested before the simplified-geometry
// column existed get their map copy computed here instead of waiting for the
// next `npm run ingest`. The LENGTH prefilter cheaply skips the mass of small
// DLS rectangles that simplifyForMap would reject anyway (a polygon dense
// enough to simplify — 64+ vertices — serializes well past 512 bytes).
if (!hadSimplifiedColumn) {
  const ids = db
    .prepare(
      `SELECT id FROM dispositions
       WHERE geometry_geojson IS NOT NULL AND LENGTH(geometry_geojson) >= 512`,
    )
    .all() as { id: number }[];
  const getGeometry = db.prepare("SELECT geometry_geojson AS g FROM dispositions WHERE id = ?");
  const setSimplified = db.prepare(
    "UPDATE dispositions SET geometry_simplified_geojson = ? WHERE id = ?",
  );
  let filled = 0;
  db.transaction(() => {
    for (const { id } of ids) {
      const { g } = getGeometry.get(id) as { g: string };
      const simplified = simplifyForMap(JSON.parse(g) as Geometry);
      if (simplified) {
        setSimplified.run(JSON.stringify(simplified), id);
        filled++;
      }
    }
  })();
  if (filled > 0) console.log(`Backfilled simplified geometry for ${filled} rows`);
}

db.close();

console.log(`Schema applied to ${dbPath}`);
