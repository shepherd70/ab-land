/**
 * Ingest only the open mineral sources (Tier A).
 *
 * @module scripts/ingest_minerals
 * Data source: GeoView ArcGIS REST (OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A), §12
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applySchema, openDb } from "../src/lib/db/client";
import { ingestMineralSource } from "../src/lib/ingest/mineral_adapter";
import { ARCGIS_BASE_URL, enabledMineralSources } from "../config/sources";

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? "./data/ab-land.sqlite";
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  applySchema(db);

  for (const src of enabledMineralSources()) {
    const { rows } = await ingestMineralSource(db, ARCGIS_BASE_URL, src);
    console.log(`${src.family}: ${rows} rows`);
  }
  db.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
