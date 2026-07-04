/**
 * Tenure presentation semantics: AgreementType labels (incl. application
 * prefix and unknown-code fallbacks), the 9999 expiry sentinel, per-family
 * substance labels, and agreement-vs-parcel holdings summaries. Offline.
 *
 * @module test/tenure
 * @see CLAUDE.md §10
 */
import { describe, expect, it } from "vitest";
import {
  agreementTypeLabel,
  formatAgreementType,
  formatExpiry,
  summarizeHoldings,
  targetSubstanceLabel,
} from "../lib/tenure";
import type { Disposition } from "../lib/types";

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

describe("summarizeHoldings", () => {
  const row = (agreementNumber: string, tract: string, family = "png"): Disposition => ({
    source: "geoview",
    family: family as Disposition["family"],
    agreementNumber,
    tract,
  });

  it("counts multi-tract agreements once while counting every parcel", () => {
    const rows = [row("5495110028", "01"), row("5495110028", "02"), row("0500001", "01")];
    expect(summarizeHoldings(rows)).toEqual({ agreements: 2, parcels: 3 });
  });

  it("treats the same number in different families as distinct agreements", () => {
    const rows = [row("0700010", "01", "png"), row("0700010", "01", "oil_sands")];
    expect(summarizeHoldings(rows)).toEqual({ agreements: 2, parcels: 2 });
  });

  it("handles the empty case", () => {
    expect(summarizeHoldings([])).toEqual({ agreements: 0, parcels: 0 });
  });
});
