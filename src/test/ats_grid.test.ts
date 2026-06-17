/**
 * Tests for the approximate ATS → WGS84 grid conversion. Asserts coarse
 * positional correctness (Alberta bounds, quarter/LSD placement, monotonic
 * movement with township/range), not survey-grade precision.
 *
 * @module test/ats_grid
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import { parseAts } from "../lib/ats";
import { atsApproxBbox, atsApproxCentroid } from "../lib/spatial/ats_grid";

function loc(s: string) {
  const parsed = parseAts(s);
  if (!parsed) throw new Error(`fixture descriptor failed to parse: ${s}`);
  return parsed;
}

describe("atsApproxBbox", () => {
  it("places a section within Alberta's WGS84 extent, well-ordered", () => {
    const [minLon, minLat, maxLon, maxLat] = atsApproxBbox(loc("12-034-05-W4"));
    expect(minLon).toBeLessThan(maxLon);
    expect(minLat).toBeLessThan(maxLat);
    expect(minLon).toBeGreaterThan(-120);
    expect(maxLon).toBeLessThan(-108);
    expect(minLat).toBeGreaterThan(49);
    expect(maxLat).toBeLessThan(60);
  });

  it("positions the NE quarter north and east of the SW quarter", () => {
    const [neLon, neLat] = atsApproxCentroid(loc("NE-12-034-05-W4"));
    const [swLon, swLat] = atsApproxCentroid(loc("SW-12-034-05-W4"));
    expect(neLat).toBeGreaterThan(swLat);
    expect(neLon).toBeGreaterThan(swLon); // east = larger (less negative) lon
  });

  it("an LSD cell is smaller than its enclosing section", () => {
    const section = atsApproxBbox(loc("12-034-05-W4"));
    const lsd = atsApproxBbox(loc("04-12-034-05-W4"));
    const width = (b: number[]) => b[2] - b[0];
    const height = (b: number[]) => b[3] - b[1];
    expect(width(lsd)).toBeLessThan(width(section));
    expect(height(lsd)).toBeLessThan(height(section));
  });

  it("moves north as township increases and west as range increases", () => {
    const south = atsApproxCentroid(loc("12-034-05-W4"));
    const north = atsApproxCentroid(loc("12-064-05-W4"));
    expect(north[1]).toBeGreaterThan(south[1]);

    const east = atsApproxCentroid(loc("12-034-05-W4"));
    const west = atsApproxCentroid(loc("12-034-20-W4"));
    expect(west[0]).toBeLessThan(east[0]); // larger range = further west = smaller lon
  });

  it("returns a centroid inside its own bbox", () => {
    const b = atsApproxBbox(loc("SE-12-034-05-W4"));
    const [lon, lat] = atsApproxCentroid(loc("SE-12-034-05-W4"));
    expect(lon).toBeGreaterThanOrEqual(b[0]);
    expect(lon).toBeLessThanOrEqual(b[2]);
    expect(lat).toBeGreaterThanOrEqual(b[1]);
    expect(lat).toBeLessThanOrEqual(b[3]);
  });
});
