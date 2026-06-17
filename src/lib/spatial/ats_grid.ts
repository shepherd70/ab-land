/**
 * Approximate Alberta Township System (ATS / DLS) → WGS84 conversion.
 *
 * Computes an APPROXIMATE bounding box for a legal land description using the
 * regular DLS grid (townships 6 mi tall, ranges 6 mi wide from each meridian,
 * 36 serpentine sections, quarters, LSDs). It deliberately IGNORES road
 * allowances and survey corrections, so it is suitable only as a coarse spatial
 * pre-filter — never as an authoritative parcel boundary.
 *
 * The authoritative approach (documented follow-up) is to join the GeoView
 * `ATS_Grid_Ext_PROD` layer; that needs network access and is out of scope here.
 *
 * @module lib/spatial/ats_grid
 * Data source: none (regular-grid arithmetic; not the authoritative ATS layer)
 * @see CLAUDE.md §1, §2 (Tier A follow-up)
 */
import type { AtsLocation } from "../ats";

const MILE_KM = 1.609344;
const DEG_LAT_KM = 110.574; // km per degree of latitude (≈constant)
const DEG_LON_KM_EQUATOR = 111.32; // km per degree of longitude at the equator

/** Degrees of latitude per mile (north–south is ~constant). */
const MILE_LAT_DEG = MILE_KM / DEG_LAT_KM;

/** East longitude (negative = west) of the base of each meridian. */
const MERIDIAN_LON: Readonly<Record<4 | 5 | 6, number>> = { 4: -110, 5: -114, 6: -118 };

/** [minLon, minLat, maxLon, maxLat] in WGS84. */
export type Bbox = [number, number, number, number];

/** Column index from the west edge (0..size-1) for a serpentine-numbered cell. */
function colFromWest(index0: number, perRow: number, rowFromSouth: number): number {
  const idx = index0 % perRow;
  // Even rows (from south) are numbered east→west; odd rows west→east.
  return rowFromSouth % 2 === 0 ? perRow - 1 - idx : idx;
}

/**
 * Approximate WGS84 bounding box for an ATS location. Granularity follows the
 * descriptor: LSD (¼ mi) > quarter (½ mi) > section (1 mi).
 */
export function atsApproxBbox(loc: AtsLocation): Bbox {
  const { section, township, range, meridian, quarter, lsd } = loc;

  // Township south edge: township 1's south boundary is the 49th parallel.
  const twpSouthLat = 49 + (township - 1) * 6 * MILE_LAT_DEG;
  const twpMidLatRad = ((twpSouthLat + 3 * MILE_LAT_DEG) * Math.PI) / 180;

  // Range (east–west) width in degrees varies with latitude.
  const degLonKm = DEG_LON_KM_EQUATOR * Math.cos(twpMidLatRad);
  const rangeWidthDeg = (6 * MILE_KM) / degLonKm;
  const sectionWidthDeg = rangeWidthDeg / 6;

  // Range 1's east edge is at the meridian; higher ranges go west (smaller lon).
  const twpWestLon = MERIDIAN_LON[meridian] - range * rangeWidthDeg;

  // Section position within the 6×6 township (serpentine; section 1 at SE).
  const sRow = Math.floor((section - 1) / 6);
  const secWestLon = twpWestLon + colFromWest(section - 1, 6, sRow) * sectionWidthDeg;
  const secSouthLat = twpSouthLat + sRow * MILE_LAT_DEG;

  // Narrow to LSD, else quarter, else whole section.
  if (lsd != null) {
    const w = sectionWidthDeg / 4;
    const h = MILE_LAT_DEG / 4;
    const lRow = Math.floor((lsd - 1) / 4);
    const west = secWestLon + colFromWest(lsd - 1, 4, lRow) * w;
    const south = secSouthLat + lRow * h;
    return [west, south, west + w, south + h];
  }

  if (quarter) {
    const w = sectionWidthDeg / 2;
    const h = MILE_LAT_DEG / 2;
    const west = secWestLon + (quarter.includes("E") ? w : 0);
    const south = secSouthLat + (quarter.includes("N") ? h : 0);
    return [west, south, west + w, south + h];
  }

  return [secWestLon, secSouthLat, secWestLon + sectionWidthDeg, secSouthLat + MILE_LAT_DEG];
}

/** Approximate [lon, lat] centroid for an ATS location. */
export function atsApproxCentroid(loc: AtsLocation): [number, number] {
  const [minLon, minLat, maxLon, maxLat] = atsApproxBbox(loc);
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}
