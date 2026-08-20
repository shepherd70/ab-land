/**
 * Offline tests for selecting official cached ATS legal-subdivision polygons.
 *
 * @module test/ats_grid
 * Data source: GeoView ATS_Grid_Ext_PROD/4 (open, OGL-Alberta) — local fixture
 * @see CLAUDE.md §10
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAts } from "../lib/ats";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { normalizeAtsLsd } from "../lib/ingest/ats_adapter";
import type { ArcGisFeature } from "../lib/schemas";
import {
  AtsGridUnavailableError,
  atsCellsBbox,
  authoritativeAtsCells,
} from "../lib/spatial/ats_grid";

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "src/test/fixtures/ats_lsd_layer4.geojson"), "utf8"),
) as { features: ArcGisFeature[] };

function loc(value: string) {
  const parsed = parseAts(value);
  if (!parsed) throw new Error(`Fixture descriptor failed to parse: ${value}`);
  return parsed;
}

function insertFixture(db: DB): void {
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
});

afterEach(() => db.close());

describe("authoritativeAtsCells", () => {
  it("fails explicitly when the authoritative cache has not been ingested", () => {
    expect(() => authoritativeAtsCells(db, loc("01-12-034-05-W4"))).toThrow(
      AtsGridUnavailableError,
    );
  });

  it("selects one LSD and four official cells for its quarter", () => {
    insertFixture(db);
    expect(authoritativeAtsCells(db, loc("01-12-034-05-W4")).map((cell) => cell.lsd)).toEqual([
      1,
    ]);
    expect(authoritativeAtsCells(db, loc("SE-12-034-05-W4")).map((cell) => cell.lsd)).toEqual([
      1, 2, 7, 8,
    ]);
  });

  it("selects every cached cell in a section and merges their bounds", () => {
    insertFixture(db);
    const cells = authoritativeAtsCells(db, loc("12-034-05-W4"));
    expect(cells).toHaveLength(4);
    expect(atsCellsBbox(cells)).toEqual([-114.01, 51, -113.99, 51.02]);
  });

  it("returns no cells for a valid but unsurveyed descriptor", () => {
    insertFixture(db);
    expect(authoritativeAtsCells(db, loc("01-13-034-05-W4"))).toEqual([]);
  });
});
