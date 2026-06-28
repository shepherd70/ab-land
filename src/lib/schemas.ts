/**
 * Zod schemas validating every external boundary: ArcGIS responses and API I/O.
 * Nothing unvalidated reaches the database.
 *
 * @module lib/schemas
 * Data source: GeoView ArcGIS REST (OGL-Alberta) — response shapes
 * @see CLAUDE.md §6, §11
 */
import { z } from "zod";
import { MINERAL_FAMILIES } from "./map/families";

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
 * Properties shared by the verified GeoView mineral-agreement leaf layers
 * (PNG/31, oil sands/24, coal/39, minerals/57, brine/63, geothermal/72,
 * carbon sequestration/51-52, pore space/75). Every field is optional because
 * families differ slightly — coal omits `Tract`/`ZoneDesc`/continuation+cancel
 * and adds `CoalCategory`; minerals & brine add `TargetSubstance` — and
 * `.loose()` tolerates the remaining per-layer columns. ArcGIS dates arrive as
 * epoch-ms numbers; `normalize` converts them to ISO. Numbers/strings tolerated
 * for id fields.
 */
export const MineralAgreementProps = z
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
    // Variant / extra columns (not present on every layer). TargetSubstance
    // (minerals/brine) and CoalCategory (coal) are persisted to the searchable
    // `target_substance` column; CancelCode is parsed but not yet stored.
    CancelCode: z.union([z.string(), z.number()]).nullish(),
    TargetSubstance: z.string().nullish(),
    CoalCategory: z.string().nullish(),
  })
  .loose();
export type MineralAgreementProps = z.infer<typeof MineralAgreementProps>;

/** @deprecated PNG-era alias of {@link MineralAgreementProps}; kept for back-compat. */
export const PngAgreementProps = MineralAgreementProps;
export type PngAgreementProps = MineralAgreementProps;

/** Query parameters for GET /api/search. */
export const SearchParams = z.object({
  q: z.string().trim().min(1).max(200),
  kind: z.enum(["company", "agreement", "ats", "auto"]).default("auto"),
  family: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SearchParams = z.infer<typeof SearchParams>;

/** The eight open mineral families as a Zod enum (mirrors MINERAL_FAMILIES). */
export const MineralFamilyEnum = z.enum(MINERAL_FAMILIES);

/**
 * Optional comma-separated families param → validated `MineralFamily[]`
 * (undefined when absent/empty). Any unknown token fails the whole request.
 */
const FamiliesCsv = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((t) => t.trim()).filter(Boolean) : undefined))
  .pipe(z.array(MineralFamilyEnum).nonempty().optional());

/** Query parameters for GET /api/map/features. */
export const MapFeaturesParams = z
  .object({
    bbox: z
      .string()
      .transform((s) => s.split(",").map(Number))
      .pipe(
        z.tuple([
          z.number().finite().min(-180).max(180),
          z.number().finite().min(-90).max(90),
          z.number().finite().min(-180).max(180),
          z.number().finite().min(-90).max(90),
        ]),
      ),
    families: FamiliesCsv,
    status: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(4000).default(2000),
  })
  .refine((v) => v.bbox[0] <= v.bbox[2] && v.bbox[1] <= v.bbox[3], {
    message: "bbox must be minx,miny,maxx,maxy with min <= max",
    path: ["bbox"],
  });
export type MapFeaturesParams = z.infer<typeof MapFeaturesParams>;

/** Query parameters for GET /api/map/centroids. */
export const MapCentroidsParams = z.object({ families: FamiliesCsv });
export type MapCentroidsParams = z.infer<typeof MapCentroidsParams>;
