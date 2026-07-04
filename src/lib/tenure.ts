/**
 * Tenure-domain presentation semantics: AgreementType code → label map, the
 * continued-expiry sentinel, per-family substance labeling, and holdings
 * summaries. Labels are display-layer only — the DB always keeps raw codes.
 *
 * @module lib/tenure
 * Data source: GeoView ArcGIS REST (OGL-Alberta) — codes field-verified 2026-07
 *   against live layer memberships (type-specific leaf layers), PNG public
 *   offering notices/results (content2.energy.alberta.ca), and term-span
 *   analysis; see PR notes.
 * @see CLAUDE.md §2, §5
 */
import type { Disposition, Family } from "./types";

/**
 * AgreementType code → human label.
 *
 * How each entry was verified (2026-07):
 * - Most codes come from type-specific GeoView leaf layers whose distinct
 *   `AgreementType` values were queried live (e.g. layer 39 "Coal Lease" only
 *   contains 013; layer 65 "Brine Hosted Licence" only 099).
 * - PNG codes 004/005/006 (leases) and 053/054/055 (licences) were bound to
 *   instrument × region by joining two months of PNG public offering notices
 *   (LEASE vs LICENCE schedules, Plains/Northern/Foothills regions) to the
 *   agreements GeoView shows for those sale months, via the `TTYYMM####`
 *   agreement-number structure. Licence primary terms (2/4/5 yr) confirmed by
 *   TermDate→CurrentExpiryDate spans and alberta.ca tenure docs.
 * - Legacy 001/002/003 substance scope read from live `ZoneDesc` text
 *   ("PNG…", "NG in…", "PETROLEUM in…"); issued 1950s–80s, no longer sold.
 * - 010 is intentionally unmapped (60 rows, mixed zones, unverifiable) — it
 *   falls back to a raw "Type 010" display.
 */
export const AGREEMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  // Petroleum & natural gas — legacy instruments (no longer issued)
  "001": "Petroleum & Natural Gas Lease (legacy)",
  "002": "Natural Gas Lease (legacy)",
  "003": "Petroleum Lease (legacy)",
  // Petroleum & natural gas — current leases (5-year primary term) by region
  "004": "Petroleum & Natural Gas Lease – Plains",
  "005": "Petroleum & Natural Gas Lease – Northern",
  "006": "Petroleum & Natural Gas Lease – Foothills",
  // Petroleum & natural gas — other
  "041": "PNG Agreement – Soldier Settlement Board",
  "042": "Other Lease",
  // Petroleum & natural gas — current licences (primary term varies by region)
  "053": "Petroleum & Natural Gas Licence – Plains (2-year)",
  "054": "Petroleum & Natural Gas Licence – Northern (4-year)",
  "055": "Petroleum & Natural Gas Licence – Foothills (5-year)",
  // Coal
  "013": "Coal Lease",
  "014": "Coal Road Allowance Lease",
  // Storage & special
  "036": "Natural Gas Storage Agreement",
  "037": "Special Mineral Lease",
  // Carbon sequestration, geothermal, pore space
  "058": "Carbon Sequestration Evaluation Agreement",
  "059": "Carbon Sequestration Agreement",
  "060": "Geothermal Lease",
  "061": "Pore Space Lease",
  // Oil sands (072–075 are lease vintages; all live in the "Oil Sands Lease" layer)
  "070": "Oil Sands Permit",
  "072": "Oil Sands Lease",
  "073": "Oil Sands Lease",
  "074": "Oil Sands Lease",
  "075": "Oil Sands Lease",
  // Metallic & industrial minerals group (incl. brine)
  "093": "Metallic & Industrial Minerals Permit",
  "094": "Metallic & Industrial Minerals Lease",
  "096": "Secondary Mineral Lease",
  "097": "Subsurface Reservoir Lease",
  "098": "Brine Hosted Lease",
  "099": "Brine Hosted Licence",
};

/**
 * Label for an AgreementType code, or undefined when unknown. `A`-prefixed
 * codes (e.g. `A59`, `A60`) are applications for the base type and label as
 * "<base label> – application".
 */
export function agreementTypeLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  const direct = AGREEMENT_TYPE_LABELS[code];
  if (direct) return direct;
  const app = /^A(\d{2,3})$/.exec(code);
  if (app) {
    const base = AGREEMENT_TYPE_LABELS[app[1].padStart(3, "0")];
    if (base) return `${base} – application`;
  }
  return undefined;
}

/**
 * Display string for an AgreementType code: the label (optionally suffixed
 * with the raw code), "Type <code>" when unmapped, or "—" when absent.
 */
export function formatAgreementType(
  code?: string | null,
  opts: { withCode?: boolean } = {},
): string {
  if (!code) return "—";
  const label = agreementTypeLabel(code);
  if (!label) return `Type ${code}`;
  return opts.withCode ? `${label} (${code})` : label;
}

/**
 * Render an expiry date for display. The live GeoView data uses `9999-12-31`
 * (and other `9999-…` values) as a sentinel for continued / no-expiry
 * agreements — show that intent rather than a literal far-future date.
 */
export function formatExpiry(v?: string | null): string {
  return v?.startsWith("9999") ? "Continued / no expiry" : (v ?? "—");
}

/**
 * Row label for the `target_substance` column, which stores a different thing
 * per family: coal's `CoalCategory` is coal-policy restriction text, not a
 * commodity; minerals/brine `TargetSubstance` is a commodity (brine's is
 * always null in the live data).
 */
export function targetSubstanceLabel(family: Family): string {
  return family === "coal" ? "Coal category (policy restriction)" : "Target substance";
}

/** Agreement-level vs parcel-level counts for a set of disposition rows. */
export interface HoldingsSummary {
  /** Distinct agreements: unique (source, family, agreement_number). */
  agreements: number;
  /** Raw rows — one per tract/parcel. */
  parcels: number;
}

/**
 * Summarize rows that may contain several tracts of the same agreement. One
 * agreement can span multiple tracts (natural key source+number+tract), so
 * "N holdings" must never be read off the row count.
 */
export function summarizeHoldings(rows: Disposition[]): HoldingsSummary {
  const agreements = new Set(
    rows.map((r) => `${r.source}/${r.family}/${r.agreementNumber}`),
  );
  return { agreements: agreements.size, parcels: rows.length };
}
