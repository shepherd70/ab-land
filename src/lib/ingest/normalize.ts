/**
 * Map raw ArcGIS feature properties into the normalized Disposition shape.
 * All verified GeoView mineral-agreement leaf layers share the same core field
 * names, so one factory (`makeMineralNormalizer`) covers every family — only the
 * `family` tag differs. Register each enabled family in `mineralNormalizers`.
 *
 * @module lib/ingest/normalize
 * Data source: GeoView ArcGIS REST (OGL-Alberta)
 * @see CLAUDE.md §5
 */
import type { Geometry } from "geojson";
import { MineralAgreementProps, type ArcGisFeature } from "../schemas";
import type { Disposition, MineralFamily } from "../types";
import { normalizeCompanyName, parseParticipants } from "../matching/company_names";
import { areaHectares, computeBbox, computeCentroid } from "../spatial/geo";

export type Normalizer = (feature: ArcGisFeature, sourceLayer: string) => Disposition;

/** ArcGIS commonly returns dates as epoch-ms; tolerate ISO strings too. */
function toIsoDate(v: string | number | null | undefined): string | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  const d = Number.isFinite(n) ? new Date(n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * Build a normalizer for any verified GeoView mineral-agreement leaf layer.
 * These layers share identical core field names (see {@link MineralAgreementProps});
 * only the `family` tag — and a few unused extra columns — differ, so one factory
 * serves them all. Missing fields (e.g. coal has no `Tract`) fall back cleanly.
 */
export const makeMineralNormalizer =
  (family: MineralFamily): Normalizer =>
  (feature, sourceLayer) => {
    const p = MineralAgreementProps.parse(feature.properties);
    const participants = parseParticipants(p.Participants ?? undefined);
    const holder = p.DesRep ?? participants[0] ?? "";

    const disp: Disposition = {
      source: "geoview",
      family,
      sourceLayer,
      agreementType: p.AgreementType ?? undefined,
      agreementNumber: String(p.AgreementNumber ?? "").trim(),
      tract: p.Tract != null ? String(p.Tract) : "",
      status: p.Status ?? undefined,
      holderDesrep: p.DesRep ?? undefined,
      holderDesrepId: p.DesRepId != null ? String(p.DesRepId) : undefined,
      participants,
      holderNorm: holder ? normalizeCompanyName(holder) : undefined,
      termDate: toIsoDate(p.TermDate),
      currentExpiryDate: toIsoDate(p.CurrentExpiryDate),
      continuationDate: toIsoDate(p.ContinuationDate),
      cancelDate: toIsoDate(p.CancelDate),
      zoneDesc: p.ZoneDesc ?? undefined,
      targetSubstance: p.TargetSubstance ?? p.CoalCategory ?? undefined,
      ingestedAt: new Date().toISOString(),
    };

    if (feature.geometry) {
      const g = feature.geometry as unknown as Geometry;
      disp.bbox = computeBbox(g);
      disp.centroid = computeCentroid(g);
      disp.areaHa = areaHectares(g);
      disp.geometryGeoJSON = JSON.stringify(feature.geometry);
    }
    return disp;
  };

/** Normalizer for the original verified PNG layer (Mineral_Agreements_Ext_PROD/31). */
export const normalizePng: Normalizer = makeMineralNormalizer("png");

/**
 * Registry of verified normalizers, keyed by family. Every family below is
 * field-verified against its live layer (see config/sources.ts).
 */
export const mineralNormalizers: Partial<Record<MineralFamily, Normalizer>> = {
  png: normalizePng,
  oil_sands: makeMineralNormalizer("oil_sands"),
  coal: makeMineralNormalizer("coal"),
  minerals: makeMineralNormalizer("minerals"),
  brine: makeMineralNormalizer("brine"),
  geothermal: makeMineralNormalizer("geothermal"),
  carbon_seq: makeMineralNormalizer("carbon_seq"),
  pore_space: makeMineralNormalizer("pore_space"),
};
