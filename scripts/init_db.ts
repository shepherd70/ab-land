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
db.close();

console.log(`Schema applied to ${dbPath}`);
