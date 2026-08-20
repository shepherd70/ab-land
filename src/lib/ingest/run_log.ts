/**
 * Durable ingest-run logging for full refreshes and their individual layers.
 *
 * @module lib/ingest/run_log
 * Data source: none (local SQLite operational metadata)
 * @see CLAUDE.md §3, §5
 */
import type { DB } from "../db/client";
import type { MineralFamily } from "../types";

export interface StartIngestRunOptions {
  parentRunId?: number;
  source: string;
  family?: MineralFamily;
  sourceLayer?: string;
  message?: string;
  startedAt?: string;
}

export interface FinishIngestRunOptions {
  rowsUpserted: number;
  rowsDeleted: number;
  message?: string;
  finishedAt?: string;
}

/** Insert a visible `running` attempt before any network work starts. */
export function startIngestRun(db: DB, options: StartIngestRunOptions): number {
  const result = db
    .prepare(
      `INSERT INTO ingest_runs (
         parent_run_id, started_at, source, family, source_layer, status, message
       ) VALUES (
         @parentRunId, @startedAt, @source, @family, @sourceLayer, 'running', @message
       )`,
    )
    .run({
      parentRunId: options.parentRunId ?? null,
      startedAt: options.startedAt ?? new Date().toISOString(),
      source: options.source,
      family: options.family ?? null,
      sourceLayer: options.sourceLayer ?? null,
      message: options.message ?? null,
    });
  return Number(result.lastInsertRowid);
}

/** Mark a staged run as atomically published. */
export function finishIngestRun(
  db: DB,
  runId: number,
  options: FinishIngestRunOptions,
): void {
  db.prepare(
    `UPDATE ingest_runs
     SET finished_at = @finishedAt,
         rows_upserted = @rowsUpserted,
         rows_deleted = @rowsDeleted,
         status = 'ok',
         message = @message
     WHERE id = @runId`,
  ).run({
    runId,
    finishedAt: options.finishedAt ?? new Date().toISOString(),
    rowsUpserted: options.rowsUpserted,
    rowsDeleted: options.rowsDeleted,
    message: options.message ?? null,
  });
}

/** Mark a running attempt as failed while keeping its previous live data. */
export function failIngestRun(
  db: DB,
  runId: number,
  error: unknown,
  finishedAt: string = new Date().toISOString(),
): void {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.slice(0, 2000);
  db.prepare(
    `UPDATE ingest_runs
     SET finished_at = ?, status = 'error', message = ?
     WHERE id = ? AND status = 'running'`,
  ).run(finishedAt, message, runId);
}
