/**
 * Spatial helpers over GeoJSON (WGS84). The DB does not run spatial SQL, so
 * bbox/centroid are precomputed on ingest and point-in-polygon runs here.
 *
 * @module lib/spatial/geo
 * Data source: none (operates on already-fetched GeoJSON)
 * @see CLAUDE.md §5, §6
 */
import { area, bbox, booleanPointInPolygon, centroid } from "@turf/turf";
import type { Feature, Geometry, MultiPolygon, Polygon } from "geojson";

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
