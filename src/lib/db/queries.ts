/**
 * Read queries over the local SQLite store. The Next.js route handlers call
 * these; they never hit ArcGIS at request time.
 *
 * @module lib/db/queries
 * Data source: none (local SQLite)
 * @see CLAUDE.md §5
 */
import type { DB } from "./client";
import type { Disposition } from "../types";
import type { SearchParams } from "../schemas";
import { normalizeCompanyName } from "../matching/company_names";
import { aliasGroupKeys } from "../matching/company_aliases";
import { parseAts, type AtsLocation } from "../ats";
import { atsApproxBbox } from "../spatial/ats_grid";

/** Raw row shape as stored. */
interface DbRow {
  id: number;
  source: string;
  family: string;
  source_layer: string | null;
  agreement_type: string | null;
  agreement_number: string;
  tract: string | null;
  status: string | null;
  holder_desrep: string | null;
  holder_desrep_id: string | null;
  participants: string | null;
  holder_norm: string | null;
  term_date: string | null;
  current_expiry_date: string | null;
  continuation_date: string | null;
  cancel_date: string | null;
  zone_desc: string | null;
  area_ha: number | null;
  centroid_lon: number | null;
  centroid_lat: number | null;
  bbox_minx: number | null;
  bbox_miny: number | null;
  bbox_maxx: number | null;
  bbox_maxy: number | null;
  geometry_geojson: string | null;
  ingested_at: string;
}

/** Summary columns (geometry omitted) — all aliased to `d` for join safety. */
const SUMMARY_COLS = `
  d.id, d.source, d.family, d.source_layer, d.agreement_type, d.agreement_number, d.tract, d.status,
  d.holder_desrep, d.holder_desrep_id, d.participants, d.holder_norm,
  d.term_date, d.current_expiry_date, d.continuation_date, d.cancel_date, d.zone_desc,
  d.area_ha, d.centroid_lon, d.centroid_lat, d.bbox_minx, d.bbox_miny, d.bbox_maxx, d.bbox_maxy,
  NULL AS geometry_geojson, d.ingested_at`;

/** Map a DB row to the domain Disposition. */
export function rowToDisposition(row: DbRow): Disposition {
  return {
    id: row.id,
    source: row.source as Disposition["source"],
    family: row.family as Disposition["family"],
    sourceLayer: row.source_layer ?? undefined,
    agreementType: row.agreement_type ?? undefined,
    agreementNumber: row.agreement_number,
    tract: row.tract ?? undefined,
    status: row.status ?? undefined,
    holderDesrep: row.holder_desrep ?? undefined,
    holderDesrepId: row.holder_desrep_id ?? undefined,
    participants: row.participants ? (JSON.parse(row.participants) as string[]) : undefined,
    holderNorm: row.holder_norm ?? undefined,
    termDate: row.term_date ?? undefined,
    currentExpiryDate: row.current_expiry_date ?? undefined,
    continuationDate: row.continuation_date ?? undefined,
    cancelDate: row.cancel_date ?? undefined,
    zoneDesc: row.zone_desc ?? undefined,
    areaHa: row.area_ha ?? undefined,
    centroid:
      row.centroid_lon != null && row.centroid_lat != null
        ? [row.centroid_lon, row.centroid_lat]
        : undefined,
    bbox:
      row.bbox_minx != null && row.bbox_miny != null && row.bbox_maxx != null && row.bbox_maxy != null
        ? [row.bbox_minx, row.bbox_miny, row.bbox_maxx, row.bbox_maxy]
        : undefined,
    geometryGeoJSON: row.geometry_geojson ?? undefined,
    ingestedAt: row.ingested_at,
  };
}

/** Build a safe FTS5 prefix MATCH expression from free text. */
function toFtsMatch(q: string): string {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(" ");
}

