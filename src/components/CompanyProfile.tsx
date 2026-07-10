/**
 * Company profile — aggregated holdings for a (heuristically matched) holder.
 * Counts agreements and parcels separately: one agreement can span several
 * tracts, so the row count alone would overstate holdings.
 *
 * @module components/CompanyProfile
 * Data source: none (renders provided holdings)
 * @see CLAUDE.md §1, §5, §11
 */
import type { Disposition } from "@/lib/types";
import { summarizeHoldings } from "@/lib/tenure";
import { ResultsTable } from "@/components/ResultsTable";
import { CompanyMap } from "@/components/CompanyMap";

export function CompanyProfile({ name, holdings }: { name: string; holdings: Disposition[] }) {
  const { agreements, parcels } = summarizeHoldings(holdings);
  return (
    <div>
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {agreements} agreement(s) across {parcels} parcel(s) — heuristic name match, not an
        authoritative ownership record.
      </p>
      {holdings.length > 0 && (
        <div className="mt-4">
          <CompanyMap company={name} />
        </div>
      )}
      <div className="mt-4">
        <ResultsTable rows={holdings} />
      </div>
    </div>
  );
}
