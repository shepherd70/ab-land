/**
 * Ingest-health tests over SQLite run logs and legacy row timestamps.
 *
 * @module test/ingest_health
 * Data source: GeoView ingest metadata (synthetic offline fixtures)
 * @see CLAUDE.md §10
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySchema, openDb, type DB } from "../lib/db/client";
import { getIngestHealth } from "../lib/ingest/health";
import { failIngestRun, finishIngestRun, startIngestRun } from "../lib/ingest/run_log";

function freshDb(): DB {
  const db = openDb(":memory:");
  applySchema(db);
  return db;
}

let db: DB;

beforeEach(() => {
  db = freshDb();
});

afterEach(() => {
  db.close();
});

describe("ingest health", () => {
  it("uses the oldest row timestamp for a database that predates run logs", () => {
    db.prepare(
      `INSERT INTO dispositions (
         source, family, agreement_number, tract, ingested_at
       ) VALUES ('geoview', 'png', '1', '', '2026-06-28T12:00:00.000Z')`,
    ).run();

    const health = getIngestHealth(db, {
      now: new Date("2026-08-18T12:00:00.000Z"),
      staleAfterDays: 8,
    });

    expect(health.lastSuccessAt).toBe("2026-06-28T12:00:00.000Z");
    expect(health.usedLegacyTimestamp).toBe(true);
    expect(health.stale).toBe(true);
  });

  it("reports a recent completed batch as fresh", () => {
    const runId = startIngestRun(db, {
      source: "geoview",
      startedAt: "2026-08-17T12:00:00.000Z",
    });
    finishIngestRun(db, runId, {
      rowsUpserted: 77_000,
      rowsDeleted: 20,
      finishedAt: "2026-08-17T12:10:00.000Z",
    });

    const health = getIngestHealth(db, {
      now: new Date("2026-08-18T12:00:00.000Z"),
      staleAfterDays: 8,
    });

    expect(health).toMatchObject({
      lastSuccessAt: "2026-08-17T12:10:00.000Z",
      lastAttemptStatus: "ok",
      stale: false,
      usedLegacyTimestamp: false,
    });
  });

  it("surfaces a failed latest attempt while retaining the prior success", () => {
    const successId = startIngestRun(db, {
      source: "geoview",
      startedAt: "2026-08-10T12:00:00.000Z",
    });
    finishIngestRun(db, successId, {
      rowsUpserted: 77_000,
      rowsDeleted: 5,
      finishedAt: "2026-08-10T12:10:00.000Z",
    });
    const failureId = startIngestRun(db, {
      source: "geoview",
      startedAt: "2026-08-18T12:00:00.000Z",
    });
    failIngestRun(db, failureId, new Error("upstream unavailable"), "2026-08-18T12:01:00.000Z");

    const health = getIngestHealth(db, {
      now: new Date("2026-08-18T13:00:00.000Z"),
      staleAfterDays: 8,
    });

    expect(health).toMatchObject({
      lastSuccessAt: "2026-08-10T12:10:00.000Z",
      lastAttemptAt: "2026-08-18T12:01:00.000Z",
      lastAttemptStatus: "error",
      lastError: "upstream unavailable",
      stale: true,
    });
  });
});
