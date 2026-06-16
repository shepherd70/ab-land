/**
 * Surface disposition importer — Tier B, LICENSED, FILES ONLY.
 *
 * GUARDRAIL: this adapter reads ONLY user-supplied Altalis DIDs/DIDs+ files from
 * the local ALTALIS_DIR. It MUST NOT fetch Altalis, the maps.alberta.ca
 * `genesis_winauth` endpoint, or any authenticated/gated source. Surface data is
 * dormant until the user lawfully obtains files and drops them in.
 *
 * @module lib/ingest/surface_adapter
 * Data source: Altalis DIDs+ (licensed, user-supplied)
 * @see CLAUDE.md §2 (Tier B), §11
 */
import { existsSync, readdirSync } from "node:fs";
import type { DB } from "../db/client";
import type { IngestResult } from "./mineral_adapter";

/** Files we know how to attempt to read (extend as formats are supported). */
const SUPPORTED = /\.(geojson|json)$/i;

/**
 * Import any Altalis files present in `dir`. No-op (rows: 0) when the folder is
 * empty or missing — surface support stays dormant. Throws a clear TODO if files
 * are present but the field mapping has not been implemented yet.
 */
export async function ingestSurfaceFiles(db: DB, dir: string): Promise<IngestResult> {
  void db; // will be used once the field mapping is implemented
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => SUPPORTED.test(f))
    : [];

  if (files.length === 0) return { family: "surface", rows: 0 };

  // TODO: implement the DIDs+ field mapping once a sample file's schema is known
  // (client/holder name, disposition number/type, status, dates, geometry CRS).
  // Reuse prepareUpsert() with source = "altalis", family = "surface".
  throw new Error(
    `Surface ingest not implemented. Found ${files.length} file(s) in ${dir}. ` +
      `Implement the Altalis DIDs+ field mapping in lib/ingest/surface_adapter.ts.`,
  );
}
