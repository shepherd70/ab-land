/**
 * Import only user-supplied Altalis surface files (Tier B, licensed).
 * No-op unless files exist in ALTALIS_DIR. Never fetches a remote endpoint.
 *
 * @module scripts/ingest_surface
 * Data source: Altalis DIDs+ (licensed, user-supplied)
 * @see CLAUDE.md §2 (Tier B), §11, §12
 */
import { applySchema, openDb } from "../src/lib/db/client";
import { ingestSurfaceFiles } from "../src/lib/ingest/surface_adapter";

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? "./data/ab-land.sqlite";
  const db = openDb(dbPath);
  applySchema(db);

  const res = await ingestSurfaceFiles(db, process.env.ALTALIS_DIR ?? "./data/altalis");
  console.log(`Surface: ${res.rows} rows`);
  db.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
