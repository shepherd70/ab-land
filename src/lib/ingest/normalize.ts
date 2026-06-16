/**
 * Map raw ArcGIS feature properties into the normalized Disposition shape.
 * Only the PNG mapping is implemented (verified layer); add others as families
 * are confirmed and register them in `mineralNormalizers`.
 *
 * @module lib/ingest/normalize
 * Data source: GeoView ArcGIS REST (OGL-Alberta)
 * @see CLAUDE.md §5
 */
import type { Geometry } from "geojson";
import { PngAgreementProps, type ArcGisFeature } from "../schemas";
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

/** Normalizer for Mineral_Agreements_Ext_PROD/31 (Petroleum & Natural Gas). */
export const normalizePng: Normalizer = (feature, sourceLayer) => {
  const p = PngAgreementProps.parse(feature.properties);
  const participants = parseParticipants(p.Participants ?? undefined);
  const holder = p.DesRep ?? participants[0] ?? "";

  const disp: Disposition = {
    source: "geoview",
    family: "png",
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

/** Registry of verified normalizers, keyed by family. */
export const mineralNormalizers: Partial<Record<MineralFamily, Normalizer>> = {
  png: normalizePng,
};
