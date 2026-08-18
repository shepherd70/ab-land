/**
 * Read-only mineral-ingest health derived from durable run logs, with a
 * backward-compatible fallback to row timestamps in pre-observability DBs.
 *
 * @module lib/ingest/health
 * Data source: local SQLite (GeoView ingest metadata)
 * @see CLAUDE.md §3, §5
 */
import type { DB } from "../db/client";

export type IngestRunStatus = "running" | "ok" | "error";

export interface IngestHealth {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptStatus: IngestRunStatus | null;
  lastError: string | null;
  stale: boolean;
  usedLegacyTimestamp: boolean;
}

interface RunRow {
  started_at: string;
  finished_at: string | null;
  status: string | null;
  message: string | null;
}

function hasRunLogShape(db: DB): boolean {
  const columns = db.prepare("SELECT name FROM pragma_table_info('ingest_runs')").all() as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));
  return names.has("parent_run_id") && names.has("source_layer");
}

function asStatus(value: string | null | undefined): IngestRunStatus | null {
  return value === "running" || value === "ok" || value === "error" ? value : null;
}

function isStale(timestamp: string | null, now: Date, staleAfterDays: number): boolean {
  if (!timestamp) return true;
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return true;
  return now.getTime() - time > staleAfterDays * 24 * 60 * 60 * 1000;
}

/** Read the latest full mineral refresh and classify its freshness. */
export function getIngestHealth(
  db: DB,
  options: { now?: Date; staleAfterDays?: number } = {},
): IngestHealth {
  const now = options.now ?? new Date();
  const staleAfterDays = options.staleAfterDays ?? 8;
  let latestAttempt: RunRow | undefined;
  let latestSuccess: RunRow | undefined;

  if (hasRunLogShape(db)) {
    latestAttempt = db
      .prepare(
        `SELECT started_at, finished_at, status, message
         FROM ingest_runs
         WHERE source = 'geoview' AND parent_run_id IS NULL
           AND family IS NULL AND source_layer IS NULL
         ORDER BY id DESC LIMIT 1`,
      )
      .get() as RunRow | undefined;
    latestSuccess = db
      .prepare(
        `SELECT started_at, finished_at, status, message
         FROM ingest_runs
         WHERE source = 'geoview' AND parent_run_id IS NULL
           AND family IS NULL AND source_layer IS NULL AND status = 'ok'
         ORDER BY id DESC LIMIT 1`,
      )
      .get() as RunRow | undefined;
  }

  const legacy = db
    .prepare("SELECT MIN(ingested_at) AS at FROM dispositions WHERE source = 'geoview'")
    .get() as { at: string | null };
  const loggedSuccessAt = latestSuccess?.finished_at ?? null;
  const lastSuccessAt = loggedSuccessAt ?? legacy.at;

  return {
    lastSuccessAt,
    lastAttemptAt: latestAttempt?.finished_at ?? latestAttempt?.started_at ?? null,
    lastAttemptStatus: asStatus(latestAttempt?.status),
    lastError: latestAttempt?.status === "error" ? latestAttempt.message : null,
    stale: isStale(lastSuccessAt, now, staleAfterDays),
    usedLegacyTimestamp: !loggedSuccessAt && legacy.at != null,
  };
}
