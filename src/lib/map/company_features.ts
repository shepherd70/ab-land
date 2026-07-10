/**
 * Company-map payload policy: whether a holder's parcels ship as full polygons
 * or fall back to centroid points. The worst holders are too big to send raw
 * (CNRL: ~15.5k parcels / ~23 MB of stored polygon GeoJSON), so the decision is
 * made from a lean byte-count BEFORE any geometry is fetched.
 *
 * @module lib/map/company_features
 * Data source: none (policy over already-ingested DB rows)
 * @see CLAUDE.md §5
 */
import type { Disposition } from "../types";

/**
 * Stored-geometry byte budget above which a company map degrades to centroids.
 * ~8 MB keeps mid-size holders (e.g. Cenovus ~6.6 MB) as real polygons while
 * refusing the pathological portfolios. Injectable for tests and tuning.
 */
export const DEFAULT_GEOMETRY_BYTE_BUDGET = 8 * 1024 * 1024;

/** How a company's parcels are represented on the map. */
export type CompanyMapMode = "polygons" | "centroids";

/**
 * Pick the representation for a holder whose stored polygon GeoJSON totals
 * `geometryBytes`: full polygons when within budget, centroid points otherwise.
 */
export function pickCompanyMapMode(
  geometryBytes: number,
  budget: number = DEFAULT_GEOMETRY_BYTE_BUDGET,
): CompanyMapMode {
  return geometryBytes <= budget ? "polygons" : "centroids";
}

/**
 * Lean per-feature properties for the company map — the same shape the
 * /api/map/features route ships, so the shared popup renders both.
 */
export function companyFeatureProps(d: Disposition): Record<string, unknown> {
  return {
    agreementNumber: d.agreementNumber,
    tract: d.tract ?? null,
    family: d.family,
    status: d.status ?? null,
    currentExpiryDate: d.currentExpiryDate ?? null,
    areaHa: d.areaHa ?? null,
    agreementType: d.agreementType ?? null,
  };
}
