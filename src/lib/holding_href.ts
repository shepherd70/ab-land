/**
 * Canonical links to a holding, including fields needed to disambiguate reused
 * legacy agreement numbers without changing the human-readable route segment.
 *
 * @module lib/holding_href
 * Data source: none (URL construction)
 * @see CLAUDE.md §1, §5
 */

export interface HoldingLinkIdentity {
  agreementNumber: string;
  source?: string;
  family?: string;
  agreementType?: string;
}

/** Build a detail URL that selects one distinct agreement identity. */
export function holdingHref(identity: HoldingLinkIdentity): string {
  const params = new URLSearchParams();
  if (identity.source) params.set("source", identity.source);
  if (identity.family) params.set("family", identity.family);
  if (identity.agreementType) params.set("type", identity.agreementType);
  const query = params.toString();
  const path = `/holdings/${encodeURIComponent(identity.agreementNumber)}`;
  return query ? `${path}?${query}` : path;
}
