/**
 * SQLite schema-migration coverage for the cross-family disposition key.
 *
 * @module test/db_schema
 * Data source: none (synthetic local SQLite schema)
 * @see CLAUDE.md §5, §10
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { searchDispositions } from "../lib/db/queries";
import { prepareUpsert } from "../lib/ingest/upsert";

let db: DB;

afterEach(() => {
  db.close();
});

describe("disposition natural-key migration", () => {
  it("adds family without losing ids, FTS content, or spatial-index rows", () => {
    db = openDb(":memory:");
    const schemaPath = join(process.cwd(), "src", "lib", "db", "schema.sql");
    const currentSchema = readFileSync(schemaPath, "utf8");
    // Reproduce both historical differences: the old key omitted family, and
    // simplified geometry was later appended by ALTER TABLE after ingested_at.
    const legacySchema = currentSchema
      .replace(
        "UNIQUE (source, family, agreement_type, agreement_number, tract)",
        "UNIQUE (source, agreement_number, tract)",
      )
      .replace("agreement_type       TEXT NOT NULL DEFAULT '',", "agreement_type       TEXT,")
      .replace(
        "geometry_geojson     TEXT,                     -- GeoJSON Polygon/MultiPolygon (WGS84)\n  geometry_simplified_geojson TEXT,              -- map-simplified copy (~10 m DP); NULL -> serve geometry_geojson\n  ingested_at          TEXT NOT NULL,",
        "geometry_geojson     TEXT,                     -- GeoJSON Polygon/MultiPolygon (WGS84)\n  ingested_at          TEXT NOT NULL,\n  geometry_simplified_geojson TEXT,",
      );
    expect(legacySchema.indexOf("ingested_at")).toBeLessThan(
      legacySchema.indexOf("geometry_simplified_geojson"),
    );
    db.exec(legacySchema);
    db.prepare(
      `INSERT INTO dispositions (
         id, source, family, agreement_type, agreement_number, tract, holder_desrep,
         bbox_minx, bbox_miny, bbox_maxx, bbox_maxy, ingested_at
       ) VALUES (42, 'geoview', 'png', '001', 'shared-1', '1', 'ALPHA ENERGY',
                 -114, 54, -113, 55, '2026-08-01T00:00:00.000Z')`,
    ).run();

    applySchema(db);
    prepareUpsert(db)({
      source: "geoview",
      family: "png",
      agreementType: "002",
      agreementNumber: "shared-1",
      tract: "1",
      holderDesrep: "BETA ENERGY",
      ingestedAt: "2026-08-18T00:00:00.000Z",
    });

    const rows = db
      .prepare(
        `SELECT id, family, agreement_type
         FROM dispositions WHERE agreement_number = 'shared-1' ORDER BY agreement_type`,
      )
      .all() as Array<{ id: number; family: string; agreement_type: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.agreement_type === "001")?.id).toBe(42);
    expect(searchDispositions(db, { q: "Alpha", kind: "company", limit: 10, offset: 0 })).toHaveLength(
      1,
    );
    const spatial = db.prepare("SELECT COUNT(*) AS n FROM dispositions_rtree").get() as {
      n: number;
    };
    expect(spatial.n).toBe(1);
  });
});
