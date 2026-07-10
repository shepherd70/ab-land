/**
 * Company profile — aggregated holdings for a (heuristically matched) holder.
 * The holdings table is paged: a large holder has thousands of parcels, so the
 * agreement/parcel totals come from a SQL summary over every matching row, not
 * from the page of rows rendered here.
 *
 * @module components/CompanyProfile
 * Data source: none (renders provided holdings)
 * @see CLAUDE.md §1, §5, §11
 */
import type { Disposition } from "@/lib/types";
import type { HoldingsSummary } from "@/lib/tenure";
import { ResultsTable } from "@/components/ResultsTable";
import { Pagination } from "@/components/Pagination";

export function CompanyProfile({
  name,
  holdings,
  summary,
  page,
  pageCount,
  basePath,
}: {
  name: string;
  /** One page of holdings, not the full set. */
  holdings: Disposition[];
  /** Totals across every matching row. */
  summary: HoldingsSummary;
  page: number;
  pageCount: number;
  basePath: string;
}) {
  const { agreements, parcels } = summary;
  return (
    <div>
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {agreements.toLocaleString()} agreement(s) across {parcels.toLocaleString()} parcel(s) —
        heuristic name match, not an authoritative ownership record.
      </p>
      <div className="mt-4">
        <ResultsTable rows={holdings} />
      </div>
      <Pagination page={page} pageCount={pageCount} basePath={basePath} />
    </div>
  );
}
