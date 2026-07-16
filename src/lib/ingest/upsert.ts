/**
 * Idempotent upsert into `dispositions`, keyed by (source, agreement_number, tract).
 * Re-running ingest updates existing rows in place; FTS stays synced via triggers.
 *
 * @module lib/ingest/upsert
 * Data source: none (DB write)
 * @see CLAUDE.md §5
 */
import type { DB } from "../db/client";
import type { Disposition } from "../types";

export type UpsertFn = (d: Disposition) => void;

/** Build a prepared upsert bound to the given DB connection. */
export function prepareUpsert(db: DB): UpsertFn {
  const stmt = db.prepare(`
    INSERT INTO dispositions (
      source, family, source_layer, agreement_type, agreement_number, tract, status,
      holder_desrep, holder_desrep_id, participants, holder_norm,
      term_date, current_expiry_date, continuation_date, cancel_date, zone_desc, target_substance,
      area_ha, centroid_lon, centroid_lat, bbox_minx, bbox_miny, bbox_maxx, bbox_maxy,
      geometry_geojson, geometry_simplified_geojson, ingested_at
    ) VALUES (
      @source, @family, @sourceLayer, @agreementType, @agreementNumber, @tract, @status,
      @holderDesrep, @holderDesrepId, @participants, @holderNorm,
      @termDate, @currentExpiryDate, @continuationDate, @cancelDate, @zoneDesc, @targetSubstance,
      @areaHa, @centroidLon, @centroidLat, @bboxMinx, @bboxMiny, @bboxMaxx, @bboxMaxy,
      @geometryGeoJSON, @geometrySimplifiedGeoJSON, @ingestedAt
    )
    ON CONFLICT (source, agreement_number, tract) DO UPDATE SET
      family = excluded.family,
      source_layer = excluded.source_layer,
      agreement_type = excluded.agreement_type,
      status = excluded.status,
      holder_desrep = excluded.holder_desrep,
      holder_desrep_id = excluded.holder_desrep_id,
      participants = excluded.participants,
      holder_norm = excluded.holder_norm,
      term_date = excluded.term_date,
      current_expiry_date = excluded.current_expiry_date,
      continuation_date = excluded.continuation_date,
      cancel_date = excluded.cancel_date,
      zone_desc = excluded.zone_desc,
      target_substance = excluded.target_substance,
      area_ha = excluded.area_ha,
      centroid_lon = excluded.centroid_lon,
      centroid_lat = excluded.centroid_lat,
      bbox_minx = excluded.bbox_minx,
      bbox_miny = excluded.bbox_miny,
      bbox_maxx = excluded.bbox_maxx,
      bbox_maxy = excluded.bbox_maxy,
      geometry_geojson = excluded.geometry_geojson,
      geometry_simplified_geojson = excluded.geometry_simplified_geojson,
      ingested_at = excluded.ingested_at
  `);

  return (d: Disposition) => {
    stmt.run({
      source: d.source,
      family: d.family,
      sourceLayer: d.sourceLayer ?? null,
      agreementType: d.agreementType ?? null,
      agreementNumber: d.agreementNumber,
      tract: d.tract ?? "",
      status: d.status ?? null,
      holderDesrep: d.holderDesrep ?? null,
      holderDesrepId: d.holderDesrepId ?? null,
      participants: d.participants ? JSON.stringify(d.participants) : null,
      holderNorm: d.holderNorm ?? null,
      termDate: d.termDate ?? null,
      currentExpiryDate: d.currentExpiryDate ?? null,
      continuationDate: d.continuationDate ?? null,
      cancelDate: d.cancelDate ?? null,
      zoneDesc: d.zoneDesc ?? null,
      targetSubstance: d.targetSubstance ?? null,
      areaHa: d.areaHa ?? null,
      centroidLon: d.centroid?.[0] ?? null,
      centroidLat: d.centroid?.[1] ?? null,
      bboxMinx: d.bbox?.[0] ?? null,
      bboxMiny: d.bbox?.[1] ?? null,
      bboxMaxx: d.bbox?.[2] ?? null,
      bboxMaxy: d.bbox?.[3] ?? null,
      geometryGeoJSON: d.geometryGeoJSON ?? null,
      geometrySimplifiedGeoJSON: d.geometrySimplifiedGeoJSON ?? null,
      ingestedAt: d.ingestedAt ?? new Date().toISOString(),
    });
  };
}
