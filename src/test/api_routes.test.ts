/**
 * Route-handler tests for the search and holdings/[id] APIs against a
 * temp-file SQLite fixture. The handlers open
 * their own read-only connection to DEFAULT_DB_PATH, frozen at client-module
 * import time — so DB_PATH is set before dynamic import(), same pattern as
 * api_map.test.ts. Offline.
 *
 * @module test/api_routes
 * @see CLAUDE.md §10
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextRequest } from "next/server";
import { normalizeAtsLsd } from "@/lib/ingest/ats_adapter";
import type { ArcGisFeature } from "@/lib/schemas";
import type { DB } from "@/lib/db/client";
import type { Disposition } from "@/lib/types";

const DB_FILE = join(tmpdir(), `ab-land-api-routes-${process.pid}.sqlite`);
const prevDbPath = process.env.DB_PATH;

const ATS_DESCRIPTOR = "SE-12-034-05-W4";
const ATS_FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "src/test/fixtures/ats_lsd_layer4.geojson"), "utf8"),
) as { features: ArcGisFeature[] };

function insertAtsFixture(db: DB): void {
  const insertAts = db.prepare(
    `INSERT INTO ats_lsd_cells (
       meridian, range_no, township, section_no, lsd,
       bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, geometry_geojson
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const feature of ATS_FIXTURE.features) {
    const cell = normalizeAtsLsd(feature);
    insertAts.run(
      cell.meridian,
      cell.range,
      cell.township,
      cell.section,
      cell.lsd,
      ...cell.bbox,
      cell.geometryGeoJSON,
    );
  }
}

beforeAll(async () => {
  process.env.DB_PATH = DB_FILE;
  const { openDb, applySchema } = await import("@/lib/db/client");
  const { prepareUpsert } = await import("@/lib/ingest/upsert");
  const { normalizeCompanyName } = await import("@/lib/matching/company_names");
  const db = openDb(DB_FILE);
  applySchema(db);
  insertAtsFixture(db);
  const upsert = prepareUpsert(db);

  const at = (
    n: string,
    tract: string,
    holder: string | undefined,
    bbox: [number, number, number, number],
  ): Disposition => {
    const [minx, miny, maxx, maxy] = bbox;
    return {
      source: "geoview",
      family: "png",
      agreementNumber: n,
      tract,
      holderDesrep: holder,
      holderNorm: holder ? normalizeCompanyName(holder) : undefined,
      centroid: [(minx + maxx) / 2, (miny + maxy) / 2],
      bbox,
      geometryGeoJSON: JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [minx, miny],
            [maxx, miny],
            [maxx, maxy],
            [minx, maxy],
            [minx, miny],
          ],
        ],
      }),
      ingestedAt: new Date().toISOString(),
    };
  };

  const box = (lon: number, lat: number): [number, number, number, number] => [
    lon - 0.01,
    lat - 0.01,
    lon + 0.01,
    lat + 0.01,
  ];

  upsert(at("0512345", "01", "ACME ENERGY LTD", box(-114.0, 51.0)));
  upsert(at("0512345", "02", "ACME ENERGY LTD", box(-114.05, 51.02)));
  upsert(at("0698765", "01", "OTHER RESOURCES INC", box(-113.9, 51.1)));
  // Sits on an official cached ATS cell so the route-level path hits it.
  upsert(at("0700099", "01", undefined, [-114, 51, -113.99, 51.01]));

  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
});

afterAll(() => {
  for (const ext of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${ext}`, { force: true });
  if (prevDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = prevDbPath;
  vi.resetModules();
});

describe("GET /api/search", () => {
  it("finds holdings by company via FTS, as geometry-less summaries", async () => {
    const { GET } = await import("@/app/api/search/route");
    const res = GET(new NextRequest("http://test/api/search?q=acme&kind=company"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Disposition[] };
    expect(body.results).toHaveLength(2);
    expect(body.results.every((d) => d.agreementNumber === "0512345")).toBe(true);
    // Summary contract: list results never carry geometry.
    expect(body.results.every((d) => d.geometryGeoJSON === undefined)).toBe(true);
  });

  it("finds holdings by agreement-number prefix", async () => {
    const { GET } = await import("@/app/api/search/route");
    const res = GET(new NextRequest("http://test/api/search?q=0512&kind=agreement"));
    const body = (await res.json()) as { results: Disposition[] };
    expect(body.results.map((d) => d.tract).sort()).toEqual(["01", "02"]);
  });

  it("auto-detects a legal land description (ATS)", async () => {
    const { GET } = await import("@/app/api/search/route");
    const res = GET(
      new NextRequest(`http://test/api/search?q=${encodeURIComponent(ATS_DESCRIPTOR)}`),
    );
    const body = (await res.json()) as { results: Disposition[] };
    expect(body.results.map((d) => d.agreementNumber)).toContain("0700099");
  });

  it("rejects a missing query with 400", async () => {
    const { GET } = await import("@/app/api/search/route");
    const res = GET(new NextRequest("http://test/api/search"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_query");
  });

  it("returns 503 when an ATS query is valid but the offline cache is empty", async () => {
    const { openDb } = await import("@/lib/db/client");
    let writable = openDb(DB_FILE);
    writable.exec("DELETE FROM ats_lsd_cells");
    writable.pragma("wal_checkpoint(TRUNCATE)");
    writable.close();

    try {
      const { GET } = await import("@/app/api/search/route");
      const res = GET(
        new NextRequest(`http://test/api/search?q=${encodeURIComponent(ATS_DESCRIPTOR)}`),
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.error).toBe("ats_grid_unavailable");
      expect(body.message).toContain("npm run ingest:ats");
    } finally {
      writable = openDb(DB_FILE);
      insertAtsFixture(writable);
      writable.pragma("wal_checkpoint(TRUNCATE)");
      writable.close();
    }
  });
});
