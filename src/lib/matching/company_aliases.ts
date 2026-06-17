/**
 * Curated company alias / predecessor groups for broadening company search.
 *
 * HEURISTIC ONLY — groups well-known rebrands and amalgamations so a profile
 * search for one name also surfaces holdings still recorded under a predecessor
 * name. This does NOT assert legal corporate succession or ownership; entries
 * are a search aid only and should be curated against authoritative sources.
 *
 * @module lib/matching/company_aliases
 * Data source: none (curated reference data)
 * @see CLAUDE.md §5, §11
 */
import { normalizeCompanyName } from "./company_names";

/**
 * Each group lists names that refer to the same operating entity over time.
 * The first element is the preferred (canonical) display name. Names are written
 * in natural form and normalized internally, so casing/suffixes don't matter.
 *
 * Seed entries are public, well-documented Canadian oil & gas rebrands/mergers.
 * Extend this list as real holder data is profiled — keep it conservative.
 */
export const ALIAS_GROUPS: readonly (readonly string[])[] = [
  // Cenovus acquired Husky Energy (2021).
  ["Cenovus Energy", "Husky Energy", "Husky Oil Operations", "Husky Oil"],
  // Encana rebranded to Ovintiv (2020).
  ["Ovintiv", "Encana"],
  // Penn West Petroleum rebranded to Obsidian Energy (2017).
  ["Obsidian Energy", "Penn West Petroleum", "Penn West Exploration"],
];

/** normalized member key -> canonical normalized key for its group. */
const toCanonical = new Map<string, string>();
/** canonical normalized key -> all normalized member keys (canonical first). */
const fromCanonical = new Map<string, string[]>();

for (const group of ALIAS_GROUPS) {
  const members = [...new Set(group.map(normalizeCompanyName).filter(Boolean))];
  if (members.length === 0) continue;
  const canonical = members[0];
  fromCanonical.set(canonical, members);
  for (const member of members) toCanonical.set(member, canonical);
}

/**
 * Map a normalized holder key to its canonical group key. Returns the input
 * unchanged when the name belongs to no known alias group.
 */
export function canonicalCompanyKey(normalized: string): string {
  return toCanonical.get(normalized) ?? normalized;
}

/**
 * All normalized holder keys in the same alias group as `normalized` (always
 * includes the input). For a name with no known aliases, returns just `[input]`.
 */
export function aliasGroupKeys(normalized: string): string[] {
  return fromCanonical.get(canonicalCompanyKey(normalized)) ?? [normalized];
}
