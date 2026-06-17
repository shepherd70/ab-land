/**
 * Basemap style + view helpers for the map view.
 *
 * Defaults to a free, attributed OpenStreetMap raster basemap (no API key, no
 * secrets). Override with NEXT_PUBLIC_MAP_STYLE to point at a provider style URL
 * (e.g. a keyed vector style) without code changes.
 *
 * @module lib/map/basemap
 * Data source: none (basemap tiles © OpenStreetMap contributors)
 * @see CLAUDE.md §4, §11
 */
import type { StyleSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

/** Self-contained OSM raster style — no API key required. */
const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/**
 * The basemap style to render: an env-provided style URL when set, otherwise the
 * attributed OSM raster style.
 */
export function getBasemapStyle(): StyleSpecification | string {
  return process.env.NEXT_PUBLIC_MAP_STYLE || OSM_RASTER_STYLE;
}

/** [[west, south], [east, north]] in WGS84. */
export type LngLatBounds = [[number, number], [number, number]];

/**
 * Bounding box enclosing every coordinate in a FeatureCollection, or null when
 * there are no coordinates. Walks nested coordinate arrays so it works for
 * Point/LineString/Polygon/MultiPolygon without depending on the geometry type.
 */
export function boundsOfFeatureCollection(fc: FeatureCollection): LngLatBounds | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const visit = (node: unknown): void => {
    if (
      Array.isArray(node) &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      const [lon, lat] = node as [number, number];
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    if (Array.isArray(node)) for (const child of node) visit(child);
  };

  for (const f of fc.features) {
    if (f.geometry && "coordinates" in f.geometry) visit(f.geometry.coordinates);
  }

  return Number.isFinite(minLon)
    ? [
        [minLon, minLat],
        [maxLon, maxLat],
      ]
    : null;
}
