/**
 * Tests for the curated company alias/predecessor grouping and the
 * company-profile queries built on it: `listByCompany` (incl. paging) and
 * `companyHoldingsSummary` (agreement-vs-parcel counts, computed in SQL).
 * Pure functions plus an offline in-memory DB round-trip.
 *
 * @module test/company_aliases
 * @see CLAUDE.md §10
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aliasGroupKeys, canonicalCompanyKey } from "../lib/matching/company_aliases";
import { normalizeCompanyName } from "../lib/matching/company_names";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { prepareUpsert } from "../lib/ingest/upsert";
import { companyHoldingsSummary, listByCompany } from "../lib/db/queries";
import type { Disposition } from "../lib/types";

describe("company alias grouping", () => {
  it("maps predecessor names to a shared canonical key", () => {
    const cenovus = normalizeCompanyName("Cenovus Energy");
    expect(canonicalCompanyKey(normalizeCompanyName("Husky Oil Operations Ltd."))).toBe(cenovus);
    expect(canonicalCompanyKey(normalizeCompanyName("Husky Energy Inc"))).toBe(cenovus);
    expect(canonicalCompanyKey(cenovus)).toBe(cenovus);
  });

  it("expands any group member to every member (including itself)", () => {
    const fromNew = aliasGroupKeys(normalizeCompanyName("Cenovus Energy"));
    const fromOld = aliasGroupKeys(normalizeCompanyName("Husky Oil Operations"));
    expect(new Set(fromNew)).toEqual(new Set(fromOld)); // order-independent, same set
    expect(fromNew).toContain(normalizeCompanyName("Husky Energy"));
    expect(fromNew).toContain(normalizeCompanyName("Cenovus Energy"));
  });

  it("returns just the input for a name with no known aliases", () => {
    const key = normalizeCompanyName("Tourmaline Oil Corp.");
    expect(aliasGroupKeys(key)).toEqual([key]);
    expect(canonicalCompanyKey(key)).toBe(key);
  });
});

function holding(
  holder: string,
  agreementNumber: string,
  tract = "1",
  family: Disposition["family"] = "png",
): Disposition {
  return {
    source: "geoview",
    family,
    agreementNumber,
    tract,
    holderDesrep: holder,
    holderNorm: normalizeCompanyName(holder),
    ingestedAt: new Date().toISOString(),
  };
}

describe("listByCompany with alias expansion", () => {
  let db: DB;

  it("returns holdings recorded under predecessor names", () => {
    db = openDb(":memory:");
    applySchema(db);
    const upsert = prepareUpsert(db);
    upsert(holding("Husky Oil Operations Ltd.", "0500001"));
    upsert(holding("Cenovus Energy Inc.", "0500002"));
    upsert(holding("Tourmaline Oil Corp.", "0500003"));

    const cenovus = listByCompany(db, "Cenovus Energy");
    expect(cenovus.map((d) => d.agreementNumber).sort()).toEqual(["0500001", "0500002"]);

    // An unrelated company is unaffected by alias expansion.
    const tourmaline = listByCompany(db, "Tourmaline Oil");
    expect(tourmaline.map((d) => d.agreementNumber)).toEqual(["0500003"]);

    db.close();
  });
});

describe("listByCompany paging", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    applySchema(db);
    const upsert = prepareUpsert(db);
    // 5 parcels of one holder, agreement numbers ascending.
    for (let i = 1; i <= 5; i++) {
      upsert(holding("Tourmaline Oil Corp.", `050000${i}`));
    }
  });

  afterEach(() => db.close());

  it("returns every row when no limit is given", () => {
    expect(listByCompany(db, "Tourmaline Oil")).toHaveLength(5);
  });

  it("slices into non-overlapping pages that together cover every row", () => {
    const page1 = listByCompany(db, "Tourmaline Oil", { limit: 2, offset: 0 });
    const page2 = listByCompany(db, "Tourmaline Oil", { limit: 2, offset: 2 });
    const page3 = listByCompany(db, "Tourmaline Oil", { limit: 2, offset: 4 });

    expect(page1.map((d) => d.agreementNumber)).toEqual(["0500001", "0500002"]);
    expect(page2.map((d) => d.agreementNumber)).toEqual(["0500003", "0500004"]);
    expect(page3.map((d) => d.agreementNumber)).toEqual(["0500005"]);

    const all = [...page1, ...page2, ...page3].map((d) => d.agreementNumber);
    expect(new Set(all).size).toBe(5); // no row served twice
  });

  it("returns an empty page past the end", () => {
    expect(listByCompany(db, "Tourmaline Oil", { limit: 2, offset: 99 })).toEqual([]);
  });

  it("omits geometry unless asked", () => {
    const [row] = listByCompany(db, "Tourmaline Oil", { limit: 1 });
    expect(row.geometryGeoJSON).toBeUndefined();
  });
});

describe("companyHoldingsSummary", () => {
  let db: DB;

  beforeEach(() => {
    db = openDb(":memory:");
    applySchema(db);
  });

  afterEach(() => db.close());

  it("counts a multi-tract agreement once while counting every parcel", () => {
    const upsert = prepareUpsert(db);
    upsert(holding("Tourmaline Oil Corp.", "5495110028", "01"));
    upsert(holding("Tourmaline Oil Corp.", "5495110028", "02"));
    upsert(holding("Tourmaline Oil Corp.", "0500001", "01"));

    expect(companyHoldingsSummary(db, "Tourmaline Oil")).toEqual({ agreements: 2, parcels: 3 });
  });

  it("treats the same agreement number in different families as distinct agreements", () => {
    const upsert = prepareUpsert(db);
    // The natural key is (source, number, tract), so the families differ by tract.
    upsert(holding("Tourmaline Oil Corp.", "0700010", "01", "png"));
    upsert(holding("Tourmaline Oil Corp.", "0700010", "02", "oil_sands"));

    expect(companyHoldingsSummary(db, "Tourmaline Oil")).toEqual({ agreements: 2, parcels: 2 });
  });

  it("counts across alias/predecessor names, like listByCompany", () => {
    const upsert = prepareUpsert(db);
    upsert(holding("Husky Oil Operations Ltd.", "0500001"));
    upsert(holding("Cenovus Energy Inc.", "0500002"));

    expect(companyHoldingsSummary(db, "Cenovus Energy")).toEqual({ agreements: 2, parcels: 2 });
  });

  it("is zero for an unknown holder", () => {
    expect(companyHoldingsSummary(db, "No Such Holdings")).toEqual({ agreements: 0, parcels: 0 });
  });

  it("agrees with the row count listByCompany returns unpaged", () => {
    const upsert = prepareUpsert(db);
    upsert(holding("Tourmaline Oil Corp.", "5495110028", "01"));
    upsert(holding("Tourmaline Oil Corp.", "5495110028", "02"));

    const summary = companyHoldingsSummary(db, "Tourmaline Oil");
    expect(summary.parcels).toBe(listByCompany(db, "Tourmaline Oil").length);
  });
});
