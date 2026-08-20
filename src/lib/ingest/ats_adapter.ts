/**
 * Atomic offline ingest of the authoritative GeoView ATS legal-subdivision grid.
 *
 * @module lib/ingest/ats_adapter
 * Data source: GeoView ATS_Grid_Ext_PROD/4 (open, OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A), §3, §5
 */
import type { MultiPolygon, Polygon } from "geojson";
import type { DB } from "../db/client";
import { AtsLsdProps, AtsPolygonGeometry, type ArcGisFeature } from "../schemas";
import { computeBbox } from "../spatial/geo";
import { quarterCodeForLsd } from "../ats";
import { queryFeatureCount, queryFeatures } from "./arcgis_client";
import { failIngestRun, finishIngestRun, startIngestRun } from "./run_log";

const STAGING_TABLE = "ats_lsd_cells_next";
const OUT_FIELDS = [
  "ObjectID",
  "t18809Meridian",
  "t18809Range",
  "t18809Township",
  "t18809Section",
  "t18809QuarterSection",
  "t18809Lsd",
].join(",");

export interface AtsGridSource {
  service: string;
  layerId: number;
}

export interface AtsLsdCell {
  meridian: number;
  range: number;
  township: number;
  section: number;
  lsd: number;
  bbox: [number, number, number, number];
  geometryGeoJSON: string;
}

export interface AtsIngestOptions {
  pageSize?: number;
  throttleMs?: number;
  geometryPrecision?: number;
  signal?: AbortSignal;
  onProgress?: (rows: number, expected: number) => void;
}

export interface AtsIngestResult {
  /** Unique legal-subdivision cells published to the cache. */
  rows: number;
  /** ArcGIS features downloaded; split cells can contribute multiple features. */
  sourceFeatures: number;
  /** Extra source features combined into MultiPolygon cells. */
  mergedFeatures: number;
  previousRows: number;
  sourceLayer: string;
}

interface StoredAtsCell {
  bbox_minx: number;
  bbox_miny: number;
  bbox_maxx: number;
  bbox_maxy: number;
  geometry_geojson: string;
}

function configuredInteger(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
}

function createStagingTable(db: DB): void {
  db.exec(`
    DROP TABLE IF EXISTS ${STAGING_TABLE};
    CREATE TABLE ${STAGING_TABLE} (
      meridian         INTEGER NOT NULL,
      range_no         INTEGER NOT NULL,
      township         INTEGER NOT NULL,
      section_no       INTEGER NOT NULL,
      lsd              INTEGER NOT NULL,
      bbox_minx        REAL NOT NULL,
      bbox_miny        REAL NOT NULL,
      bbox_maxx        REAL NOT NULL,
      bbox_maxy        REAL NOT NULL,
      geometry_geojson TEXT NOT NULL,
      PRIMARY KEY (meridian, range_no, township, section_no, lsd)
    ) WITHOUT ROWID;
  `);
}

/** Validate and normalize one layer-4 GeoJSON feature for SQLite storage. */
export function normalizeAtsLsd(feature: ArcGisFeature): AtsLsdCell {
  const props = AtsLsdProps.parse(feature.properties);
  const geometry = AtsPolygonGeometry.parse(feature.geometry) as Polygon | MultiPolygon;
  const expectedQuarter = quarterCodeForLsd(props.t18809Lsd);
  if (props.t18809QuarterSection !== expectedQuarter) {
    throw new Error(
      `ATS ObjectID ${props.ObjectID} has quarter code ${props.t18809QuarterSection}, ` +
        `but LSD ${props.t18809Lsd} belongs to quarter code ${expectedQuarter}`,
    );
  }
  return {
    meridian: props.t18809Meridian,
    range: props.t18809Range,
    township: props.t18809Township,
    section: props.t18809Section,
    lsd: props.t18809Lsd,
    bbox: computeBbox(geometry),
    geometryGeoJSON: JSON.stringify(geometry),
  };
}

function polygonParts(geometry: Polygon | MultiPolygon): MultiPolygon["coordinates"] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Combine disconnected source pieces belonging to one official LSD key. */
function mergeAtsCell(existing: StoredAtsCell, incoming: AtsLsdCell): AtsLsdCell {
  const existingGeometry = AtsPolygonGeometry.parse(
    JSON.parse(existing.geometry_geojson),
  ) as Polygon | MultiPolygon;
  const incomingGeometry = AtsPolygonGeometry.parse(
    JSON.parse(incoming.geometryGeoJSON),
  ) as Polygon | MultiPolygon;
  return {
    ...incoming,
    bbox: [
      Math.min(existing.bbox_minx, incoming.bbox[0]),
      Math.min(existing.bbox_miny, incoming.bbox[1]),
      Math.max(existing.bbox_maxx, incoming.bbox[2]),
      Math.max(existing.bbox_maxy, incoming.bbox[3]),
    ],
    geometryGeoJSON: JSON.stringify({
      type: "MultiPolygon",
      coordinates: [...polygonParts(existingGeometry), ...polygonParts(incomingGeometry)],
    } satisfies MultiPolygon),
  };
}

function liveRowCount(db: DB): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM ats_lsd_cells").get() as { n: number };
  return row.n;
}

/**
 * Download the complete official LSD layer into an on-disk staging table,
 * verify it against stable start/end server counts, then publish by atomic
 * table swap. Readers see either the old complete cache or the new one.
 */
