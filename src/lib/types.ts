/**
 * Shared domain types for ab-land (the normalized "disposition core").
 *
 * @module lib/types
 * Data source: none (type definitions)
 * @see CLAUDE.md §5
 */

/** Where a row originated. */
export type DataSource = "geoview" | "altalis";

/** Open mineral agreement families (Tier A, GeoView). */
export type MineralFamily =
  | "png"
  | "oil_sands"
  | "coal"
  | "minerals"
  | "brine"
  | "geothermal"
  | "carbon_seq"
  | "pore_space";

/** All disposition families, including licensed surface dispositions (Tier B). */
export type Family = MineralFamily | "surface";

/**
 * One entry in the ingest source registry (`config/sources.ts`).
 * Describes a single ArcGIS layer to pull.
 */
export interface SourceDef {
  family: MineralFamily;
  /** Human label, e.g. "Petroleum and Natural Gas Agreement". */
  label: string;
  /** ArcGIS service name, e.g. "Mineral_Agreements_Ext_PROD". */
  service: string;
  /** Layer id within the MapServer, e.g. 31. */
  layerId: number;
  /** Only enabled sources are ingested. */
  enabled: boolean;
  /** True once the field schema has been confirmed against the live layer. */
  verified: boolean;
}

/**
 * Normalized disposition record. Every source adapter maps into this shape
 * before it is upserted into the `dispositions` table.
 */
export interface Disposition {
  id?: number;
  source: DataSource;
  family: Family;
  /** Service/layer the row came from, e.g. "Mineral_Agreements_Ext_PROD/31". */
  sourceLayer?: string;
  agreementType?: string;
  agreementNumber: string;
  tract?: string;
  status?: string;
  /** Designated representative — the primary holder. */
  holderDesrep?: string;
  holderDesrepId?: string;
  /** Working-interest participants (holder names). */
  participants?: string[];
  /** Normalized holder key used for company search (see lib/matching). */
  holderNorm?: string;
  /** All dates ISO-8601 (YYYY-MM-DD). */
  termDate?: string;
  currentExpiryDate?: string;
  continuationDate?: string;
  cancelDate?: string;
  zoneDesc?: string;
  /** Mineral/brine TargetSubstance, or coal CoalCategory — free-text searchable. */
  targetSubstance?: string;
  areaHa?: number;
  /** [lon, lat] in WGS84. */
  centroid?: [number, number];
  /** [minX, minY, maxX, maxY] in WGS84. */
  bbox?: [number, number, number, number];
  /** GeoJSON Polygon/MultiPolygon (WGS84) as a string. */
  geometryGeoJSON?: string;
  ingestedAt?: string;
}
