/**
 * Zod schemas validating every external boundary: ArcGIS responses and API I/O.
 * Nothing unvalidated reaches the database.
 *
 * @module lib/schemas
 * Data source: GeoView ArcGIS REST (OGL-Alberta) — response shapes
 * @see CLAUDE.md §6, §11
 */
import { z } from "zod";

/** A GeoJSON geometry as returned by ArcGIS with f=geojson, outSR=4326. */
export const GeoJsonGeometry = z
  .object({
    type: z.string(),
    coordinates: z.array(z.unknown()),
  })
  .loose();

/** A single GeoJSON feature; properties vary per layer, so kept loose. */
export const ArcGisFeature = z.object({
  type: z.literal("Feature"),
  geometry: GeoJsonGeometry.nullable(),
  properties: z.record(z.string(), z.unknown()),
});

/** A GeoJSON FeatureCollection page from an ArcGIS query. */
export const ArcGisFeatureCollection = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(ArcGisFeature),
  exceededTransferLimit: z.boolean().optional(),
});
export type ArcGisFeatureCollection = z.infer<typeof ArcGisFeatureCollection>;
export type ArcGisFeature = z.infer<typeof ArcGisFeature>;

/**
 * Properties of the VERIFIED PNG agreement layer
 * (Mineral_Agreements_Ext_PROD/31). ArcGIS dates arrive as epoch-ms numbers;
 * `normalize` converts them to ISO. Numbers/strings tolerated for id fields.
 */
export const PngAgreementProps = z
  .object({
    AgreementType: z.string().nullish(),
    AgreementNumber: z.union([z.string(), z.number()]).nullish(),
    Tract: z.union([z.string(), z.number()]).nullish(),
    Status: z.string().nullish(),
    DesRep: z.string().nullish(),
    DesRepId: z.union([z.string(), z.number()]).nullish(),
    Participants: z.string().nullish(),
    CurrentExpiryDate: z.union([z.string(), z.number()]).nullish(),
    ContinuationDate: z.union([z.string(), z.number()]).nullish(),
    CancelDate: z.union([z.string(), z.number()]).nullish(),
    TermDate: z.union([z.string(), z.number()]).nullish(),
    ZoneDesc: z.string().nullish(),
  })
  .loose();
export type PngAgreementProps = z.infer<typeof PngAgreementProps>;

/** Query parameters for GET /api/search. */
export const SearchParams = z.object({
  q: z.string().trim().min(1).max(200),
  kind: z.enum(["company", "agreement", "ats", "auto"]).default("auto"),
  family: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SearchParams = z.infer<typeof SearchParams>;
