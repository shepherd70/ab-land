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
import { ingestMineralSources } from "../src/lib/ingest/mineral_adapter";
import { ARCGIS_BASE_URL, enabledMineralSources } from "../config/sources";

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? "./data/ab-land.sqlite";
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  applySchema(db);

  const summary = await ingestMineralSources(db, ARCGIS_BASE_URL, enabledMineralSources());
  for (const result of summary.sources) {
    console.log(
      `${result.family} (${result.sourceLayer}): ${result.rows} rows, ` +
        `${result.rowsDeleted} stale removed`,
    );
  }
  console.log(`Published ${summary.rows} rows; removed ${summary.rowsDeleted} stale rows`);
  db.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
