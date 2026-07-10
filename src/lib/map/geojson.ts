/**
 * Turn normalized dispositions into a GeoJSON FeatureCollection for MapLibre.
 * DRYs the inline mapping that previously lived in the holding-detail page and
 * is reused by the /api/map/features route.
 *
 * @module lib/map/geojson
 * Data source: none (re-shapes already-validated DB rows)
 * @see CLAUDE.md §5
 */
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Disposition } from "../types";

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
 * Build a Point FeatureCollection from the precomputed parcel centroids,
 * dropping any row without one. Used when a holder's full polygons exceed the
 * payload budget (see lib/map/company_features) — same `pickProps` contract as
 * {@link dispositionsToFeatureCollection}.
 */
export function dispositionsToCentroidFeatureCollection(
  rows: Disposition[],
  pickProps: (d: Disposition) => Record<string, unknown>,
): FeatureCollection {
  const features: Feature[] = [];
  for (const d of rows) {
    if (!d.centroid) continue;
    features.push({
      type: "Feature",
      properties: pickProps(d),
      geometry: { type: "Point", coordinates: d.centroid },
    });
  }
  return { type: "FeatureCollection", features };
}
