/**
 * Client search panel — queries /api/search and renders results.
 *
 * @module components/SearchPanel
 * Data source: /api/search (reads local SQLite)
 * @see CLAUDE.md §1
 */
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { Disposition } from "@/lib/types";
import { ResultsTable } from "@/components/ResultsTable";

type Kind = "auto" | "company" | "agreement" | "ats";

export function SearchPanel() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("auto");
  const [results, setResults] = useState<Disposition[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&kind=${kind}`);
      const body = (await res.json()) as { results?: Disposition[]; message?: string; error?: string };
      if (!res.ok) {
        setResults([]);
        setStatus(body.message ?? body.error ?? "Search failed.");
      } else {
        const rows = body.results ?? [];
        setResults(rows);
        setStatus(rows.length === 0 ? "No matches." : null);
      }
    } catch {
      setStatus("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={run} className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Canadian Natural, 0512345, SE-12-034-05-W4"
          className="min-w-64 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          className="rounded-md border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="auto">Auto</option>
          <option value="company">Company</option>
          <option value="agreement">Agreement #</option>
          <option value="ats">Location (ATS)</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {status && <p className="mt-3 text-sm text-zinc-500">{status}</p>}
      <div className="mt-4">
        <ResultsTable rows={results} />
      </div>
    </div>
  );
}
