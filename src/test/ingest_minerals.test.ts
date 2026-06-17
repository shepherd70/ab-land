/**
 * Offline end-to-end ingest test for the verified PNG layer: a mocked ArcGIS
 * service serves fixture GeoJSON, and the adapter pages → Zod-validates →
 * normalizes → upserts into an in-memory SQLite, which is then queried back.
 * No network: satisfies the "ingest must be testable offline" rule.
 *
 * @module test/ingest_minerals
 * Data source: GeoView ArcGIS REST (OGL-Alberta) — fixture, not live
 * @see CLAUDE.md §10
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { ingestMineralSource } from "../lib/ingest/mineral_adapter";
import { getByAgreementNumber, searchDispositions } from "../lib/db/queries";
import type { SourceDef } from "../lib/types";

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "src/test/fixtures/png_layer31.geojson"), "utf8"),
) as { type: "FeatureCollection"; features: unknown[] };

const BASE_URL = "https://example.test/arcgis/rest/services/Geoview";

const PNG_SOURCE: SourceDef = {
  family: "png",
  label: "Petroleum and Natural Gas Agreement",
  service: "Mineral_Agreements_Ext_PROD",
  layerId: 31,
  enabled: true,
  verified: true,
};

/** Stub `fetch` to serve the fixture as paged ArcGIS GeoJSON. */
function mockArcGis(): void {
  vi.stubGlobal("fetch", (input: string | URL) => {
    const url = new URL(input.toString());
    const offset = Number(url.searchParams.get("resultOffset") ?? "0");
    const count = Number(url.searchParams.get("resultRecordCount") ?? "1000");
    const features = FIXTURE.features.slice(offset, offset + count);
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ type: "FeatureCollection", features }),
    } as Response);
  });
}

function freshDb(): DB {
  const db = openDb(":memory:");
  applySchema(db);
  return db;
}

let db: DB;

beforeEach(() => {
  mockArcGis();
  db = freshDb();
});

afterEach(() => {
  db.close();
  vi.unstubAllGlobals();
  delete process.env.INGEST_PAGE_SIZE;
});

describe("PNG mineral ingest (offline)", () => {
  it("normalizes and stores every feature with geometry and ISO dates", async () => {
    const { family, rows } = await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    expect(family).toBe("png");
    expect(rows).toBe(3);

    const tracts = getByAgreementNumber(db, "0512345");
    expect(tracts).toHaveLength(2);
    expect(tracts.map((t) => t.tract)).toEqual(["1", "2"]);

    const [first] = tracts;
    expect(first.family).toBe("png");
    expect(first.holderDesrep).toBe("CANADIAN NATURAL RESOURCES LIMITED");
    expect(first.holderNorm).toBeTruthy();
    expect(first.participants).toContain("CANADIAN NATURAL RESOURCES LIMITED 100%");
    // ArcGIS epoch-ms → ISO yyyy-mm-dd.
    expect(first.termDate).toBe("2010-01-01");
    expect(first.currentExpiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Geometry-derived columns are precomputed on ingest.
    expect(first.geometryGeoJSON).toBeTruthy();
    expect(first.centroid).toHaveLength(2);
    expect(first.bbox).toHaveLength(4);
    expect(first.areaHa).toBeGreaterThan(0);
  });

  it("finds holdings by company name via FTS", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);

    const cnrl = searchDispositions(db, { q: "Canadian", kind: "company", limit: 50, offset: 0 });
    expect(cnrl).toHaveLength(2);
    expect(cnrl.every((d) => d.family === "png")).toBe(true);

    const tourmaline = searchDispositions(db, {
      q: "Tourmaline",
      kind: "company",
      limit: 50,
      offset: 0,
    });
    expect(tourmaline).toHaveLength(1);
    expect(tourmaline[0].agreementNumber).toBe("0698765");
  });

  it("finds holdings by agreement number prefix", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    const hits = searchDispositions(db, { q: "0512", kind: "agreement", limit: 50, offset: 0 });
    expect(hits).toHaveLength(2);
    expect(hits.every((d) => d.agreementNumber === "0512345")).toBe(true);
  });

  it("is idempotent: re-ingesting updates in place rather than duplicating", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);

    const total = db.prepare("SELECT COUNT(*) AS n FROM dispositions").get() as { n: number };
    expect(total.n).toBe(3);
    expect(getByAgreementNumber(db, "0512345")).toHaveLength(2);
  });

  it("pages through the layer when the service caps records per request", async () => {
    process.env.INGEST_PAGE_SIZE = "2"; // force >1 page over 3 fixture features
    const { rows } = await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    expect(rows).toBe(3);
    const total = db.prepare("SELECT COUNT(*) AS n FROM dispositions").get() as { n: number };
    expect(total.n).toBe(3);
  });
});
