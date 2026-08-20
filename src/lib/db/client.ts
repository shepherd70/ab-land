/**
 * SQLite connection helpers (better-sqlite3). The app opens the DB read-only;
 * scripts open it read-write and apply the schema.
 *
 * @module lib/db/client
 * Data source: none (local SQLite)
 * @see CLAUDE.md §4, §5
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type DB = Database.Database;

const DEFAULT_DB_PATH = process.env.DB_PATH ?? "./data/ab-land.sqlite";
const SCHEMA_PATH = join(process.cwd(), "src", "lib", "db", "schema.sql");
const DISPOSITION_COLUMNS = `
  id, source, family, source_layer, agreement_type, agreement_number, tract, status,
  holder_desrep, holder_desrep_id, participants, holder_norm,
  term_date, current_expiry_date, continuation_date, cancel_date, zone_desc, target_substance,
  area_ha, centroid_lon, centroid_lat, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
  geometry_geojson, geometry_simplified_geojson, ingested_at`;
const DISPOSITION_SELECT_COLUMNS = `
  id, source, family, source_layer, COALESCE(agreement_type, ''), agreement_number, tract, status,
  holder_desrep, holder_desrep_id, participants, holder_norm,
  term_date, current_expiry_date, continuation_date, cancel_date, zone_desc, target_substance,
  area_ha, centroid_lon, centroid_lat, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
  geometry_geojson, geometry_simplified_geojson, ingested_at`;

/** Open the database for read/write (used by ingest scripts). */
export function openDb(path: string = DEFAULT_DB_PATH): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** Open the database read-only (used by the Next.js route handlers). */
export function openReadOnly(path: string = DEFAULT_DB_PATH): DB {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  return db;
}

/** Does the table exist and have the named column? (pragma_table_info) */
export function hasColumn(db: DB, table: string, column: string): boolean {
  return (
    db.prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?").get(table, column) !==
    undefined
  );
}

function hasCompleteDispositionKey(db: DB): boolean {
  const indexes = db.prepare("SELECT name, \"unique\" FROM pragma_index_list('dispositions')").all() as Array<{
    name: string;
    unique: number;
  }>;
  const expected = ["source", "family", "agreement_type", "agreement_number", "tract"];
  return indexes.some((index) => {
    if (!index.unique) return false;
    const columns = db.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno").all(index.name) as Array<{
      name: string;
    }>;
    return columns.map((column) => column.name).join("\u0000") === expected.join("\u0000");
  });
}

function createMigratedDispositionTableSql(schemaSql: string): string {
  const marker = "CREATE TABLE IF NOT EXISTS dispositions (";
  const start = schemaSql.indexOf(marker);
  const end = schemaSql.indexOf("\n);", start);
  if (start < 0 || end < 0) throw new Error("Could not locate dispositions DDL in schema.sql");
  return schemaSql
    .slice(start, end + 3)
    .replace("CREATE TABLE IF NOT EXISTS dispositions", "CREATE TABLE dispositions_next");
}

/** Rebuild the table to correct its complete, collision-free natural key. */
function migrateDispositionNaturalKey(db: DB, schemaSql: string): void {
  const createNext = createMigratedDispositionTableSql(schemaSql);
  db.transaction(() => {
    db.exec(`
      DROP TRIGGER IF EXISTS disp_ai;
      DROP TRIGGER IF EXISTS disp_ad;
      DROP TRIGGER IF EXISTS disp_au;
      DROP TRIGGER IF EXISTS disp_rtree_ai;
      DROP TRIGGER IF EXISTS disp_rtree_ad;
      DROP TRIGGER IF EXISTS disp_rtree_au;
    `);
    db.exec(createNext);
    db.exec(
      `INSERT INTO dispositions_next (${DISPOSITION_COLUMNS})
       SELECT ${DISPOSITION_SELECT_COLUMNS} FROM dispositions`,
    );
    db.exec("DROP TABLE dispositions");
    db.exec("ALTER TABLE dispositions_next RENAME TO dispositions");
  })();

  // Dropping the old table also drops its ordinary indexes. Reapply all schema
  // objects, then rebuild the two external-content indexes from preserved ids.
  db.exec(schemaSql);
  db.transaction(() => {
    db.exec("INSERT INTO dispositions_fts(dispositions_fts) VALUES ('rebuild')");
    db.exec("DELETE FROM dispositions_rtree");
    db.exec(`
      INSERT INTO dispositions_rtree (id, minx, maxx, miny, maxy)
      SELECT id, bbox_minx, bbox_maxx, bbox_miny, bbox_maxy
      FROM dispositions WHERE bbox_minx IS NOT NULL
    `);
  })();
}

/**
 * Create tables, indexes, FTS, and triggers if they do not exist, then apply
 * additive column migrations and the one table rebuild required to correct the
 * cross-family natural key.
 */
export function applySchema(db: DB, schemaPath: string = SCHEMA_PATH): void {
  const schemaSql = readFileSync(schemaPath, "utf8");
  db.exec(schemaSql);
  if (!hasColumn(db, "dispositions", "geometry_simplified_geojson")) {
    db.exec("ALTER TABLE dispositions ADD COLUMN geometry_simplified_geojson TEXT");
  }
  if (!hasColumn(db, "ingest_runs", "parent_run_id")) {
    db.exec("ALTER TABLE ingest_runs ADD COLUMN parent_run_id INTEGER");
  }
  if (!hasColumn(db, "ingest_runs", "source_layer")) {
    db.exec("ALTER TABLE ingest_runs ADD COLUMN source_layer TEXT");
  }
  if (!hasColumn(db, "ingest_runs", "rows_deleted")) {
    db.exec("ALTER TABLE ingest_runs ADD COLUMN rows_deleted INTEGER DEFAULT 0");
  }
  if (!hasCompleteDispositionKey(db)) {
    migrateDispositionNaturalKey(db, schemaSql);
  }
}
