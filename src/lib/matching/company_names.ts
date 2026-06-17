/**
 * Company-name normalization for "all holdings of company X" search.
 * Heuristic only — handles casing, punctuation, and legal suffixes. It does NOT
 * resolve corporate predecessors after agreement transfers; never treat a match
 * as authoritative ownership.
 *
 * @module lib/matching/company_names
 * Data source: none (string normalization)
 * @see CLAUDE.md §5, §11
 *
 * Predecessor/rebrand resolution (amalgamations, rebrands) lives in the curated
 * alias table in `company_aliases.ts`; this module handles only normalization.
 */

/** Legal suffixes stripped from the tail of a name. */
const LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  "LTD",
  "LIMITED",
  "INC",
  "INCORPORATED",
  "ULC",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LP",
  "LLP",
  "LLC",
  "PARTNERSHIP",
]);

/**
 * Produce a stable comparison key: uppercase, de-accented, punctuation removed,
 * `&` expanded to `AND`, trailing legal suffixes dropped.
 */
export function normalizeCompanyName(raw: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // strip combining marks (diacritics)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ") // drop punctuation
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/**
 * Split a raw "Participants" string (delimiter varies) into individual holder
 * names. Conservative: splits on `;`, `/`, or runs of 2+ spaces.
 */
export function parseParticipants(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s*[;/]\s*|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}
