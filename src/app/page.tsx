/**
 * Search-first home. The map appears on drill-in (holding/company pages).
 *
 * @module app/page
 * Data source: none (renders the client search panel)
 * @see CLAUDE.md §1
 */
import { SearchPanel } from "@/components/SearchPanel";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Alberta Crown Mineral Tenure</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Search by company, agreement number, or legal land description (ATS).
      </p>
      <div className="mt-6">
        <SearchPanel />
      </div>
    </main>
  );
}