/** Dispatch a search by kind. Returns list summaries (no geometry). */
export function searchDispositions(db: DB, params: SearchParams): Disposition[] {
  const { q, kind, family, limit, offset } = params;

  if (kind === "agreement") {
    const sql = `SELECT ${SUMMARY_COLS} FROM dispositions d
      WHERE d.agreement_number LIKE @like ${family ? "AND d.family = @family" : ""}
      ORDER BY d.agreement_number LIMIT @limit OFFSET @offset`;
    const bind: Record<string, unknown> = { like: `${q}%`, limit, offset };
    if (family) bind.family = family;
    return (db.prepare(sql).all(bind) as DbRow[]).map(rowToDisposition);
  }

  // ATS: explicit kind, or auto when the query parses as a legal land description.
  // Uses an approximate DLS grid bbox (lib/spatial/ats_grid) as a coarse filter;
  // the authoritative ATS_Grid_Ext_PROD join is a network-dependent follow-up.
  if (kind === "ats" || kind === "auto") {
    const loc = parseAts(q);
    if (loc) return searchByAts(db, loc, { family, limit, offset });
    if (kind === "ats") return []; // explicit ATS query that isn't a valid descriptor
  }

  // company / auto fallback -> full-text search on holder + participants + number.
  const match = toFtsMatch(q);
  if (!match) return [];
  const sql = `SELECT ${SUMMARY_COLS} FROM dispositions d
    JOIN dispositions_fts f ON f.rowid = d.id
    WHERE dispositions_fts MATCH @match ${family ? "AND d.family = @family" : ""}
    ORDER BY rank LIMIT @limit OFFSET @offset`;
  const bind: Record<string, unknown> = { match, limit, offset };
  if (family) bind.family = family;
  return (db.prepare(sql).all(bind) as DbRow[]).map(rowToDisposition);
}

/**
 * Dispositions whose stored bbox overlaps the approximate ATS cell. A coarse
 * spatial pre-filter, not an authoritative parcel match (see ats_grid).
 */
function searchByAts(
  db: DB,
  loc: AtsLocation,
  opts: { family?: string; limit: number; offset: number },
): Disposition[] {
  const { family, limit, offset } = opts;
  const [minx, miny, maxx, maxy] = atsApproxBbox(loc);
  const sql = `SELECT ${SUMMARY_COLS} FROM dispositions d
    WHERE d.bbox_minx IS NOT NULL
      AND d.bbox_minx <= @maxx AND d.bbox_maxx >= @minx
      AND d.bbox_miny <= @maxy AND d.bbox_maxy >= @miny
      ${family ? "AND d.family = @family" : ""}
    ORDER BY d.agreement_number, d.tract LIMIT @limit OFFSET @offset`;
  const bind: Record<string, unknown> = { minx, miny, maxx, maxy, limit, offset };
  if (family) bind.family = family;
  return (db.prepare(sql).all(bind) as DbRow[]).map(rowToDisposition);
}

/** All tracts of a given agreement number (full geometry included). */
export function getByAgreementNumber(db: DB, agreementNumber: string): Disposition[] {
  const rows = db
    .prepare(`SELECT * FROM dispositions WHERE agreement_number = ? ORDER BY tract`)
    .all(agreementNumber) as DbRow[];
  return rows.map(rowToDisposition);
}

/**
 * All holdings whose normalized holder key matches the company query, broadened
 * to include known alias/predecessor names for the same entity (heuristic — see
 * lib/matching/company_aliases).
 */
export function listByCompany(db: DB, company: string, withGeometry = false): Disposition[] {
  const cols = withGeometry ? "d.*" : SUMMARY_COLS;
  const keys = aliasGroupKeys(normalizeCompanyName(company));
  const placeholders = keys.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT ${cols} FROM dispositions d WHERE d.holder_norm IN (${placeholders})
       ORDER BY d.agreement_number, d.tract`,
    )
    .all(...keys) as DbRow[];
  return rows.map(rowToDisposition);
}
