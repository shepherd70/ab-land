/**
 * Read queries over the local SQLite store. The Next.js route handlers call
 * these; they never hit ArcGIS at request time.
 *
 * @module lib/db/queries
 * Data source: none (local SQLite)
 * @see CLAUDE.md §5
 */
import type { DB } from "./client";
import type { Disposition, MapCentroid, MineralFamily } from "../types";
import type { SearchParams } from "../schemas";
import type { HoldingsSummary } from "../tenure";
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
  target_substance: string | null;
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
  d.term_date, d.current_expiry_date, d.continuation_date, d.cancel_date, d.zone_desc, d.target_substance,
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
    targetSubstance: row.target_substance ?? undefined,
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
 * An alias-expanded `<column> IN (…)` fragment restricting rows to one
 * company's holdings, plus the values to bind. Broadened to known
 * alias/predecessor names — heuristic, never authoritative ownership
 * (see lib/matching/company_aliases).
 */
function holderNormClause(
  company: string,
  column: string,
  prefix = "holder",
): { clause: string; bind: Record<string, unknown> } {
  const keys = aliasGroupKeys(normalizeCompanyName(company));
  const bind: Record<string, unknown> = {};
  keys.forEach((k, i) => (bind[`${prefix}${i}`] = k));
  const placeholders = keys.map((_, i) => `@${prefix}${i}`).join(", ");
  return { clause: `${column} IN (${placeholders})`, bind };
}

/** A [minX, minY, maxX, maxY] viewport in WGS84. */
export type ViewportBbox = [number, number, number, number];

/** Options shared by the map queries. */
interface ViewportOpts {
  families?: MineralFamily[];
  status?: string;
  limit?: number;
  /** Restrict to one company's holdings (alias-expanded holder_norm match). */
  company?: string;
}

/**
 * Dispositions whose bounding box overlaps the given viewport, with full
 * geometry for rendering. Backed by the `dispositions_rtree` spatial index. The
 * R*Tree stores 32-bit float bounds, so it may over-include a few edge parcels;
 * for a map viewport that's harmless, so no exact refinement is done.
 */
export function featuresInViewport(
  db: DB,
  bbox: ViewportBbox,
  opts: ViewportOpts = {},
): Disposition[] {
  const [minx, miny, maxx, maxy] = bbox;
  const { families, status, limit = 2000, company } = opts;
  const clauses: string[] = [];
  const bind: Record<string, unknown> = { minx, miny, maxx, maxy, limit };
  if (families && families.length > 0) {
    const placeholders = families.map((_, i) => `@family${i}`).join(", ");
    clauses.push(`d.family IN (${placeholders})`);
    families.forEach((f, i) => (bind[`family${i}`] = f));
  }
  if (status) {
    clauses.push("d.status = @status");
    bind.status = status;
  }
  if (company) {
    const holder = holderNormClause(company, "d.holder_norm");
    clauses.push(holder.clause);
    Object.assign(bind, holder.bind);
  }
  const sql = `SELECT d.* FROM dispositions d
    JOIN dispositions_rtree r ON r.id = d.id
    WHERE r.minx <= @maxx AND r.maxx >= @minx AND r.miny <= @maxy AND r.maxy >= @miny
      ${clauses.length ? `AND ${clauses.join(" AND ")}` : ""}
    LIMIT @limit`;
  return (db.prepare(sql).all(bind) as DbRow[]).map(rowToDisposition);
}

/**
 * Every parcel with a known centroid as a lean record, for the clustered
 * province-wide overview. ~77k rows; a centroid-column scan runs in a few ms.
 */
