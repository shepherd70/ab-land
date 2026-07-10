/**
 * Company profile page — aggregated holdings for a holder name.
 *
 * The holdings table is paged. The largest holder has ~15.5k parcels; rendering
 * them all produced a 21 MB HTML document (~3 s TTFB). Totals come from a SQL
 * summary, the table from one page, and the map from `/api/map/*` — so the map
 * still covers every parcel regardless of which page is shown.
 *
 * @module app/companies/[company]/page
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §1, §11
 */
import Link from "next/link";
import type { Disposition } from "@/lib/types";
import type { HoldingsSummary } from "@/lib/tenure";
import { openReadOnly } from "@/lib/db/client";
import { companyHoldingsSummary, listByCompany } from "@/lib/db/queries";
import { CompanyProfile } from "@/components/CompanyProfile";
import { MapExplorer } from "@/components/MapExplorer";

export const dynamic = "force-dynamic";

/** Holdings rows per page. ~100 rows keeps the document well under a megabyte. */
const PAGE_SIZE = 100;

/** First `?page=` value as a 1-based page number; anything invalid means page 1. */
function parsePage(raw: string | string[] | undefined): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(first);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { company } = await params;
  const sp = await searchParams;
  const name = decodeURIComponent(company);

  let holdings: Disposition[] = [];
  let summary: HoldingsSummary = { agreements: 0, parcels: 0 };
  let page = 1;
  let pageCount = 1;
  let dbError = false;
  try {
    const db = openReadOnly();
    try {
      summary = companyHoldingsSummary(db, name);
      pageCount = Math.max(1, Math.ceil(summary.parcels / PAGE_SIZE));
      // Clamp: a hand-typed ?page=999 lands on the last page, never a blank table.
      page = Math.min(parsePage(sp.page), pageCount);
      holdings = listByCompany(db, name, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
    } finally {
      db.close();
    }
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <main className="mx-auto max-w-3xl flex-1 p-6">
        <p className="text-sm">
          Database not ready. Run <code>npm run db:init &amp;&amp; npm run ingest</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <Link href="/" className="text-sm text-zinc-500 underline-offset-2 hover:underline">
        ← Search
      </Link>
      <div className="mt-2">
        <CompanyProfile
          name={name}
          holdings={holdings}
          summary={summary}
          page={page}
          pageCount={pageCount}
          basePath={`/companies/${encodeURIComponent(name)}`}
        />
      </div>
      {summary.parcels > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-medium">Map</h2>
          <p className="mt-1 text-xs text-zinc-500">
            All {summary.parcels.toLocaleString()} parcels — not just this page.
          </p>
          {/* Definite height required — a percentage collapses inside this
              min-h shell (see app/map/page.tsx). */}
          <MapExplorer
            company={name}
            className="mt-2 h-[28rem] w-full overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
          />
        </section>
      )}
    </main>
  );
}
