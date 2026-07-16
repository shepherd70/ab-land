/**
 * Tenure-domain presentation semantics: AgreementType code → label map, the
 * continued-expiry sentinels, per-family substance labeling, and holdings
 * summaries. Labels are display-layer only — the DB always keeps raw codes.
 *
 * @module lib/tenure
 * Data source: GeoView ArcGIS REST (OGL-Alberta) — codes field-verified 2026-07
 *   against live layer memberships (type-specific leaf layers), PNG public
 *   offering notices/results (content2.energy.alberta.ca), and term-span
 *   analysis; see PR notes.
 * @see CLAUDE.md §2, §5
 */
import type { Family } from "./types";

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

/** `A`-prefixed AgreementType codes (e.g. `A59`, `A60`) are applications. */
const APPLICATION_CODE = /^A(\d{2,3})$/;

/**
 * True when the AgreementType code is an application for tenure (`A`-prefixed,
 * e.g. `A59`, `A60`) — a request that has not been granted, not held tenure.
 * GeoView publishes a handful of these in the tenure leaf layers; we keep them
 * (faithful to the source, like the sentinels and "Type 010" fallback) but
 * badge them in search, holding, and map views rather than excluding them.
 * Unlike the "– application" label suffix, this works for `A`-codes whose base
 * type is unmapped.
 */
export function isApplicationType(code?: string | null): boolean {
  return code != null && APPLICATION_CODE.test(code);
}

/**
 * Label for an AgreementType code, or undefined when unknown. `A`-prefixed
 * codes (e.g. `A59`, `A60`) are applications for the base type and label as
 * "<base label> – application".
 */
export function agreementTypeLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  const direct = AGREEMENT_TYPE_LABELS[code];
  if (direct) return direct;
  const app = APPLICATION_CODE.exec(code);
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
 * Render an expiry date for display. The live GeoView data uses TWO far-future
 * sentinels in `CurrentExpiryDate` instead of a real date: `9999-12-31`
 * (~58.6k parcels, all families) and `8888-12-31` (4,432 parcels, all PNG).
 *
 * Field-verified live against layer 31 (2026-07-10): 8888 rows carry the exact
 * field profile of the 9999 continued rows — Status ACTIVE, past
 * `ContinuationDate`, `ContinuationPending='N'`, empty `CancelCode` — and no
 * public GoA document distinguishes the two (checked: GeoView user manual,
 * GeoDiscover metadata, ETS PNG-continuation guides). Both therefore render
 * the shared verified meaning: continued, no fixed expiry on record. 8888 rows
 * correlate with multi-interval `ZoneDesc` (75% vs 1% of 9999) but that is a
 * correlate, not a documented definition — do not label the sentinels
 * differently without a GoA source.
 */
export function formatExpiry(v?: string | null): string {
  return v && (v.startsWith("9999") || v.startsWith("8888"))
    ? "Continued / no expiry"
    : (v ?? "—");
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

/**
 * Agreement-level vs parcel-level counts for a company's holdings. One
 * agreement can span several tracts (natural key source+number+tract), so
 * "N agreements" must never be read off the row count. Computed in SQL over
 * every matching row — see `companyHoldingsSummary` in lib/db/queries.
 */
export interface HoldingsSummary {
  /** Distinct agreements: unique (source, family, agreement_number). */
  agreements: number;
  /** Raw rows — one per tract/parcel. */
  parcels: number;
}
