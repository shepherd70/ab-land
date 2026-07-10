/**
 * Turn normalized dispositions into a GeoJSON FeatureCollection for MapLibre.
 * DRYs the inline mapping that previously lived in the holding-detail page and
 * is reused by the /api/map/features route.
 *
 * @module lib/map/geojson
 * Data source: none (re-shapes already-validated DB rows)
 * @see CLAUDE.md §5
 */
import type { Feature, FeatureCollection, Geometry, Point } from "geojson";
import type { Disposition, MapCentroid, MineralFamily } from "../types";

/**
 * Build a FeatureCollection from dispositions, dropping any row without stored
 * geometry. `pickProps` selects the (lean) feature properties for each row —
 * keep this small, it is serialized to the client per viewport.
 */
export function dispositionsToFeatureCollection(
  rows: Disposition[],
  pickProps: (d: Disposition) => Record<string, unknown>,
): FeatureCollection {
  const features: Feature[] = [];
  for (const d of rows) {
    if (!d.geometryGeoJSON) continue;
    features.push({
      type: "Feature",
      properties: pickProps(d),
      geometry: JSON.parse(d.geometryGeoJSON) as Geometry,
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * Build the clustered-overview FeatureCollection from centroid rows. Served as
 * the body of /api/map/centroids so MapLibre can fetch it by URL and cluster in
 * its worker. Properties are the minimum the map reads: `family` drives the
 * unclustered-point color; `id` identifies the parcel for debugging.
 */
export function centroidsToFeatureCollection(
  rows: MapCentroid[],
): FeatureCollection<Point, { id: number; family: MineralFamily }> {
  return {
    type: "FeatureCollection",
    features: rows.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { id: c.id, family: c.family },
    })),
  };
}
