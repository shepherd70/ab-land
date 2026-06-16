/**
 * Paged, validated client for the GeoView ArcGIS REST `query` endpoint.
 * Streams features page-by-page (maxRecordCount), requesting GeoJSON in WGS84.
 * Polite by default (throttled). Every page is Zod-validated.
 *
 * @module lib/ingest/arcgis_client
 * Data source: GeoView ArcGIS REST (OGL-Alberta)
 * @see CLAUDE.md §2 (Tier A), §11
 */
import { ArcGisFeatureCollection, type ArcGisFeature } from "../schemas";

export interface ArcGisQueryOptions {
  /** Services folder base, e.g. https://.../rest/services/Geoview */
  baseUrl: string;
  /** Service name, e.g. "Mineral_Agreements_Ext_PROD". */
  service: string;
  /** Layer id, e.g. 31. */
  layerId: number;
  where?: string;
  outFields?: string;
  pageSize?: number;
  outSR?: number;
  /** Delay between pages, ms. */
  throttleMs?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Async-iterate every feature matching the query, transparently paging via
 * resultOffset until a short page signals the end.
 */
export async function* queryFeatures(
  opts: ArcGisQueryOptions,
): AsyncGenerator<ArcGisFeature> {
  const {
    baseUrl,
    service,
    layerId,
    where = "1=1",
    outFields = "*",
    pageSize = Number(process.env.INGEST_PAGE_SIZE) || 1000,
    outSR = Number(process.env.INGEST_OUT_SR) || 4326,
    throttleMs = 200,
    signal,
  } = opts;

  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${baseUrl}/${service}/MapServer/${layerId}/query`);
    url.searchParams.set("where", where);
    url.searchParams.set("outFields", outFields);
    url.searchParams.set("outSR", String(outSR));
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("f", "geojson");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", String(pageSize));

    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(
        `ArcGIS query failed: ${res.status} ${res.statusText} — ${service}/${layerId} @offset ${offset}`,
      );
    }

    const page = ArcGisFeatureCollection.parse(await res.json());
    for (const feature of page.features) yield feature;

    if (page.features.length < pageSize) break;
    if (throttleMs) await sleep(throttleMs);
  }
}
