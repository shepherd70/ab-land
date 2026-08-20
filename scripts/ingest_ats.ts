/**
 * One-time/occasional ingest of the open authoritative ATS LSD grid.
 *
 * @module scripts/ingest_ats
 * Data source: GeoView ATS_Grid_Ext_PROD/4 (open, OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A), §3, §12
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ARCGIS_BASE_URL, ATS_GRID_SOURCE } from "../config/sources";
import { applySchema, openDb } from "../src/lib/db/client";
import { ingestAtsGrid } from "../src/lib/ingest/ats_adapter";

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? "./data/ab-land.sqlite";
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  try {
    applySchema(db);
    let lastReported = 0;
    const result = await ingestAtsGrid(db, ARCGIS_BASE_URL, ATS_GRID_SOURCE, {
      onProgress: (rows, expected) => {
        if (rows === expected || rows - lastReported >= 100_000) {
          console.log(
            `ATS: ${rows.toLocaleString()} / ${expected.toLocaleString()} source features staged`,
          );
          lastReported = rows;
        }
      },
    });
    console.log(
      `Published ${result.rows.toLocaleString()} authoritative ATS cells ` +
        `from ${result.sourceFeatures.toLocaleString()} source features ` +
        `(${result.mergedFeatures.toLocaleString()} split features merged; ` +
        `replaced ${result.previousRows.toLocaleString()})`,
    );
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
