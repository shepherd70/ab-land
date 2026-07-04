/**
 * Mineral-family registry: the single runtime source of truth for the eight
 * Tier-A families — their legend order, display labels, and map colors. Feeds
 * the Zod enum, the legend, and the MapLibre paint expressions reused by the
 * map explorer's circle + fill layers.
 *
 * @module lib/map/families
 * Data source: none (presentation metadata over GeoView families)
 * @see CLAUDE.md §2, §5
 */
import type { MineralFamily } from "../types";

/**
 * The eight open mineral-agreement families, in legend order (PNG first — it is
 * ~92% of the data). The tuple is the runtime companion to the `MineralFamily`
 * union in `types.ts`; it drives the Zod enum, legend, and color map.
 */
export const MINERAL_FAMILIES = [
  "png",
  "oil_sands",
  "coal",
  "minerals",
  "brine",
  "geothermal",
  "carbon_seq",
  "pore_space",
] as const;

/**
 * Per-family display label + map color. `Record<MineralFamily, …>` forces
 * exhaustiveness: adding a family to the union without a style here is a compile
 * error. PNG (the bulk of the data) is a calm blue; the rarer families use
 * saturated, well-separated hues so a handful of parcels are still findable.
 */
export const FAMILY_STYLES: Record<MineralFamily, { label: string; color: string }> = {
  png: { label: "Petroleum & Natural Gas", color: "#2563eb" },
  oil_sands: { label: "Oil Sands", color: "#b45309" },
  coal: { label: "Coal", color: "#334155" },
  minerals: { label: "Metallic & Industrial Minerals", color: "#9333ea" },
  brine: { label: "Brine", color: "#0d9488" },
  geothermal: { label: "Geothermal", color: "#dc2626" },
  carbon_seq: { label: "Carbon Sequestration", color: "#16a34a" },
  pore_space: { label: "Pore Space", color: "#db2777" },
};

/** Fallback color for an unknown / null family value. */
const FALLBACK_COLOR = "#9ca3af";

/** Human label for a family code, or the raw code when unrecognized. */
export function familyLabel(family: string): string {
  return (FAMILY_STYLES as Record<string, { label: string; color: string }>)[family]?.label ?? family;
}

/** Map color for a family code, or grey when unrecognized. */
export function familyColor(family: string): string {
  return (FAMILY_STYLES as Record<string, { label: string; color: string }>)[family]?.color ?? FALLBACK_COLOR;
}

/**
 * A MapLibre `["match", ["get","family"], …]` color expression covering all
 * families with a grey fallback. Reused verbatim by the circle (centroids) and
 * fill (viewport polygons) paint so colors stay in lock-step with the legend.
 */
export function familyColorMatchExpression(): unknown[] {
  const match: unknown[] = ["match", ["get", "family"]];
  for (const family of MINERAL_FAMILIES) {
    match.push(family, FAMILY_STYLES[family].color);
  }
  match.push(FALLBACK_COLOR);
  return match;
}
