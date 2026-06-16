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
    </main>
  );
}
