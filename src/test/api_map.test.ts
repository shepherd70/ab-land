/**
 * Route-handler tests for the map API. The handlers open their own read-only
 * connection to DEFAULT_DB_PATH, which is frozen at client-module import time —
 * so we point DB_PATH at a temp file and use dynamic import() after setting the
 * env, seeding through the same (cached) client module the routes will use.
 *
 * @module test/api_map
 * @see CLAUDE.md §10
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
import type { FeatureCollection, Point } from "geojson";
import type { MapCentroid } from "@/lib/types";

const DB_FILE = join(tmpdir(), `ab-land-api-map-${process.pid}.sqlite`);
const prevDbPath = process.env.DB_PATH;

beforeAll(async () => {
  process.env.DB_PATH = DB_FILE;
  // Seed through the same client module the routes will import.
  const { openDb, applySchema } = await import("@/lib/db/client");
  const { prepareUpsert } = await import("@/lib/ingest/upsert");
  const db = openDb(DB_FILE);
  applySchema(db);
  const upsert = prepareUpsert(db);
  const at = (n: string, fam: string, lon: number, lat: number, holderNorm?: string) => ({
    source: "geoview" as const,
    family: fam as MapCentroid["family"],
    agreementNumber: n,
    tract: "01",
    holderNorm,
    centroid: [lon, lat] as [number, number],
    bbox: [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01] as [number, number, number, number],
    geometryGeoJSON: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [lon - 0.01, lat - 0.01],
          [lon + 0.01, lat - 0.01],
          [lon + 0.01, lat + 0.01],
          [lon - 0.01, lat + 0.01],
          [lon - 0.01, lat - 0.01],
        ],
      ],
    }),
    ingestedAt: new Date().toISOString(),
  });
  const { normalizeCompanyName } = await import("@/lib/matching/company_names");
  upsert(at("0500001", "png", -114.0, 51.0, normalizeCompanyName("ACME ENERGY LTD")));
  upsert(at("0500003", "geothermal", -113.0, 57.0, normalizeCompanyName("OTHER RESOURCES INC")));
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
});

afterAll(() => {
  for (const ext of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${ext}`, { force: true });
  if (prevDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = prevDbPath;
  vi.resetModules();
});

/** The lean centroid-point contract served for worker-side clustering. */
type CentroidFC = FeatureCollection<Point, { id: number; family: string }>;

describe("GET /api/map/centroids", () => {
  it("returns every centroid as a lean GeoJSON point feature", async () => {
    const { GET } = await import("@/app/api/map/centroids/route");
    const res = GET(new NextRequest("http://test/api/map/centroids"));
    expect(res.status).toBe(200);
    const fc = (await res.json()) as CentroidFC;
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features.map((f) => f.properties.family).sort()).toEqual(["geothermal", "png"]);
    const png = fc.features.find((f) => f.properties.family === "png")!;
    expect(png.geometry).toEqual({ type: "Point", coordinates: [-114.0, 51.0] });
    expect(typeof png.properties.id).toBe("number");
    // Lean contract: nothing beyond what the map layers read.
    expect(Object.keys(png.properties).sort()).toEqual(["family", "id"]);
  });

  it("filters by family", async () => {
    const { GET } = await import("@/app/api/map/centroids/route");
    const res = GET(new NextRequest("http://test/api/map/centroids?families=geothermal"));
    const fc = (await res.json()) as CentroidFC;
    expect(fc.features.map((f) => f.properties.family)).toEqual(["geothermal"]);
  });

  it("filters by company (name-variant match via normalization)", async () => {
    const { GET } = await import("@/app/api/map/centroids/route");
    const res = GET(
      new NextRequest("http://test/api/map/centroids?company=Acme%20Energy%20Ltd."),
    );
    const fc = (await res.json()) as CentroidFC;
    expect(fc.features).toHaveLength(1);
    // The seeded ACME parcel is the PNG one at [-114, 51].
    expect(fc.features[0].properties.family).toBe("png");
    expect(fc.features[0].geometry.coordinates).toEqual([-114.0, 51.0]);
  });
});

describe("GET /api/map/features", () => {
  it("returns a FeatureCollection of polygons overlapping the bbox", async () => {
    const { GET } = await import("@/app/api/map/features/route");
    const res = GET(
      new NextRequest("http://test/api/map/features?bbox=-114.3,50.8,-113.8,51.2"),
    );
    expect(res.status).toBe(200);
    const fc = (await res.json()) as FeatureCollection;
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties?.agreementNumber).toBe("0500001");
    expect(fc.features[0].geometry.type).toBe("Polygon");
  });

  it("filters by company within the bbox", async () => {
    const { GET } = await import("@/app/api/map/features/route");
    const inRange = GET(
      new NextRequest(
        "http://test/api/map/features?bbox=-114.3,50.8,-113.8,51.2&company=acme%20energy",
      ),
    );
    expect(((await inRange.json()) as FeatureCollection).features).toHaveLength(1);
    const wrongCompany = GET(
      new NextRequest(
        "http://test/api/map/features?bbox=-114.3,50.8,-113.8,51.2&company=Other%20Resources",
      ),
    );
    expect(((await wrongCompany.json()) as FeatureCollection).features).toHaveLength(0);
  });

  it("rejects an invalid bbox with 400", async () => {
    const { GET } = await import("@/app/api/map/features/route");
    const res = GET(new NextRequest("http://test/api/map/features?bbox=1,2,3"));
    expect(res.status).toBe(400);
  });
});
