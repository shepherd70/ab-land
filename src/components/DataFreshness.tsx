/**
 * Request-time badge showing whether the local GeoView snapshot is fresh.
 *
 * @module components/DataFreshness
 * Data source: local SQLite (GeoView ingest metadata)
 * @see CLAUDE.md §3, §5
 */
import { connection } from "next/server";
import { openReadOnly } from "@/lib/db/client";
import { getIngestHealth, type IngestHealth } from "@/lib/ingest/health";

function formatDate(value: string | null): string {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function badge(health: IngestHealth): { className: string; label: string; title: string } {
  const dataDate = formatDate(health.lastSuccessAt);
  if (health.lastAttemptStatus === "error") {
    return {
      className:
        "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
      label: `Refresh failed · data ${dataDate}`,
      title: health.lastError ?? "The latest mineral refresh failed; prior data was preserved.",
    };
  }
  if (health.lastAttemptStatus === "running") {
    return {
      className:
        "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
      label: `Refresh running · data ${dataDate}`,
      title: "A mineral refresh is staging. The current snapshot remains available until publish.",
    };
  }
  if (!health.lastSuccessAt) {
    return {
      className:
        "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      label: "No mineral data",
      title: "Run npm run ingest to create the local mineral snapshot.",
    };
  }
  if (health.stale) {
    return {
      className:
        "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      label: `Data stale · ${dataDate}`,
      title: "The last complete mineral snapshot is older than eight days.",
    };
  }
  return {
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    label: `Data · ${dataDate}`,
    title: health.usedLegacyTimestamp
      ? "Freshness is based on stored row timestamps until the next logged refresh."
      : "Latest complete mineral refresh.",
  };
}

/** Render live ingest health at request time, never during static prerendering. */
export async function DataFreshness() {
  await connection();
  let health: IngestHealth;
  try {
    const db = openReadOnly();
    try {
      const configuredDays = Number(process.env.DATA_STALE_AFTER_DAYS ?? "8");
      health = getIngestHealth(db, {
        staleAfterDays:
          Number.isFinite(configuredDays) && configuredDays >= 1 ? configuredDays : 8,
      });
    } finally {
      db.close();
    }
  } catch {
    return (
      <span
        className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        title="Database unavailable. Run npm run db:init && npm run ingest."
      >
        Data unavailable
      </span>
    );
  }

  const display = badge(health);
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] ${display.className}`}
      title={display.title}
    >
      {display.label}
    </span>
  );
}
