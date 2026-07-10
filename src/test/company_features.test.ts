/**
 * Unit tests for the company-map payload policy (polygons vs centroids) and
 * the centroid FeatureCollection builder.
 *
 * @module test/company_features
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import type { Point } from "geojson";
import {
  DEFAULT_GEOMETRY_BYTE_BUDGET,
  companyFeatureProps,
  pickCompanyMapMode,
} from "@/lib/map/company_features";
import { dispositionsToCentroidFeatureCollection } from "@/lib/map/geojson";
import type { Disposition } from "@/lib/types";

function disp(overrides: Partial<Disposition>): Disposition {
  return {
    source: "geoview",
    family: "png",
    agreementNumber: "0500001",
    ...overrides,
  };
}

describe("pickCompanyMapMode", () => {
  it("keeps polygons within the budget (inclusive)", () => {
    expect(pickCompanyMapMode(0)).toBe("polygons");
    expect(pickCompanyMapMode(DEFAULT_GEOMETRY_BYTE_BUDGET)).toBe("polygons");
  });

  it("degrades to centroids above the budget", () => {
    expect(pickCompanyMapMode(DEFAULT_GEOMETRY_BYTE_BUDGET + 1)).toBe("centroids");
    // The known worst case: CNRL stores ~23 MB of polygons.
    expect(pickCompanyMapMode(23 * 1024 * 1024)).toBe("centroids");
  });

  it("honours an injected budget", () => {
    expect(pickCompanyMapMode(100, 50)).toBe("centroids");
    expect(pickCompanyMapMode(100, 200)).toBe("polygons");
  });
});

describe("dispositionsToCentroidFeatureCollection", () => {
  it("builds Point features from precomputed centroids", () => {
    const fc = dispositionsToCentroidFeatureCollection(
      [disp({ centroid: [-114.1, 51.2], tract: "01", status: "ACTIVE" })],
      companyFeatureProps,
    );
    expect(fc.features).toHaveLength(1);
    const feat = fc.features[0];
    expect(feat.geometry.type).toBe("Point");
    expect((feat.geometry as Point).coordinates).toEqual([-114.1, 51.2]);
    expect(feat.properties).toMatchObject({
      agreementNumber: "0500001",
      tract: "01",
      family: "png",
      status: "ACTIVE",
    });
  });

  it("drops rows without a centroid", () => {
    const fc = dispositionsToCentroidFeatureCollection(
      [disp({}), disp({ agreementNumber: "0500002", centroid: [-113, 55] })],
      companyFeatureProps,
    );
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties?.agreementNumber).toBe("0500002");
  });
});
