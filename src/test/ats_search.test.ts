/**
 * End-to-end ATS spatial search through the query layer: dispositions with
 * known bboxes are inserted into an in-memory DB, then queried by legal land
 * description. Offline, no network.
 *
 * @module test/ats_search
 * @see CLAUDE.md §10
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { prepareUpsert } from "../lib/ingest/upsert";
import { searchDispositions } from "../lib/db/queries";
import { parseAts } from "../lib/ats";
import { atsApproxBbox } from "../lib/spatial/ats_grid";
import type { Disposition } from "../lib/types";

const DESCRIPTOR = "SE-12-034-05-W4";

function dispAt(agreementNumber: string, bbox: [number, number, number, number]): Disposition {
  return {
    source: "geoview",
    family: "png",
    agreementNumber,
    tract: "1",
    bbox,
    ingestedAt: new Date().toISOString(),
  };
}

let db: DB;

beforeEach(() => {
  db = openDb(":memory:");
  applySchema(db);
  const upsert = prepareUpsert(db);

  const cell = atsApproxBbox(parseAts(DESCRIPTOR)!);
  upsert(dispAt("0500001", cell)); // sits on the ATS cell → should match
  // Shift far north-east, clearly outside the cell.
  upsert(dispAt("0500002", [cell[0] + 3, cell[1] + 2, cell[2] + 3, cell[3] + 2]));
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
});
