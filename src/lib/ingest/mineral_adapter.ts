/**
 * Snapshot-correct ingest for GeoView mineral layers: stage and validate every
 * enabled layer, then publish the complete refresh in one SQLite transaction.
 *
 * @module lib/ingest/mineral_adapter
 * Data source: GeoView ArcGIS REST (open, OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A), §3, §5
 */
import type { DB } from "../db/client";
import type { Disposition, SourceDef } from "../types";
import { queryFeatures } from "./arcgis_client";
import { mineralNormalizers } from "./normalize";
import { failIngestRun, finishIngestRun, startIngestRun } from "./run_log";
import { prepareUpsert } from "./upsert";

export interface IngestResult {
  family: string;
  sourceLayer: string;
  rows: number;
  rowsDeleted: number;
}

export interface MineralIngestSummary {
  rows: number;
  rowsDeleted: number;
  sources: IngestResult[];
}

interface StagedSource {
  src: SourceDef;
  sourceLayer: string;
  runId: number;
  rows: number;
  rowsDeleted: number;
}

const BATCH_SIZE = 1000;
const STAGING_TABLE = "ingest_dispositions";
const PUBLISH_COLUMNS = `
  source, family, source_layer, agreement_type, agreement_number, tract, status,
  holder_desrep, holder_desrep_id, participants, holder_norm,
  term_date, current_expiry_date, continuation_date, cancel_date, zone_desc, target_substance,
  area_ha, centroid_lon, centroid_lat, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
  geometry_geojson, geometry_simplified_geojson, ingested_at`;

function sourceLayer(src: SourceDef): string {
  return `${src.service}/${src.layerId}`;
}

function prepareStagingTable(db: DB): void {
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS ${STAGING_TABLE} AS
      SELECT ${PUBLISH_COLUMNS} FROM dispositions WHERE 0;
    CREATE UNIQUE INDEX IF NOT EXISTS ingest_dispositions_key
      ON ${STAGING_TABLE} (source, family, agreement_type, agreement_number, tract);
    DELETE FROM ${STAGING_TABLE};
  `);
}

function existingLayerCount(db: DB, layer: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n FROM dispositions WHERE source = 'geoview' AND source_layer = ?",
    )
    .get(layer) as { n: number };
  return row.n;
}

function minimumRowFraction(): number {
  const configured = Number(process.env.INGEST_MIN_ROW_FRACTION ?? "0.5");
  return Number.isFinite(configured) && configured >= 0 && configured <= 1 ? configured : 0.5;
}

function validateRowCount(layer: string, staged: number, existing: number): void {
  if (process.env.INGEST_ALLOW_DESTRUCTIVE_REFRESH === "1") return;
  if (staged === 0) {
    throw new Error(
      `${layer} returned zero valid rows; refusing to replace ${existing} live rows. ` +
        "Set INGEST_ALLOW_DESTRUCTIVE_REFRESH=1 only after verifying the source is truly empty.",
    );
  }
  const fraction = minimumRowFraction();
  if (existing > 0 && staged < existing * fraction) {
    throw new Error(
      `${layer} returned ${staged} rows versus ${existing} live rows; this exceeds the ` +
        `${Math.round((1 - fraction) * 100)}% removal guard. ` +
        "Verify the source or set INGEST_ALLOW_DESTRUCTIVE_REFRESH=1.",
    );
  }
}

async function stageSource(
  db: DB,
  baseUrl: string,
  src: SourceDef,
  ingestedAt: string,
): Promise<number> {
  const normalize = mineralNormalizers[src.family];
  if (!normalize) {
    throw new Error(
      `No normalizer for family "${src.family}". Verify the layer and add one in lib/ingest/normalize.ts.`,
    );
  }

  const upsert = prepareUpsert(db, STAGING_TABLE);
  const flush = db.transaction((items: Disposition[]) => {
    for (const disposition of items) upsert(disposition);
  });
  const layer = sourceLayer(src);
  const batch: Disposition[] = [];
  let rows = 0;

  for await (const feature of queryFeatures({
    baseUrl,
    service: src.service,
    layerId: src.layerId,
  })) {
    const disposition = normalize(feature, layer);
    if (!disposition.agreementNumber) continue;
    disposition.ingestedAt = ingestedAt;
    batch.push(disposition);
    rows += 1;
    if (batch.length >= BATCH_SIZE) flush(batch.splice(0));
  }
  if (batch.length) flush(batch.splice(0));
  return rows;
}

function countRemovedRows(db: DB, layer: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM dispositions d
       WHERE d.source = 'geoview' AND d.source_layer = @layer
         AND NOT EXISTS (
           SELECT 1 FROM ${STAGING_TABLE} s
           WHERE s.source = d.source
             AND s.family = d.family
             AND s.agreement_type = d.agreement_type
             AND s.source_layer = d.source_layer
             AND s.agreement_number = d.agreement_number
             AND s.tract = d.tract
         )`,
    )
    .get({ layer }) as { n: number };
  return row.n;
}

