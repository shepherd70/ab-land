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
import { centroidsAll, featuresInViewport } from "../lib/db/queries";
import type { Disposition, MineralFamily } from "../lib/types";

/** A parcel centered at [lon, lat] with a small square bbox. */
function parcel(
  agreementNumber: string,
  tract: string,
  family: MineralFamily,
  lon: number,
  lat: number,
): Disposition {
  return {
    source: "geoview",
    family,
    agreementNumber,
    tract,
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
  // Two PNG parcels near Calgary; one geothermal far north; a 2-tract oil_sands
  // agreement, both tracts near Calgary.
  upsert(parcel("0500001", "01", "png", -114.0, 51.0));
  upsert(parcel("0500002", "01", "png", -114.1, 51.05));
  upsert(parcel("0500003", "01", "geothermal", -113.0, 57.0));
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
});