export async function ingestAtsGrid(
  db: DB,
  baseUrl: string,
  source: AtsGridSource,
  options: AtsIngestOptions = {},
): Promise<AtsIngestResult> {
  const sourceLayer = `${source.service}/${source.layerId}`;
  const runId = startIngestRun(db, {
    source: "geoview-ats",
    sourceLayer,
    message: "Refreshing authoritative ATS legal-subdivision grid",
  });
  const previousRows = liveRowCount(db);
  let rows = 0;
  let mergedFeatures = 0;

  try {
    createStagingTable(db);
    const countOptions = { baseUrl, ...source, signal: options.signal };
    const expectedAtStart = await queryFeatureCount(countOptions);
    if (expectedAtStart === 0) {
      throw new Error("The authoritative ATS layer reported zero rows; refusing to publish");
    }

    const insert = db.prepare(
      `INSERT INTO ${STAGING_TABLE} (
         meridian, range_no, township, section_no, lsd,
         bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, geometry_geojson
       ) VALUES (
         @meridian, @range, @township, @section, @lsd,
         @minx, @miny, @maxx, @maxy, @geometryGeoJSON
       ) ON CONFLICT (meridian, range_no, township, section_no, lsd) DO NOTHING`,
    );
    const getStaged = db.prepare(
      `SELECT bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, geometry_geojson
       FROM ${STAGING_TABLE}
       WHERE meridian = @meridian AND range_no = @range
         AND township = @township AND section_no = @section AND lsd = @lsd`,
    );
    const updateStaged = db.prepare(
      `UPDATE ${STAGING_TABLE}
       SET bbox_minx = @minx, bbox_miny = @miny,
           bbox_maxx = @maxx, bbox_maxy = @maxy,
           geometry_geojson = @geometryGeoJSON
       WHERE meridian = @meridian AND range_no = @range
         AND township = @township AND section_no = @section AND lsd = @lsd`,
    );
    const flush = db.transaction((cells: AtsLsdCell[]) => {
      for (const cell of cells) {
        const bind = {
          meridian: cell.meridian,
          range: cell.range,
          township: cell.township,
          section: cell.section,
          lsd: cell.lsd,
          minx: cell.bbox[0],
          miny: cell.bbox[1],
          maxx: cell.bbox[2],
          maxy: cell.bbox[3],
          geometryGeoJSON: cell.geometryGeoJSON,
        };
        const result = insert.run(bind);
        if (result.changes === 0) {
          const existing = getStaged.get(bind) as StoredAtsCell | undefined;
          if (!existing) throw new Error("ATS staging conflict could not load its existing cell");
          const merged = mergeAtsCell(existing, cell);
          updateStaged.run({
            ...bind,
            minx: merged.bbox[0],
            miny: merged.bbox[1],
            maxx: merged.bbox[2],
            maxy: merged.bbox[3],
            geometryGeoJSON: merged.geometryGeoJSON,
          });
          mergedFeatures += 1;
        }
      }
    });
    const pageSize = options.pageSize ?? configuredInteger("ATS_INGEST_PAGE_SIZE", 5000, 50_000);
    const batch: AtsLsdCell[] = [];

    for await (const feature of queryFeatures({
      baseUrl,
      ...source,
      outFields: OUT_FIELDS,
      pageSize: pageSize || 5000,
      throttleMs:
        options.throttleMs ?? configuredInteger("ATS_INGEST_THROTTLE_MS", 100, 60_000),
      geometryPrecision:
        options.geometryPrecision ?? configuredInteger("ATS_GEOMETRY_PRECISION", 6, 15),
      orderByFields: "ObjectID ASC",
      signal: options.signal,
    })) {
      batch.push(normalizeAtsLsd(feature));
      rows += 1;
      if (batch.length >= (pageSize || 5000)) {
        flush(batch.splice(0));
        options.onProgress?.(rows, expectedAtStart);
      }
    }
    if (batch.length) flush(batch.splice(0));
    options.onProgress?.(rows, expectedAtStart);

    const expectedAtEnd = await queryFeatureCount(countOptions);
    const stagedRows = db
      .prepare(`SELECT COUNT(*) AS n FROM ${STAGING_TABLE}`)
      .get() as { n: number };
    if (
      expectedAtStart !== expectedAtEnd ||
      rows !== expectedAtStart ||
      stagedRows.n + mergedFeatures !== rows
    ) {
      throw new Error(
        `ATS snapshot validation failed: source count ${expectedAtStart}→${expectedAtEnd}, ` +
          `${rows} downloaded, ${stagedRows.n} unique staged cells, ` +
          `${mergedFeatures} split features merged`,
      );
    }

    const finishedAt = new Date().toISOString();
    db.transaction(() => {
      db.exec("DROP TABLE ats_lsd_cells");
      db.exec(`ALTER TABLE ${STAGING_TABLE} RENAME TO ats_lsd_cells`);
      finishIngestRun(db, runId, {
        rowsUpserted: stagedRows.n,
        rowsDeleted: 0,
        message:
          `Published ${stagedRows.n} authoritative LSD cells from ${rows} source features; ` +
          `merged ${mergedFeatures} split features; replaced ${previousRows}`,
        finishedAt,
      });
    })();
    return {
      rows: stagedRows.n,
      sourceFeatures: rows,
      mergedFeatures,
      previousRows,
      sourceLayer,
    };
  } catch (error: unknown) {
    failIngestRun(db, runId, error);
    db.exec(`DROP TABLE IF EXISTS ${STAGING_TABLE}`);
    throw error;
  }
}
