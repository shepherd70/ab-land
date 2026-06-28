/**
 * Create/migrate the local SQLite schema. Safe to re-run (idempotent DDL).
 *
 * @module scripts/init_db
 * Data source: none (local SQLite)
 * @see CLAUDE.md §5, §12
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applySchema, openDb } from "../src/lib/db/client";

const dbPath = process.env.DB_PATH ?? "./data/ab-land.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });

const db = openDb(dbPath);
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

db.close();

console.log(`Schema applied to ${dbPath}`);
