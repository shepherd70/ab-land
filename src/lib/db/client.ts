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

/**
 * Create tables, indexes, FTS, and triggers if they do not exist, then apply
 * additive column migrations — `CREATE TABLE IF NOT EXISTS` cannot add a new
 * column to a table from an earlier schema version.
 */
export function applySchema(db: DB, schemaPath: string = SCHEMA_PATH): void {
  db.exec(readFileSync(schemaPath, "utf8"));
  if (!hasColumn(db, "dispositions", "geometry_simplified_geojson")) {
    db.exec("ALTER TABLE dispositions ADD COLUMN geometry_simplified_geojson TEXT");
  }
}
