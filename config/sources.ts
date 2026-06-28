/**
 * Ingest source registry — the single source of truth for WHAT to ingest.
 * Only `enabled` sources are pulled. A source must be field-`verified` against
 * the live ArcGIS layer before it is enabled.
 *
 * @module config/sources
 * Data source: GeoView ArcGIS REST (OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A)
 *
 * NOTE: all eight mineral families below are field-verified against their live
 * layers (all in Mineral_Agreements_Ext_PROD) and enabled. We ingest only the
 * tenure leaf layers (agreements/leases — "who holds the agreement"); ArcGIS
 * group nodes, Applications, and Postings are intentionally excluded. To add a
 * family, open its layer in the ArcGIS REST directory, confirm the field names,
 * register a normalizer in src/lib/ingest/normalize.ts, then add it here with
 * `verified`/`enabled` set.
 */
import type { SourceDef } from "../src/lib/types";

/** Base URL of the GeoView ArcGIS REST services folder. */
export const ARCGIS_BASE_URL =
  process.env.ARCGIS_BASE_URL ??
  "https://gis.energy.gov.ab.ca/arcgis/rest/services/Geoview";

/**
 * Mineral agreement layers, all in the Mineral_Agreements_Ext_PROD MapServer and
 * all field-verified (see header). Row counts noted are as observed at
 * verification time (2026-06) and will drift as tenure changes.
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
  // Oil sands: layer 24 "Oil Sands Agreement" is the umbrella (AgreementType
  // 070/072-075), a superset of layer 26 "Oil Sands Lease" (072-075). We ingest
  // 24 only — adding 26 would duplicate ~4,860 lease rows. (~4,874 rows)
  { family: "oil_sands", label: "Oil Sands Agreement", service: "Mineral_Agreements_Ext_PROD", layerId: 24, enabled: true, verified: true },
  // Coal: leaf "Coal Lease" (36 "Coal Agreement" is a group node). This layer has
  // no Tract field, but agreement numbers are unique so the empty-tract natural
  // key is collision-free. (~714 rows)
  { family: "coal", label: "Coal Lease", service: "Mineral_Agreements_Ext_PROD", layerId: 39, enabled: true, verified: true },
  // Metallic & industrial minerals lease (53 "...Agreements" is a group). (~300 rows)
  { family: "minerals", label: "Metallic and Industrial Minerals Lease", service: "Mineral_Agreements_Ext_PROD", layerId: 57, enabled: true, verified: true },
  // Brine hosted lease. (~17 rows)
  { family: "brine", label: "Brine Hosted Lease", service: "Mineral_Agreements_Ext_PROD", layerId: 63, enabled: true, verified: true },
  // Geothermal: verified at Mineral_Agreements_Ext_PROD/72 "Geothermal Agreement"
  // (~88 rows, PNG-identical schema). This supersedes CLAUDE.md's pointer to the
  // separate Geothermal_Agreements_Ext_PROD service, whose lease layer holds fewer
  // rows (70) — keeping a single service is simpler and more complete.
  { family: "geothermal", label: "Geothermal Agreement", service: "Mineral_Agreements_Ext_PROD", layerId: 72, enabled: true, verified: true },
  // Carbon sequestration has two distinct tenure agreements; both ingest under the
  // carbon_seq family (48 is a group node; 49/50 are applications, not tenure).
  { family: "carbon_seq", label: "Carbon Sequestration Agreement (059)", service: "Mineral_Agreements_Ext_PROD", layerId: 52, enabled: true, verified: true },
  { family: "carbon_seq", label: "Carbon Sequestration Evaluation Agreement (058)", service: "Mineral_Agreements_Ext_PROD", layerId: 51, enabled: true, verified: true },
  // Pore space: leaf "061 - Pore Space Lease" (73 "Pore Space Agreement" is a group). (~8 rows)
  { family: "pore_space", label: "Pore Space Lease (061)", service: "Mineral_Agreements_Ext_PROD", layerId: 75, enabled: true, verified: true },
];

/** The sources that ingest will actually pull. */
export const enabledMineralSources = (): SourceDef[] =>
  MINERAL_SOURCES.filter((s) => s.enabled && s.verified);
