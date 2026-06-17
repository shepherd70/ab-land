/**
 * Alberta Township System (ATS / DLS) legal-land-description parsing.
 * Format: [LSD|Quarter]-Section-Township-Range-WMeridian, e.g. "04-12-034-05-W4"
 * or "SE-12-34-5-W4".
 *
 * @module lib/ats
 * Data source: none (string parsing)
 * @see CLAUDE.md §1 (search by location)
 *
 * This module only parses/normalizes the descriptor. `lib/spatial/ats_grid`
 * turns an AtsLocation into an approximate WGS84 bbox for a coarse spatial
 * filter; an authoritative polygon match via the GeoView `ATS_Grid_Ext_PROD`
 * layer is a network-dependent follow-up.
 */

export type Quarter = "NE" | "NW" | "SE" | "SW";

export interface AtsLocation {
  lsd?: number; // 1..16
  quarter?: Quarter;
  section: number; // 1..36
  township: number; // 1..126
  range: number; // 1..34
  meridian: 4 | 5 | 6; // West of 4th/5th/6th meridian
}

const QUARTERS: ReadonlySet<string> = new Set(["NE", "NW", "SE", "SW"]);

function inRange(n: number, lo: number, hi: number): boolean {
  return Number.isInteger(n) && n >= lo && n <= hi;
}

/**
 * Parse a flexible ATS string. Returns null if it does not look like a valid
 * legal land description.
 */
export function parseAts(input: string): AtsLocation | null {
  const tokens = input
    .toUpperCase()
    .trim()
    .split(/[\s\-/.,]+/)
    .filter(Boolean);

  // Expect either 4 tokens (sec-twp-rge-mer) or 5 (lsd/qtr-sec-twp-rge-mer).
  if (tokens.length !== 4 && tokens.length !== 5) return null;

  let lsd: number | undefined;
  let quarter: Quarter | undefined;
  let rest = tokens;

  if (tokens.length === 5) {
    const head = tokens[0];
    if (QUARTERS.has(head)) {
      quarter = head as Quarter;
    } else if (inRange(Number(head), 1, 16)) {
      lsd = Number(head);
    } else {
      return null;
    }
    rest = tokens.slice(1);
  }

  const [secRaw, twpRaw, rgeRaw, merRaw] = rest;
  const section = Number(secRaw);
  const township = Number(twpRaw);
  const range = Number(rgeRaw);
  const meridianMatch = /^W?([456])$/.exec(merRaw);

  if (!meridianMatch) return null;
  if (!inRange(section, 1, 36)) return null;
  if (!inRange(township, 1, 126)) return null;
  if (!inRange(range, 1, 34)) return null;

  const meridian = Number(meridianMatch[1]) as 4 | 5 | 6;
  return { lsd, quarter, section, township, range, meridian };
}

/** Canonical string form, e.g. "SE-12-034-05-W4". */
export function formatAts(loc: AtsLocation): string {
  const head = loc.quarter ?? (loc.lsd ? String(loc.lsd).padStart(2, "0") : undefined);
  const sec = String(loc.section).padStart(2, "0");
  const twp = String(loc.township).padStart(3, "0");
  const rge = String(loc.range).padStart(2, "0");
  const mer = `W${loc.meridian}`;
  return [head, sec, twp, rge, mer].filter(Boolean).join("-");
}
