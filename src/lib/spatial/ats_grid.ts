/**
 * Exact offline lookup of authoritative Alberta Township System LSD polygons.
 *
 * @module lib/spatial/ats_grid
 * Data source: GeoView ATS_Grid_Ext_PROD/4 (open, OGL-Alberta), cached in SQLite
 * @see CLAUDE.md §2 (Tier A), §3, §5
 */
import type { MultiPolygon, Polygon } from "geojson";
import type { AtsLocation } from "../ats";
import { lsdsForQuarter } from "../ats";
import type { DB } from "../db/client";
import { AtsPolygonGeometry } from "../schemas";

/** [minX, minY, maxX, maxY] in WGS84. */
export type Bbox = [number, number, number, number];

/** One authoritative legal-subdivision cell selected from the local cache. */
export interface AtsGridCell {
  lsd: number;
  bbox: Bbox;
  geometry: Polygon | MultiPolygon;
}

interface AtsGridRow {
  lsd: number;
  bbox_minx: number;
  bbox_miny: number;
  bbox_maxx: number;
  bbox_maxy: number;
  geometry_geojson: string;
}

/** Raised when a legal-location search is attempted before the ATS cache exists. */
export class AtsGridUnavailableError extends Error {
  constructor() {
    super("Authoritative ATS data is unavailable; run `npm run ingest:ats` first.");
    this.name = "AtsGridUnavailableError";
  }
}

function ensureGridAvailable(db: DB): void {
  try {
    const row = db.prepare("SELECT 1 AS ok FROM ats_lsd_cells LIMIT 1").get();
    if (!row) throw new AtsGridUnavailableError();
  } catch (error: unknown) {
    if (error instanceof AtsGridUnavailableError) throw error;
    throw new AtsGridUnavailableError();
  }
}

/**
 * Load the 1, 4, or 16 official LSD polygons represented by a parsed ATS
 * descriptor. A valid descriptor outside the surveyed grid returns no cells.
 */
export function authoritativeAtsCells(db: DB, loc: AtsLocation): AtsGridCell[] {
  ensureGridAvailable(db);
  const bind: Record<string, number> = {
    meridian: loc.meridian,
    range: loc.range,
    township: loc.township,
    section: loc.section,
  };
  let subdivisionClause = "";

  if (loc.lsd != null) {
    subdivisionClause = "AND lsd = @lsd";
    bind.lsd = loc.lsd;
  } else if (loc.quarter) {
    const lsds = lsdsForQuarter(loc.quarter);
    const placeholders = lsds.map((lsd, index) => {
      bind[`lsd${index}`] = lsd;
      return `@lsd${index}`;
    });
    subdivisionClause = `AND lsd IN (${placeholders.join(", ")})`;
  }

  const rows = db
    .prepare(
      `SELECT lsd, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, geometry_geojson
       FROM ats_lsd_cells
       WHERE meridian = @meridian AND range_no = @range
         AND township = @township AND section_no = @section
         ${subdivisionClause}
       ORDER BY lsd`,
    )
    .all(bind) as AtsGridRow[];

  return rows.map((row) => ({
    lsd: row.lsd,
    bbox: [row.bbox_minx, row.bbox_miny, row.bbox_maxx, row.bbox_maxy],
    geometry: AtsPolygonGeometry.parse(JSON.parse(row.geometry_geojson)) as Polygon | MultiPolygon,
  }));
}

/** Bounding box covering a non-empty set of authoritative ATS cells. */
export function atsCellsBbox(cells: AtsGridCell[]): Bbox {
  if (cells.length === 0) throw new Error("Cannot compute an ATS bbox without cells");
  return cells.reduce<Bbox>(
    (bounds, cell) => [
      Math.min(bounds[0], cell.bbox[0]),
      Math.min(bounds[1], cell.bbox[1]),
      Math.max(bounds[2], cell.bbox[2]),
      Math.max(bounds[3], cell.bbox[3]),
    ],
    [...cells[0].bbox],
  );
}