/**
 * Refresh all supplied layers as one snapshot. Network work only touches a
 * temporary staging table; readers keep seeing the previous complete snapshot
 * until the final short publish transaction commits.
 */
export async function ingestMineralSources(
  db: DB,
  baseUrl: string,
  sources: SourceDef[],
): Promise<MineralIngestSummary> {
  if (sources.length === 0) throw new Error("No verified mineral sources are enabled");

  prepareStagingTable(db);
  const startedAt = new Date().toISOString();
  const batchRunId = startIngestRun(db, {
    source: "geoview",
    message: `Refreshing ${sources.length} mineral layer${sources.length === 1 ? "" : "s"}`,
    startedAt,
  });
  const staged: StagedSource[] = [];

  try {
    for (const src of sources) {
      const layer = sourceLayer(src);
      const runId = startIngestRun(db, {
        parentRunId: batchRunId,
        source: "geoview",
        family: src.family,
        sourceLayer: layer,
        startedAt,
      });
      const entry: StagedSource = { src, sourceLayer: layer, runId, rows: 0, rowsDeleted: 0 };
      staged.push(entry);
      entry.rows = await stageSource(db, baseUrl, src, startedAt);
      validateRowCount(layer, entry.rows, existingLayerCount(db, layer));
    }

    const { n: stagedTotal } = db
      .prepare(`SELECT COUNT(*) AS n FROM ${STAGING_TABLE}`)
      .get() as { n: number };
    const reportedTotal = staged.reduce((sum, entry) => sum + entry.rows, 0);
    if (stagedTotal !== reportedTotal) {
      throw new Error(
        `Staging collapsed ${reportedTotal - stagedTotal} duplicate natural keys; ` +
          "refusing to publish until the source/family/type/agreement/tract identity is verified.",
      );
    }

    const finishedAt = new Date().toISOString();
    db.transaction(() => {
      for (const entry of staged) entry.rowsDeleted = countRemovedRows(db, entry.sourceLayer);
      const removeLayer = db.prepare(
        "DELETE FROM dispositions WHERE source = 'geoview' AND source_layer = ?",
      );
      for (const entry of staged) removeLayer.run(entry.sourceLayer);
      db.prepare(
        `INSERT INTO dispositions (${PUBLISH_COLUMNS})
         SELECT ${PUBLISH_COLUMNS} FROM ${STAGING_TABLE}`,
      ).run();

      for (const entry of staged) {
        finishIngestRun(db, entry.runId, {
          rowsUpserted: entry.rows,
          rowsDeleted: entry.rowsDeleted,
          message: `Published ${entry.rows} rows; removed ${entry.rowsDeleted} stale rows`,
          finishedAt,
        });
      }
      finishIngestRun(db, batchRunId, {
        rowsUpserted: staged.reduce((sum, entry) => sum + entry.rows, 0),
        rowsDeleted: staged.reduce((sum, entry) => sum + entry.rowsDeleted, 0),
        message: `Published ${staged.length} mineral layers atomically`,
        finishedAt,
      });
    })();

    const results = staged.map((entry) => ({
      family: entry.src.family,
      sourceLayer: entry.sourceLayer,
      rows: entry.rows,
      rowsDeleted: entry.rowsDeleted,
    }));
    return {
      rows: results.reduce((sum, result) => sum + result.rows, 0),
      rowsDeleted: results.reduce((sum, result) => sum + result.rowsDeleted, 0),
      sources: results,
    };
  } catch (error: unknown) {
    const finishedAt = new Date().toISOString();
    db.transaction(() => {
      for (const entry of staged) failIngestRun(db, entry.runId, error, finishedAt);
      failIngestRun(db, batchRunId, error, finishedAt);
    })();
    throw error;
  } finally {
    db.exec(`DELETE FROM ${STAGING_TABLE}`);
  }
}

/** Pull and atomically replace one verified mineral source. */
export async function ingestMineralSource(
  db: DB,
  baseUrl: string,
  src: SourceDef,
): Promise<IngestResult> {
  const summary = await ingestMineralSources(db, baseUrl, [src]);
  return summary.sources[0];
}
