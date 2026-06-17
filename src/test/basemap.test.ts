/**
 * Tests for the map basemap style selection and data-bounds helper.
 *
 * @module test/basemap
 * @see CLAUDE.md §10
 */
import { afterEach, describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import { boundsOfFeatureCollection, getBasemapStyle } from "../lib/map/basemap";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_MAP_STYLE;
});

describe("getBasemapStyle", () => {
  it("defaults to an attributed OpenStreetMap raster style", () => {
    const style = getBasemapStyle();
    expect(typeof style).not.toBe("string");
    if (typeof style === "string") throw new Error("expected a style object");
    const osm = style.sources.osm;
    expect(osm.type).toBe("raster");
    expect(JSON.stringify(osm)).toContain("OpenStreetMap");
  });

  it("honors a NEXT_PUBLIC_MAP_STYLE override", () => {
    process.env.NEXT_PUBLIC_MAP_STYLE = "https://example.com/style.json";
    expect(getBasemapStyle()).toBe("https://example.com/style.json");
  });
});

describe("boundsOfFeatureCollection", () => {
  const polygon: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-114.2, 51.0],
              [-114.2, 51.1],
              [-114.0, 51.1],
              [-114.0, 51.0],
              [-114.2, 51.0],
            ],
          ],
        },
      },
    ],
  };

  it("encloses every coordinate", () => {
    expect(boundsOfFeatureCollection(polygon)).toEqual([
      [-114.2, 51.0],
      [-114.0, 51.1],
    ]);
  });

  it("returns null for an empty collection", () => {
    expect(boundsOfFeatureCollection({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});
