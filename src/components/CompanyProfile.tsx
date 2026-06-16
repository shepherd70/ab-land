/**
 * Company profile — aggregated holdings for a (heuristically matched) holder.
 *
 * @module components/CompanyProfile
 * Data source: none (renders provided holdings)
 * @see CLAUDE.md §1, §11
 */
import type { Disposition } from "@/lib/types";
import { ResultsTable } from "@/components/ResultsTable";

export function CompanyProfile({ name, holdings }: { name: string; holdings: Disposition[] }) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {holdings.length} holding(s) — heuristic name match, not an authoritative ownership record.
      </p>
      <div className="mt-4">
        <ResultsTable rows={holdings} />
      </div>
    </div>
  );
}
