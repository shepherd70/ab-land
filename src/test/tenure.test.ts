/**
 * Tenure presentation semantics: AgreementType labels (incl. application
 * prefix and unknown-code fallbacks), the 9999/8888 expiry sentinels, and
 * per-family substance labels. Offline.
 *
 * Agreement-vs-parcel counting now lives in SQL (`companyHoldingsSummary`); it
 * is covered against a real DB in `company_aliases.test.ts`.
 *
 * @module test/tenure
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import {
  agreementTypeLabel,
  formatAgreementType,
  formatExpiry,
  targetSubstanceLabel,
} from "../lib/tenure";

describe("agreementTypeLabel", () => {
  it("labels the verified PNG lease and licence codes by instrument and region", () => {
    expect(agreementTypeLabel("004")).toBe("Petroleum & Natural Gas Lease – Plains");
    expect(agreementTypeLabel("005")).toBe("Petroleum & Natural Gas Lease – Northern");
    expect(agreementTypeLabel("006")).toBe("Petroleum & Natural Gas Lease – Foothills");
    expect(agreementTypeLabel("053")).toContain("Licence – Plains");
    expect(agreementTypeLabel("054")).toContain("Licence – Northern");
    expect(agreementTypeLabel("055")).toContain("Licence – Foothills");
  });

  it("labels the layer-verified non-PNG codes", () => {
    expect(agreementTypeLabel("013")).toBe("Coal Lease");
    expect(agreementTypeLabel("059")).toBe("Carbon Sequestration Agreement");
    expect(agreementTypeLabel("060")).toBe("Geothermal Lease");
    expect(agreementTypeLabel("061")).toBe("Pore Space Lease");
    expect(agreementTypeLabel("070")).toBe("Oil Sands Permit");
    expect(agreementTypeLabel("075")).toBe("Oil Sands Lease");
    expect(agreementTypeLabel("098")).toBe("Brine Hosted Lease");
  });

  it("labels A-prefixed codes as applications for the base type", () => {
    expect(agreementTypeLabel("A59")).toBe("Carbon Sequestration Agreement – application");
    expect(agreementTypeLabel("A60")).toBe("Geothermal Lease – application");
  });

  it("returns undefined for unknown or absent codes", () => {
    expect(agreementTypeLabel("010")).toBeUndefined(); // deliberately unmapped
    expect(agreementTypeLabel("999")).toBeUndefined();
    expect(agreementTypeLabel(null)).toBeUndefined();
    expect(agreementTypeLabel(undefined)).toBeUndefined();
    expect(agreementTypeLabel("")).toBeUndefined();
  });
});

describe("formatAgreementType", () => {
  it("shows the label, optionally with the raw code", () => {
    expect(formatAgreementType("013")).toBe("Coal Lease");
    expect(formatAgreementType("013", { withCode: true })).toBe("Coal Lease (013)");
  });

  it("falls back to the raw code for unmapped types and a dash when absent", () => {
    expect(formatAgreementType("010")).toBe("Type 010");
    expect(formatAgreementType(null)).toBe("—");
    expect(formatAgreementType(undefined)).toBe("—");
  });
});

describe("formatExpiry", () => {
  it("renders the 9999 sentinel as a continued agreement", () => {
    expect(formatExpiry("9999-12-31")).toBe("Continued / no expiry");
  });

  it("renders the 8888 sentinel as continued — live-verified to share the 9999 field profile", () => {
    // 4,432 ACTIVE PNG parcels carry 8888-12-31; see formatExpiry TSDoc for
    // the 2026-07-10 field verification against GeoView layer 31.
    expect(formatExpiry("8888-12-31")).toBe("Continued / no expiry");
  });

  it("renders both sentinels identically so mixed-sentinel agreements do not claim variance", () => {
    expect(formatExpiry("8888-12-31")).toBe(formatExpiry("9999-12-31"));
  });

  it("passes through a real date and falls back for null", () => {
    expect(formatExpiry("2030-06-30")).toBe("2030-06-30");
    expect(formatExpiry(null)).toBe("—");
  });
});

describe("targetSubstanceLabel", () => {
  it("labels coal's policy-restriction text distinctly from commodity substances", () => {
    expect(targetSubstanceLabel("coal")).toBe("Coal category (policy restriction)");
    expect(targetSubstanceLabel("minerals")).toBe("Target substance");
    expect(targetSubstanceLabel("brine")).toBe("Target substance");
  });
});
