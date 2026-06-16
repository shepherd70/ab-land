/**
 * Ingest source registry — the single source of truth for WHAT to ingest.
 * Only `enabled` sources are pulled. A source must be field-`verified` against
 * the live ArcGIS layer before it is enabled.
 *
 * @module config/sources
 * Data source: GeoView ArcGIS REST (OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A)
 *
 * NOTE: only PNG (Mineral_Agreements_Ext_PROD/31) is verified today. To enable
 * another family, open its layer in the ArcGIS REST directory, confirm the field
 * names, add a normalizer mapping in src/lib/ingest/normalize.ts, then flip
 * `verified`/`enabled` here.
 */
import type { SourceDef } from "../src/lib/types";

/** Base URL of the GeoView ArcGIS REST services folder. */
export const ARCGIS_BASE_URL =
  process.env.ARCGIS_BASE_URL ??
  "https://gis.energy.gov.ab.ca/arcgis/rest/services/Geoview";

/**
 * Mineral agreement layers. Layer ids other than PNG are placeholders
 * (layerId: -1) pending verification against the live service.
 */
export const MINERAL_SOURCES: SourceDef[] = [
  {
    family: "png",
    label: "Petroleum and Natural Gas Agreement",
    service: "Mineral_Agreements_Ext_PROD",
    layerId: 31,
    enabled: true,
    verified: true,
  },
  // --- Not yet verified; confirm service + layerId, then enable. ---
  { family: "oil_sands", label: "Oil Sands Agreement", service: "Mineral_Agreements_Ext_PROD", layerId: -1, enabled: false, verified: false },
  { family: "coal", label: "Coal Lease", service: "Mineral_Agreements_Ext_PROD", layerId: -1, enabled: false, verified: false },
  { family: "minerals", label: "Metallic and Industrial Minerals Lease", service: "Mineral_Agreements_Ext_PROD", layerId: -1, enabled: false, verified: false },
  { family: "brine", label: "Brine Hosted Lease", service: "Mineral_Agreements_Ext_PROD", layerId: -1, enabled: false, verified: false },
  { family: "geothermal", label: "Geothermal Lease", service: "Geothermal_Agreements_Ext_PROD", layerId: -1, enabled: false, verified: false },
  { family: "carbon_seq", label: "Carbon Sequestration Agreement", service: "Mineral_Agreements_Ext_PROD", layerId: -1, enabled: false, verified: false },
  { family: "pore_space", label: "Pore Space Lease", service: "Mineral_Agreements_Ext_PROD", layerId: -1, enabled: false, verified: false },
];

/** The sources that ingest will actually pull. */
export const enabledMineralSources = (): SourceDef[] =>
  MINERAL_SOURCES.filter((s) => s.enabled && s.verified);