export function centroidsAll(
  db: DB,
  opts: { families?: MineralFamily[]; company?: string } = {},
): MapCentroid[] {
  const { families, company } = opts;
  const bind: Record<string, unknown> = {};
  const clauses: string[] = [];
  if (families && families.length > 0) {
    const placeholders = families.map((_, i) => `@family${i}`).join(", ");
    clauses.push(`family IN (${placeholders})`);
    families.forEach((f, i) => (bind[`family${i}`] = f));
  }
  if (company) {
    const holder = holderNormClause(company, "holder_norm");
    clauses.push(holder.clause);
    Object.assign(bind, holder.bind);
  }
  const sql = `SELECT id, centroid_lon AS lon, centroid_lat AS lat, family, agreement_number, status
    FROM dispositions
    WHERE centroid_lon IS NOT NULL AND centroid_lat IS NOT NULL
      ${clauses.map((c) => `AND ${c}`).join(" ")}`;
  const rows = db.prepare(sql).all(bind) as {
    id: number;
    lon: number;
    lat: number;
    family: string;
    agreement_number: string;
    status: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    lon: r.lon,
    lat: r.lat,
    family: r.family as MineralFamily,
    agreementNumber: r.agreement_number,
    status: r.status ?? undefined,
  }));
}

/**
 * The merged bounding box of every parcel the company holds ([minX, minY,
 * maxX, maxY], WGS84) — computed server-side so the company map can frame its
 * holdings at construction without shipping centroids to the client. Null when
 * no matching row has a stored bbox. Same alias-expanded heuristic match as
 * {@link listByCompany}.
 */
export function companyBounds(db: DB, company: string): ViewportBbox | null {
  const { clause, bind } = holderNormClause(company, "holder_norm");
  const row = db
    .prepare(
      `SELECT MIN(bbox_minx) AS minx, MIN(bbox_miny) AS miny,
              MAX(bbox_maxx) AS maxx, MAX(bbox_maxy) AS maxy
       FROM dispositions WHERE ${clause} AND bbox_minx IS NOT NULL`,
    )
    .get(bind) as {
    minx: number | null;
    miny: number | null;
    maxx: number | null;
    maxy: number | null;
  };
  return row.minx == null || row.miny == null || row.maxx == null || row.maxy == null
    ? null
    : [row.minx, row.miny, row.maxx, row.maxy];
}

/** Options for {@link listByCompany}. */
export interface CompanyHoldingsOpts {
  /** Include the stored polygon GeoJSON. Large holders store tens of MB. */
  withGeometry?: boolean;
  /** Page size. Omit for every row — only safe when the caller bounds the output. */
  limit?: number;
  /** Rows to skip; requires `limit`. */
  offset?: number;
}

/**
 * Holdings whose normalized holder key matches the company query, broadened to
 * include known alias/predecessor names for the same entity (heuristic — see
 * lib/matching/company_aliases).
 *
 * Pass `limit` to page: the largest holder has ~15.5k parcels, and rendering
 * them all produced a 21 MB HTML document. Ordering is deterministic (id breaks
 * ties) so pages never overlap or drop a row.
 */
export function listByCompany(
  db: DB,
  company: string,
  opts: CompanyHoldingsOpts = {},
): Disposition[] {
  const { withGeometry = false, limit, offset = 0 } = opts;
  const cols = withGeometry ? "d.*" : SUMMARY_COLS;
  const { clause, bind } = holderNormClause(company, "d.holder_norm");
  const page = limit == null ? "" : "LIMIT @limit OFFSET @offset";
  if (limit != null) Object.assign(bind, { limit, offset });
  const rows = db
    .prepare(
      `SELECT ${cols} FROM dispositions d WHERE ${clause}
       ORDER BY d.agreement_number, d.tract, d.id ${page}`,
    )
    .all(bind) as DbRow[];
  return rows.map(rowToDisposition);
}

/**
 * Agreement- and parcel-level totals for a company, counted in SQL over every
 * matching row. The company page renders one page of holdings, so these totals
 * cannot be derived from the rows it holds. One agreement can span several
 * tracts, so "N agreements" is a DISTINCT count of the natural key's
 * (source, family, agreement_number) — never the row count.
 */
export function companyHoldingsSummary(db: DB, company: string): HoldingsSummary {
  const { clause, bind } = holderNormClause(company, "holder_norm");
  const row = db
    .prepare(
      `SELECT COUNT(*) AS parcels,
              COUNT(DISTINCT source || '/' || family || '/' || agreement_number) AS agreements
       FROM dispositions WHERE ${clause}`,
    )
    .get(bind) as { parcels: number; agreements: number };
  return { agreements: row.agreements, parcels: row.parcels };
}
