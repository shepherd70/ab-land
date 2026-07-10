/**
 * Company profile page — aggregated holdings for a holder name.
 *
 * @module app/companies/[company]/page
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §1, §11
 */
import Link from "next/link";
import type { Disposition } from "@/lib/types";
import { openReadOnly } from "@/lib/db/client";
import { listByCompany } from "@/lib/db/queries";
import { CompanyProfile } from "@/components/CompanyProfile";
import { MapExplorer } from "@/components/MapExplorer";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ company: string }>;
}) {
  const { company } = await params;
  const name = decodeURIComponent(company);

  let holdings: Disposition[] = [];
  let dbError = false;
  try {
    const db = openReadOnly();
    try {
      holdings = listByCompany(db, name, false);
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
        <CompanyProfile name={name} holdings={holdings} />
      </div>
      {holdings.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-medium">Map</h2>
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
