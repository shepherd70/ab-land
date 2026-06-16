/**
 * @module test/geo
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { areaHectares, computeBbox, computeCentroid, pointInPolygon } from "../lib/spatial/geo";

const unitSquare: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  ],
};

describe("spatial helpers", () => {
  it("computes a bbox", () => {
    expect(computeBbox(unitSquare)).toEqual([0, 0, 1, 1]);
  });

  it("computes a centroid near the middle", () => {
    const [lon, lat] = computeCentroid(unitSquare);
    expect(lon).toBeCloseTo(0.5, 5);
    expect(lat).toBeCloseTo(0.5, 5);
  });

  it("tests point-in-polygon", () => {
    expect(pointInPolygon(0.5, 0.5, unitSquare)).toBe(true);
    expect(pointInPolygon(2, 2, unitSquare)).toBe(false);
  });

  it("reports a positive area", () => {
    expect(areaHectares(unitSquare)).toBeGreaterThan(0);
  });
});
