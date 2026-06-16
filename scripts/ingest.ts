/**
 * Full ingest: pull every enabled open mineral source (Tier A) and import any
 * user-supplied Altalis surface files (Tier B). Idempotent; safe to schedule.
 *
 * @module scripts/ingest
 * Data source: GeoView ArcGIS REST (OGL-Alberta) + Altalis files (licensed)
 * @see CLAUDE.md §2, §3, §12
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { applySchema, openDb } from "../src/lib/db/client";
import { ingestMineralSource } from "../src/lib/ingest/mineral_adapter";
import { ingestSurfaceFiles } from "../src/lib/ingest/surface_adapter";
import { ARCGIS_BASE_URL, enabledMineralSources } from "../config/sources";

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? "./data/ab-land.sqlite";
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  applySchema(db);

  const started = Date.now();
  let total = 0;

  for (const src of enabledMineralSources()) {
    process.stdout.write(`Ingesting ${src.family} (${src.service}/${src.layerId}) ... `);
    const { rows } = await ingestMineralSource(db, ARCGIS_BASE_URL, src);
    total += rows;
    console.log(`${rows} rows`);
  }

  const altalisDir = process.env.ALTALIS_DIR ?? "./data/altalis";
  const surface = await ingestSurfaceFiles(db, altalisDir);
  if (surface.rows > 0) {
    total += surface.rows;
    console.log(`Surface: ${surface.rows} rows`);
  }

  db.close();
  console.log(`Done: ${total} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
