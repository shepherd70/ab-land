/**
 * Tests for the curated company alias/predecessor grouping and its integration
 * into the company-profile query (listByCompany). Pure functions plus an
 * offline in-memory DB round-trip.
 *
 * @module test/company_aliases
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import { aliasGroupKeys, canonicalCompanyKey } from "../lib/matching/company_aliases";
import { normalizeCompanyName } from "../lib/matching/company_names";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { prepareUpsert } from "../lib/ingest/upsert";
import { listByCompany } from "../lib/db/queries";
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

function holding(holder: string, agreementNumber: string): Disposition {
  return {
    source: "geoview",
    family: "png",
    agreementNumber,
    tract: "1",
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
