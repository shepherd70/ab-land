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
import { ingestMineralSource, ingestMineralSources } from "../lib/ingest/mineral_adapter";
import { normalizePng } from "../lib/ingest/normalize";
import { getByAgreementNumber, searchDispositions } from "../lib/db/queries";
import type { SourceDef } from "../lib/types";
import type { ArcGisFeature } from "../lib/schemas";

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

const OIL_SANDS_SOURCE: SourceDef = {
  family: "oil_sands",
  label: "Oil Sands Agreement",
  service: "Mineral_Agreements_Ext_PROD",
  layerId: 24,
  enabled: true,
  verified: true,
};

/** Stub `fetch` to serve the supplied features as paged ArcGIS GeoJSON. */
function mockArcGis(featuresToServe: unknown[] = FIXTURE.features): void {
  vi.stubGlobal("fetch", (input: string | URL) => {
    const url = new URL(input.toString());
    const offset = Number(url.searchParams.get("resultOffset") ?? "0");
    const count = Number(url.searchParams.get("resultRecordCount") ?? "1000");
    const features = featuresToServe.slice(offset, offset + count);
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
  delete process.env.INGEST_MIN_ROW_FRACTION;
  delete process.env.INGEST_ALLOW_DESTRUCTIVE_REFRESH;
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
    // Live data carries numeric type codes; normalize must store the raw code —
    // labeling is display-layer only (lib/tenure).
    expect(first.agreementType).toBe("004");
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

  it("removes rows that disappeared upstream when the new snapshot publishes", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    mockArcGis(FIXTURE.features.slice(0, 2));

    const result = await ingestMineralSource(db, BASE_URL, PNG_SOURCE);

    expect(result.rows).toBe(2);
    expect(result.rowsDeleted).toBe(1);
    expect(getByAgreementNumber(db, "0698765")).toHaveLength(0);
    const total = db.prepare("SELECT COUNT(*) AS n FROM dispositions").get() as { n: number };
    expect(total.n).toBe(2);
  });

  it("preserves the previous snapshot and records an error when fetch fails", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "Unavailable" } as Response),
    );

    await expect(ingestMineralSource(db, BASE_URL, PNG_SOURCE)).rejects.toThrow(
      "ArcGIS query failed: 503",
    );

    const total = db.prepare("SELECT COUNT(*) AS n FROM dispositions").get() as { n: number };
    expect(total.n).toBe(3);
    const latest = db
      .prepare(
        `SELECT status, message FROM ingest_runs
         WHERE parent_run_id IS NULL ORDER BY id DESC LIMIT 1`,
      )
      .get() as { status: string; message: string };
    expect(latest.status).toBe("error");
    expect(latest.message).toContain("503");
  });

  it("publishes no layers when a later source in the full snapshot fails", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    vi.stubGlobal("fetch", (input: string | URL) => {
      const url = new URL(input.toString());
      if (url.pathname.includes("/24/query")) {
        return Promise.resolve({
          ok: false,
          status: 503,
          statusText: "Unavailable",
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () =>
          Promise.resolve({ type: "FeatureCollection", features: FIXTURE.features.slice(0, 2) }),
      } as Response);
    });

    await expect(
      ingestMineralSources(db, BASE_URL, [PNG_SOURCE, OIL_SANDS_SOURCE]),
    ).rejects.toThrow("ArcGIS query failed: 503");

    expect(getByAgreementNumber(db, "0698765")).toHaveLength(1);
    const total = db.prepare("SELECT COUNT(*) AS n FROM dispositions").get() as { n: number };
    expect(total.n).toBe(3);
  });

  it("rejects a catastrophic row-count drop before touching live data", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    mockArcGis(FIXTURE.features.slice(0, 1));

    await expect(ingestMineralSource(db, BASE_URL, PNG_SOURCE)).rejects.toThrow(
      "exceeds the 50% removal guard",
    );

    const total = db.prepare("SELECT COUNT(*) AS n FROM dispositions").get() as { n: number };
    expect(total.n).toBe(3);
  });

  it("logs successful batch and layer publication counts", async () => {
    await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    const runs = db
      .prepare(
        `SELECT parent_run_id, family, source_layer, rows_upserted, rows_deleted, status
         FROM ingest_runs ORDER BY id`,
      )
      .all() as Array<Record<string, unknown>>;

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      parent_run_id: null,
      family: null,
      rows_upserted: 3,
      rows_deleted: 0,
      status: "ok",
    });
    expect(runs[1]).toMatchObject({
      parent_run_id: 1,
      family: "png",
      source_layer: "Mineral_Agreements_Ext_PROD/31",
      rows_upserted: 3,
      rows_deleted: 0,
      status: "ok",
    });
  });

  it("pages through the layer when the service caps records per request", async () => {
    process.env.INGEST_PAGE_SIZE = "2"; // force >1 page over 3 fixture features
    const { rows } = await ingestMineralSource(db, BASE_URL, PNG_SOURCE);
    expect(rows).toBe(3);
    const total = db.prepare("SELECT COUNT(*) AS n FROM dispositions").get() as { n: number };
    expect(total.n).toBe(3);
  });
});

describe("simplified geometry at ingest", () => {
  /** A minimal ArcGIS feature wrapping the given polygon ring. */
  const featureWithRing = (ring: [number, number][]): ArcGisFeature => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: { AgreementNumber: "0999999", AgreementType: "004", Tract: "1" },
  });

  it("stores a map-simplified copy for dense polygons only", () => {
    // Dense near-circle (300 vertices) — the giant-parcel shape worth copying.
    const dense: [number, number][] = [];
    for (let i = 0; i < 300; i++) {
      const t = (2 * Math.PI * i) / 300;
      dense.push([-114 + 0.05 * Math.cos(t), 54 + 0.05 * Math.sin(t)]);
    }
    dense.push([...dense[0]]);
    const simplified = normalizePng(featureWithRing(dense), "test/31");
    expect(simplified.geometrySimplifiedGeoJSON).toBeTruthy();
    expect(simplified.geometrySimplifiedGeoJSON!.length).toBeLessThan(
      simplified.geometryGeoJSON!.length,
    );

    // The common DLS rectangle — already lean, no copy stored.
    const lean = normalizePng(
      featureWithRing([
        [-114, 54],
        [-113.99, 54],
        [-113.99, 54.01],
        [-114, 54.01],
        [-114, 54],
      ]),
      "test/31",
    );
    expect(lean.geometrySimplifiedGeoJSON).toBeUndefined();
    expect(lean.geometryGeoJSON).toBeTruthy();
  });
});
