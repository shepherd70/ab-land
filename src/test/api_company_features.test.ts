/**
 * Route-handler tests for GET /api/companies/:name/features. Same temp-DB
 * pattern as api_map.test.ts: DB_PATH is set before the (cached) client module
 * is dynamically imported, and seeding goes through the same module. The
 * polygons→centroids flip is exercised via the injectable `budget` param so the
 * fixtures stay tiny (no 8 MB of geometry).
 *
 * @module test/api_company_features
 * @see CLAUDE.md §10
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
import type { FeatureCollection } from "geojson";
import type { CompanyMapMode } from "@/lib/map/company_features";
import { normalizeCompanyName } from "@/lib/matching/company_names";

const DB_FILE = join(tmpdir(), `ab-land-api-company-features-${process.pid}.sqlite`);
const prevDbPath = process.env.DB_PATH;

interface FeaturesBody {
  mode: CompanyMapMode;
  parcels: number;
  featureCollection: FeatureCollection;
}

function call(name: string, query = "") {
  return import("@/app/api/companies/[name]/features/route").then(({ GET }) =>
    GET(new NextRequest(`http://test/api/companies/${name}/features${query}`), {
      params: Promise.resolve({ name }),
    }),
  );
}

beforeAll(async () => {
  process.env.DB_PATH = DB_FILE;
  const { openDb, applySchema } = await import("@/lib/db/client");
  const { prepareUpsert } = await import("@/lib/ingest/upsert");
  const db = openDb(DB_FILE);
  applySchema(db);
  const upsert = prepareUpsert(db);
  const at = (n: string, tract: string, holder: string, lon: number, lat: number) => ({
    source: "geoview" as const,
    family: "png" as const,
    agreementNumber: n,
    tract,
    status: "ACTIVE",
    holderDesrep: holder,
    holderNorm: normalizeCompanyName(holder),
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
  upsert(at("0500001", "01", "Testco Resources Ltd.", -114.0, 51.0));
  upsert(at("0500001", "02", "Testco Resources Ltd.", -114.2, 51.1));
  // Recorded under a predecessor name; must surface on the Cenovus profile map.
  upsert(at("0500009", "01", "Husky Oil Operations Ltd.", -113.0, 55.0));
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
});

afterAll(() => {
  for (const ext of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${ext}`, { force: true });
  if (prevDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = prevDbPath;
  vi.resetModules();
});

describe("GET /api/companies/:name/features", () => {
  it("ships full polygons when the holder fits the byte budget", async () => {
    const res = await call("Testco%20Resources");
    expect(res.status).toBe(200);
    const body = (await res.json()) as FeaturesBody;
    expect(body.mode).toBe("polygons");
    expect(body.parcels).toBe(2);
    expect(body.featureCollection.features).toHaveLength(2);
    expect(body.featureCollection.features[0].geometry.type).toBe("Polygon");
    expect(body.featureCollection.features[0].properties?.agreementNumber).toBe("0500001");
  });

  it("degrades to centroid points when geometry exceeds the budget", async () => {
    const res = await call("Testco%20Resources", "?budget=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as FeaturesBody;
    expect(body.mode).toBe("centroids");
    expect(body.parcels).toBe(2);
    expect(body.featureCollection.features).toHaveLength(2);
    for (const f of body.featureCollection.features) {
      expect(f.geometry.type).toBe("Point");
    }
  });

  it("broadens to alias/predecessor names", async () => {
    const res = await call("Cenovus%20Energy");
    const body = (await res.json()) as FeaturesBody;
    expect(body.parcels).toBe(1);
    expect(body.featureCollection.features[0].properties?.agreementNumber).toBe("0500009");
  });

  it("returns an empty collection for an unknown holder", async () => {
    const res = await call("No%20Such%20Holdings");
    const body = (await res.json()) as FeaturesBody;
    expect(body.mode).toBe("polygons");
    expect(body.parcels).toBe(0);
    expect(body.featureCollection.features).toHaveLength(0);
  });

  it("rejects an invalid budget with 400", async () => {
    const res = await call("Testco%20Resources", "?budget=nope");
    expect(res.status).toBe(400);
  });
});
