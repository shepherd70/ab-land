/**
 * @module test/geo
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import type { MultiPolygon, Polygon, Position } from "geojson";
import {
  areaHectares,
  computeBbox,
  computeCentroid,
  pointInPolygon,
  simplifyForMap,
} from "../lib/spatial/geo";

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

/**
 * A dense near-circular ring — mimics the natural-boundary parcels whose
 * vertex chains simplification is meant to collapse.
 */
function denseCircle(vertices = 256, radiusDeg = 0.05): Polygon {
  const ring: Position[] = [];
  for (let i = 0; i < vertices; i++) {
    const t = (2 * Math.PI * i) / vertices;
    ring.push([-114 + radiusDeg * Math.cos(t), 54 + radiusDeg * Math.sin(t)]);
  }
  ring.push([...ring[0]]);
  return { type: "Polygon", coordinates: [ring] };
}

function totalVertices(geom: Polygon | MultiPolygon): number {
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  return rings.reduce((n, r) => n + r.length, 0);
}

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

describe("simplifyForMap", () => {
  it("collapses a dense boundary and keeps the rings closed and valid", () => {
    const dense = denseCircle();
    const before = totalVertices(dense);
    const out = simplifyForMap(dense);
    expect(out).not.toBeNull();
    expect(out!.type).toBe("Polygon");
    expect(totalVertices(out!)).toBeLessThan(before * 0.8);
    const ring = (out as Polygon).coordinates[0];
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // The input must never be mutated — the full geometry is stored separately.
    expect(totalVertices(dense)).toBe(before);
  });

  it("returns null for already-lean geometries (the common DLS rectangle)", () => {
    expect(simplifyForMap(unitSquare)).toBeNull();
  });

  it("returns null when simplification saves too little to store a copy", () => {
    // A coarse zigzag: every vertex deviates far beyond the ~1e-4° tolerance,
    // so Douglas-Peucker keeps them all and the copy would be pure overhead.
    const ring: Position[] = [];
    for (let i = 0; i < 100; i++) ring.push([-114 + i * 0.01, 54 + (i % 2) * 0.01]);
    ring.push([-114 + 99 * 0.01, 53]);
    ring.push([-114, 53]);
    ring.push([...ring[0]]);
    const zigzag: Polygon = { type: "Polygon", coordinates: [ring] };
    expect(simplifyForMap(zigzag)).toBeNull();
  });

  it("returns null for non-polygon geometry", () => {
    expect(simplifyForMap({ type: "Point", coordinates: [-114, 54] })).toBeNull();
    expect(
      simplifyForMap({
        type: "LineString",
        coordinates: Array.from({ length: 100 }, (_, i) => [-114 + i * 0.001, 54]),
      }),
    ).toBeNull();
  });

  it("simplifies each part of a dense MultiPolygon", () => {
    const a = denseCircle(200, 0.05);
    const b = denseCircle(200, 0.02);
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [a.coordinates, b.coordinates],
    };
    const before = totalVertices(multi);
    const out = simplifyForMap(multi);
    expect(out).not.toBeNull();
    expect(out!.type).toBe("MultiPolygon");
    expect(totalVertices(out!)).toBeLessThan(before * 0.8);
  });
});
