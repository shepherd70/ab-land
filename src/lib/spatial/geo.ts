/**
 * Spatial helpers over GeoJSON (WGS84). The DB does not run spatial SQL, so
 * bbox/centroid are precomputed on ingest and point-in-polygon runs here.
 *
 * @module lib/spatial/geo
 * Data source: none (operates on already-fetched GeoJSON)
 * @see CLAUDE.md §5, §6
 */
import { area, bbox, booleanPointInPolygon, centroid, simplify } from "@turf/turf";
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from "geojson";

type AnyGeom = Geometry | Feature<Geometry>;

/** [minX, minY, maxX, maxY] in WGS84. */
export function computeBbox(geom: AnyGeom): [number, number, number, number] {
  const b = bbox(geom);
  return [b[0], b[1], b[2], b[3]];
}

/** [lon, lat] centroid in WGS84. */
export function computeCentroid(geom: AnyGeom): [number, number] {
  const [lon, lat] = centroid(geom).geometry.coordinates;
  return [lon, lat];
}

/** Planar area in hectares. */
export function areaHectares(geom: AnyGeom): number {
  return area(geom) / 10_000;
}

/** Is the [lon, lat] point inside the polygon? */
export function pointInPolygon(
  lon: number,
  lat: number,
  poly: Polygon | MultiPolygon | Feature<Polygon | MultiPolygon>,
): boolean {
  return booleanPointInPolygon([lon, lat], poly);
}

/** Do two [minX, minY, maxX, maxY] bboxes overlap (edges touching counts)? */
export function bboxIntersects(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * Douglas-Peucker tolerance for the map-serving geometry copy, in degrees:
 * ~11 m N-S (~6.5 m E-W at Alberta latitudes). Invisible at the map's polygon
 * zooms (≥10, where one pixel spans ~90 m) yet collapses the natural-boundary
 * vertex chains that make giant parcels multi-MB.
 */
const SIMPLIFY_TOLERANCE_DEG = 0.0001;
/** Below this many vertices a geometry is already lean — skip the copy. */
const SIMPLIFY_MIN_VERTICES = 64;
/** Store the copy only when it drops at least this share of vertices. */
const SIMPLIFY_MIN_SAVING = 0.2;

/** Every linear ring of a (Multi)Polygon, flattened. */
function polygonRings(geom: Polygon | MultiPolygon): Position[][] {
  return geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
}

function vertexCount(geom: Polygon | MultiPolygon): number {
  return polygonRings(geom).reduce((n, ring) => n + ring.length, 0);
}

/** Are all rings still valid (≥4 positions, closed) after simplification? */
function ringsValid(geom: Polygon | MultiPolygon): boolean {
  return polygonRings(geom).every((ring) => {
    if (ring.length < 4) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1];
  });
}

/**
 * A map-serving simplified copy of a parcel polygon, or null when the original
 * should be served as-is. Null means: not a (Multi)Polygon, already lean
 * (most parcels are simple DLS rectangles), simplification saved too little to
 * justify a second stored copy, or it produced a degenerate ring. Never use
 * the result for area/containment math — display only.
 */
export function simplifyForMap(geom: Geometry): Polygon | MultiPolygon | null {
  if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") return null;
  const before = vertexCount(geom);
  if (before < SIMPLIFY_MIN_VERTICES) return null;
  let simplified: Polygon | MultiPolygon;
  try {
    simplified = simplify(geom, {
      tolerance: SIMPLIFY_TOLERANCE_DEG,
      highQuality: false,
      mutate: false,
    });
  } catch {
    return null; // turf rejects some degenerate inputs — serve the original
  }
  if (!ringsValid(simplified)) return null;
  if (vertexCount(simplified) > before * (1 - SIMPLIFY_MIN_SAVING)) return null;
  return simplified;
}
