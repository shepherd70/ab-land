/**
 * Ingest one open mineral-agreement layer: stream features from GeoView,
 * normalize, and batch-upsert into SQLite within transactions.
 *
 * @module lib/ingest/mineral_adapter
 * Data source: GeoView ArcGIS REST (OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A), §5
 */
import type { DB } from "../db/client";
import type { Disposition, SourceDef } from "../types";
import { queryFeatures } from "./arcgis_client";
import { mineralNormalizers } from "./normalize";
import { prepareUpsert } from "./upsert";

export interface IngestResult {
  family: string;
  rows: number;
}

const BATCH_SIZE = 1000;

/** Pull and upsert a single verified mineral source. */
export async function ingestMineralSource(
  db: DB,
  baseUrl: string,
  src: SourceDef,
): Promise<IngestResult> {
  const normalize = mineralNormalizers[src.family];
  if (!normalize) {
    throw new Error(
      `No normalizer for family "${src.family}". Verify the layer and add one in lib/ingest/normalize.ts.`,
    );
  }

  const upsert = prepareUpsert(db);
  const flush = db.transaction((items: Disposition[]) => {
    for (const d of items) upsert(d);
  });

  const sourceLayer = `${src.service}/${src.layerId}`;
  const batch: Disposition[] = [];
  let rows = 0;

  for await (const feature of queryFeatures({
    baseUrl,
    service: src.service,
    layerId: src.layerId,
  })) {
    const d = normalize(feature, sourceLayer);
    if (!d.agreementNumber) continue; // skip rows without a natural key
    batch.push(d);
    rows += 1;
    if (batch.length >= BATCH_SIZE) flush(batch.splice(0));
  }
  if (batch.length) flush(batch.splice(0));

  return { family: src.family, rows };
}
