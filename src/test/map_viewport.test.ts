/**
 * Map query layer over an in-memory DB: seeds parcels with known bboxes and
 * families, then exercises the R*Tree-backed viewport query, the centroid
 * overview query, and family filtering. Offline.
 *
 * @module test/map_viewport
 * @see CLAUDE.md §10
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { prepareUpsert } from "../lib/ingest/upsert";
import { centroidsAll, companyBounds, featuresInViewport } from "../lib/db/queries";
import { normalizeCompanyName } from "../lib/matching/company_names";
import type { Disposition, MineralFamily } from "../lib/types";

/** A parcel centered at [lon, lat] with a small square bbox. */
function parcel(
  agreementNumber: string,
  tract: string,
  family: MineralFamily,
  lon: number,
  lat: number,
  holder?: string,
): Disposition {
  return {
    source: "geoview",
    family,
    agreementNumber,
    tract,
    holderDesrep: holder,
    holderNorm: holder ? normalizeCompanyName(holder) : undefined,
    centroid: [lon, lat],
    bbox: [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01],
    ingestedAt: new Date().toISOString(),
  };
}

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
  applySchema(db);
  const upsert = prepareUpsert(db);
  // Two PNG parcels near Calgary (different holders); one geothermal far north;
  // a 2-tract oil_sands agreement, both tracts near Calgary.
  upsert(parcel("0500001", "01", "png", -114.0, 51.0, "ACME ENERGY LTD"));
  upsert(parcel("0500002", "01", "png", -114.1, 51.05, "OTHER RESOURCES INC"));
  upsert(parcel("0500003", "01", "geothermal", -113.0, 57.0, "ACME ENERGY LTD"));
  upsert(parcel("0700010", "01", "oil_sands", -114.05, 51.02));
  upsert(parcel("0700010", "02", "oil_sands", -114.06, 51.03));
});

afterEach(() => db.close());

const CALGARY: [number, number, number, number] = [-114.3, 50.8, -113.8, 51.2];

describe("featuresInViewport", () => {
  it("returns only parcels whose bbox overlaps the viewport (rtree populated by trigger)", () => {
    const hits = featuresInViewport(db, CALGARY);
    expect(hits.map((d) => d.agreementNumber).sort()).toEqual([
      "0500001",
      "0500002",
      "0700010",
      "0700010",
    ]);
    // The far-north geothermal parcel is excluded.
    expect(hits.some((d) => d.agreementNumber === "0500003")).toBe(false);
  });

  it("returns one feature per tract of a multi-tract agreement", () => {
    const hits = featuresInViewport(db, CALGARY).filter((d) => d.agreementNumber === "0700010");
    expect(hits.map((d) => d.tract).sort()).toEqual(["01", "02"]);
  });

  it("filters by family", () => {
    const hits = featuresInViewport(db, CALGARY, { families: ["png"] });
    expect(hits.map((d) => d.agreementNumber).sort()).toEqual(["0500001", "0500002"]);
  });

  it("filters by company through name normalization (suffix variant matches)", () => {
    const hits = featuresInViewport(db, CALGARY, { company: "Acme Energy Ltd." });
    expect(hits.map((d) => d.agreementNumber)).toEqual(["0500001"]);
  });

  it("serves the simplified geometry when stored and the full polygon otherwise", () => {
    const upsert = prepareUpsert(db);
    const square = (r: number): string =>
      JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [-114 - r, 51 - r],
            [-114 + r, 51 - r],
            [-114 + r, 51 + r],
            [-114 - r, 51 + r],
            [-114 - r, 51 - r],
          ],
        ],
      });
    const full = square(0.01);
    const simplified = square(0.009); // stand-in for an ingest-time simplifyForMap result
    upsert({
      ...parcel("0800001", "01", "png", -114.0, 51.0),
      geometryGeoJSON: full,
      geometrySimplifiedGeoJSON: simplified,
    });
    upsert({ ...parcel("0800002", "01", "png", -114.0, 51.05), geometryGeoJSON: full });

    const hits = featuresInViewport(db, CALGARY);
    const withCopy = hits.find((d) => d.agreementNumber === "0800001");
    const withoutCopy = hits.find((d) => d.agreementNumber === "0800002");
    expect(withCopy?.geometryGeoJSON).toBe(simplified);
    expect(withoutCopy?.geometryGeoJSON).toBe(full);
  });
});

describe("centroidsAll", () => {
  it("returns lean centroid rows for every parcel", () => {
    const rows = centroidsAll(db);
    expect(rows).toHaveLength(5);
    const sample = rows.find((r) => r.agreementNumber === "0500001");
    expect(sample).toMatchObject({ family: "png", lon: -114.0, lat: 51.0 });
  });

  it("filters by family", () => {
    const rows = centroidsAll(db, { families: ["geothermal"] });
    expect(rows.map((r) => r.agreementNumber)).toEqual(["0500003"]);
  });

  it("filters by company across the whole province", () => {
    const rows = centroidsAll(db, { company: "acme energy" });
    expect(rows.map((r) => r.agreementNumber).sort()).toEqual(["0500001", "0500003"]);
  });
});

describe("companyBounds", () => {
  it("merges the bboxes of every holding (suffix variant matches)", () => {
    // ACME holds 0500001 at [-114, 51] and 0500003 at [-113, 57], ±0.01 each.
    expect(companyBounds(db, "Acme Energy Ltd.")).toEqual([-114.01, 50.99, -112.99, 57.01]);
  });

  it("returns null for an unmatched holder", () => {
    expect(companyBounds(db, "Nonexistent Corp")).toBeNull();
  });
});
