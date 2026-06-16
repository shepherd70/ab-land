/**
 * @module test/company_names
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import { normalizeCompanyName, parseParticipants } from "../lib/matching/company_names";

describe("normalizeCompanyName", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(normalizeCompanyName("Husky Oil Operations Ltd.")).toBe("HUSKY OIL OPERATIONS");
    expect(normalizeCompanyName("Canadian Natural Resources Limited")).toBe(
      "CANADIAN NATURAL RESOURCES",
    );
  });

  it("expands ampersand and collapses whitespace", () => {
    expect(normalizeCompanyName("Smith  &  Jones Inc")).toBe("SMITH AND JONES");
  });

  it("keeps a single suffix-like token rather than emptying it", () => {
    expect(normalizeCompanyName("CO")).toBe("CO");
  });
});

describe("parseParticipants", () => {
  it("splits on semicolons and slashes", () => {
    expect(parseParticipants("A Corp; B Ltd / C Inc")).toEqual(["A Corp", "B Ltd", "C Inc"]);
  });

  it("returns an empty array for nullish input", () => {
    expect(parseParticipants(undefined)).toEqual([]);
    expect(parseParticipants("")).toEqual([]);
  });
});
