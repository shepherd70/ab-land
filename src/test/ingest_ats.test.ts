/**
 * Offline ingest coverage for the authoritative ATS legal-subdivision cache.
 *
 * @module test/ingest_ats
 * Data source: GeoView ATS_Grid_Ext_PROD/4 (open, OGL-Alberta) — local fixture
 * @see CLAUDE.md §10
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { ingestAtsGrid, normalizeAtsLsd } from "../lib/ingest/ats_adapter";

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "src/test/fixtures/ats_lsd_layer4.geojson"), "utf8"),
) as { features: unknown[] };
const BASE_URL = "https://example.test/arcgis/rest/services/Geoview";
const SOURCE = { service: "ATS_Grid_Ext_PROD", layerId: 4 } as const;

function mockArcGis(features: unknown[], reportedCount = features.length): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const url = new URL(input.toString());
      if (url.searchParams.get("returnCountOnly") === "true") {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () => Promise.resolve({ count: reportedCount }),
        } as Response);
      }
      const offset = Number(url.searchParams.get("resultOffset") ?? "0");
      const count = Number(url.searchParams.get("resultRecordCount") ?? "1000");
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () =>
          Promise.resolve({
            type: "FeatureCollection",
            features: features.slice(offset, offset + count),
          }),
      } as Response);
    }),
  );
}

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
  applySchema(db);
  mockArcGis(FIXTURE.features);
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
});

describe("authoritative ATS ingest", () => {
  it("validates, pages, and atomically publishes a complete layer", async () => {
    const progress: number[] = [];
    const result = await ingestAtsGrid(db, BASE_URL, SOURCE, {
      pageSize: 2,
      throttleMs: 0,
      geometryPrecision: 6,
      onProgress: (rows) => progress.push(rows),
    });

    expect(result).toMatchObject({ rows: 4, previousRows: 0 });
    expect(progress).toEqual([2, 4, 4]);
    const cells = db
      .prepare("SELECT lsd, geometry_geojson FROM ats_lsd_cells ORDER BY lsd")
      .all() as Array<{ lsd: number; geometry_geojson: string }>;
    expect(cells.map((cell) => cell.lsd)).toEqual([1, 2, 7, 8]);
    expect(JSON.parse(cells[0].geometry_geojson)).toMatchObject({ type: "Polygon" });

    const featureRequest = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => new URL(input.toString()))
      .find((url) => url.searchParams.get("returnCountOnly") !== "true");
    expect(featureRequest?.searchParams.get("outFields")).toContain("t18809Lsd");
    expect(featureRequest?.searchParams.get("orderByFields")).toBe("ObjectID ASC");
    expect(featureRequest?.searchParams.get("geometryPrecision")).toBe("6");

    const run = db
      .prepare("SELECT source, source_layer, rows_upserted, status FROM ingest_runs")
      .get() as Record<string, unknown>;
    expect(run).toMatchObject({
      source: "geoview-ats",
      source_layer: "ATS_Grid_Ext_PROD/4",
      rows_upserted: 4,
      status: "ok",
    });
  });

  it("combines split source features for one legal key into a MultiPolygon", async () => {
    const split = structuredClone(FIXTURE.features[0]) as {
      geometry: unknown;
      properties: Record<string, unknown>;
    };
    split.properties.ObjectID = 99;
    split.geometry = {
      type: "Polygon",
      coordinates: [
        [
          [-113.98, 51],
          [-113.97, 51],
          [-113.97, 51.01],
          [-113.98, 51.01],
          [-113.98, 51],
        ],
      ],
    };
    mockArcGis([...FIXTURE.features, split]);

    const result = await ingestAtsGrid(db, BASE_URL, SOURCE, {
      pageSize: 2,
      throttleMs: 0,
    });

    expect(result).toMatchObject({ rows: 4, sourceFeatures: 5, mergedFeatures: 1 });
    const row = db.prepare("SELECT geometry_geojson FROM ats_lsd_cells WHERE lsd = 1").get() as {
      geometry_geojson: string;
    };
    expect(JSON.parse(row.geometry_geojson)).toMatchObject({
      type: "MultiPolygon",
      coordinates: expect.arrayContaining([expect.any(Array), expect.any(Array)]),
    });
  });

  it("preserves the prior cache when downloaded rows do not match the source count", async () => {
    await ingestAtsGrid(db, BASE_URL, SOURCE, { pageSize: 2, throttleMs: 0 });
    mockArcGis(FIXTURE.features.slice(0, 3), 4);

    await expect(
      ingestAtsGrid(db, BASE_URL, SOURCE, { pageSize: 2, throttleMs: 0 }),
    ).rejects.toThrow("ATS snapshot validation failed");

    const live = db.prepare("SELECT COUNT(*) AS n FROM ats_lsd_cells").get() as { n: number };
    expect(live.n).toBe(4);
    const staging = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ats_lsd_cells_next'",
      )
      .get();
    expect(staging).toBeUndefined();
    const latest = db
      .prepare("SELECT status FROM ingest_runs ORDER BY id DESC LIMIT 1")
      .get() as { status: string };
    expect(latest.status).toBe("error");
  });

  it("rejects a source record whose quarter code contradicts its LSD", () => {
    const feature = structuredClone(FIXTURE.features[0]) as {
      properties: Record<string, unknown>;
    };
    feature.properties.t18809QuarterSection = 4;
    expect(() => normalizeAtsLsd(feature as never)).toThrow("belongs to quarter code 1");
  });
});
