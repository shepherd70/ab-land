/**
 * @module test/ats
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import { formatAts, lsdsForQuarter, parseAts, quarterCodeForLsd } from "../lib/ats";

describe("parseAts", () => {
  it("parses the quarter-section form", () => {
    expect(parseAts("SE-12-34-5-W4")).toEqual({
      quarter: "SE",
      lsd: undefined,
      section: 12,
      township: 34,
      range: 5,
      meridian: 4,
    });
  });

  it("parses the LSD numeric form", () => {
    expect(parseAts("04-12-034-05-W4")).toEqual({
      lsd: 4,
      quarter: undefined,
      section: 12,
      township: 34,
      range: 5,
      meridian: 4,
    });
  });

  it("parses the 4-token form (no LSD/quarter)", () => {
    expect(parseAts("12-034-05-W4")).toEqual({
      lsd: undefined,
      quarter: undefined,
      section: 12,
      township: 34,
      range: 5,
      meridian: 4,
    });
  });

  it("rejects non-ATS strings and out-of-range values", () => {
    expect(parseAts("hello world")).toBeNull();
    expect(parseAts("99-99-99-W9")).toBeNull();
    expect(parseAts("01-01-128-01-W4")).toBeNull();
  });

  it("accepts the official northern-edge township 127", () => {
    expect(parseAts("01-01-127-01-W4")).toMatchObject({
      lsd: 1,
      section: 1,
      township: 127,
      range: 1,
      meridian: 4,
    });
  });
});

describe("formatAts", () => {
  it("round-trips to a canonical string", () => {
    const loc = parseAts("SE-12-34-5-W4");
    expect(loc).not.toBeNull();
    expect(loc && formatAts(loc)).toBe("SE-12-034-05-W4");
  });
});

describe("ATS subdivisions", () => {
  it("maps official quarter codes and LSD membership", () => {
    expect(lsdsForQuarter("SE")).toEqual([1, 2, 7, 8]);
    expect(lsdsForQuarter("NE")).toEqual([9, 10, 15, 16]);
    expect(quarterCodeForLsd(4)).toBe(2);
    expect(quarterCodeForLsd(13)).toBe(3);
  });
});
