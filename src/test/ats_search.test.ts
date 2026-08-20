/**
 * End-to-end ATS spatial search through the query layer: dispositions with
 * known bboxes are inserted into an in-memory DB, then queried by legal land
 * description. Offline, no network.
 *
 * @module test/ats_search
 * @see CLAUDE.md §10
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { normalizeAtsLsd } from "../lib/ingest/ats_adapter";
import { prepareUpsert } from "../lib/ingest/upsert";
import { searchDispositions } from "../lib/db/queries";
import type { ArcGisFeature } from "../lib/schemas";
import type { Disposition } from "../lib/types";

const DESCRIPTOR = "SE-12-034-05-W4";
const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "src/test/fixtures/ats_lsd_layer4.geojson"), "utf8"),
) as { features: ArcGisFeature[] };

function dispAt(agreementNumber: string, bbox: [number, number, number, number]): Disposition {
  const [minx, miny, maxx, maxy] = bbox;
  return {
    source: "geoview",
    family: "png",
    agreementNumber,
    tract: "1",
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
}

function insertAtsFixture(db: DB): void {
  const insert = db.prepare(
    `INSERT INTO ats_lsd_cells (
       meridian, range_no, township, section_no, lsd,
       bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, geometry_geojson
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const feature of FIXTURE.features) {
    const cell = normalizeAtsLsd(feature);
    insert.run(
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

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
  applySchema(db);
  insertAtsFixture(db);
  const upsert = prepareUpsert(db);

  const cell: [number, number, number, number] = [-114, 51, -113.99, 51.01];
  upsert(dispAt("0500001", cell)); // intersects an official ATS cell → should match
  // Shift far north-east, clearly outside the cell.
  upsert(dispAt("0500002", [cell[0] + 3, cell[1] + 2, cell[2] + 3, cell[3] + 2]));
  // Its bbox covers the quarter, but the triangle itself is south-west of it.
  // This is the coarse-index false positive the exact polygon check removes.
  upsert({
    ...dispAt("0500003", [-114.1, 50.9, -113.9, 51.05]),
    geometryGeoJSON: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [-114.1, 50.9],
          [-113.9, 50.9],
          [-114.1, 51.05],
          [-114.1, 50.9],
        ],
      ],
    }),
  });
  // Shares only the official quarter's east boundary; adjacency is not tenure
  // within the searched legal location and must not count as a match.
  upsert(dispAt("0500004", [-113.99, 51, -113.98, 51.02]));
});

afterEach(() => db.close());

describe("ATS spatial search", () => {
  it("returns only dispositions overlapping the legal land description", () => {
    const hits = searchDispositions(db, { q: DESCRIPTOR, kind: "ats", limit: 50, offset: 0 });
    expect(hits.map((d) => d.agreementNumber)).toEqual(["0500001"]);
  });

  it("auto-detects an ATS descriptor without an explicit kind", () => {
    const hits = searchDispositions(db, { q: DESCRIPTOR, kind: "auto", limit: 50, offset: 0 });
    expect(hits.map((d) => d.agreementNumber)).toEqual(["0500001"]);
  });

  it("returns nothing for an explicit ATS query that is not a valid descriptor", () => {
    const hits = searchDispositions(db, {
      q: "definitely not a location",
      kind: "ats",
      limit: 50,
      offset: 0,
    });
    expect(hits).toEqual([]);
  });

  it("fails explicitly instead of returning false no-results when the cache is empty", () => {
    db.exec("DELETE FROM ats_lsd_cells");
    expect(() =>
      searchDispositions(db, { q: DESCRIPTOR, kind: "ats", limit: 50, offset: 0 }),
    ).toThrow("run `npm run ingest:ats` first");
  });
});
