/**
 * @module test/ats
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import { formatAts, parseAts } from "../lib/ats";

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
  });
});

describe("formatAts", () => {
  it("round-trips to a canonical string", () => {
    const loc = parseAts("SE-12-34-5-W4");
    expect(loc).not.toBeNull();
    expect(loc && formatAts(loc)).toBe("SE-12-034-05-W4");
  });
});
