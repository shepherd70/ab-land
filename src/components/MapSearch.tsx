/**
 * Floating search overlay for the map explorer — find a company, agreement
 * number, or ATS location without leaving the map. Company hits link to the
 * profile page; parcel hits hand the row to the map (zoom + highlight) and
 * link to the holding page.
 *
 * @module components/MapSearch
 * Data source: /api/search (reads local SQLite)
 * @see CLAUDE.md §1
 */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Disposition } from "@/lib/types";
import { familyLabel } from "@/lib/map/families";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LEN = 2;
/** Fetch a few more than we show so the distinct-company section fills up. */
const FETCH_LIMIT = 30;
const MAX_COMPANIES = 5;
const MAX_PARCELS = 12;

/** Distinct holder names in result order (heuristic grouping, never authoritative). */
function distinctCompanies(rows: Disposition[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.holderDesrep) seen.add(row.holderDesrep);
    if (seen.size >= MAX_COMPANIES) break;
  }
  return [...seen];
}

export function MapSearch({
  onSelect,
  onClear,
}: {
  /** Called with the picked parcel row; the map zooms to and highlights it. */
  onSelect: (d: Disposition) => void;
  /** Called when the query is cleared; the map drops any highlight. */
  onClear: () => void;
}): React.ReactElement {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Disposition[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel the pending debounce/fetch on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  // Debounced search-as-you-type; in-flight responses for a stale query abort.
  function handleChange(value: string): void {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setStatus(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      void fetch(`/api/search?q=${encodeURIComponent(trimmed)}&kind=auto&limit=${FETCH_LIMIT}`, {
        signal: ctrl.signal,
      })
        .then(async (res) => {
          const body = (await res.json()) as {
            results?: Disposition[];
            message?: string;
            error?: string;
          };
          if (!res.ok) {
            setResults([]);
            setStatus(body.message ?? body.error ?? "Search failed.");
            return;
          }
          const rows = body.results ?? [];
          setResults(rows);
          setStatus(rows.length === 0 ? "No matches." : null);
          setOpen(true);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setResults([]);
          setStatus("Search failed.");
        });
    }, DEBOUNCE_MS);
  }

  function clear(): void {
    abortRef.current?.abort();
    setQ("");
    setResults([]);
    setStatus(null);
    setOpen(false);
    onClear();
  }

  const companies = distinctCompanies(results);
  const parcels = results.slice(0, MAX_PARCELS);

  return (
    <div className="w-80 max-w-[calc(100vw-8rem)] text-sm">
      <div className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white/95 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
        <input
          value={q}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") clear();
          }}
          placeholder="Company, agreement #, or ATS…"
          aria-label="Search company, agreement number, or ATS location"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="px-2 py-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ×
          </button>
        )}
      </div>

      {open && (status || results.length > 0) && (
        <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-zinc-200 bg-white/95 shadow-md backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          {status && <p className="px-3 py-2 text-xs text-zinc-500">{status}</p>}

          {companies.length > 0 && (
            <section>
              <h3 className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Companies
              </h3>
              <ul>
                {companies.map((name) => (
                  <li key={name}>
                    <Link
                      href={`/companies/${encodeURIComponent(name)}`}
                      className="block truncate px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {parcels.length > 0 && (
            <section className="pb-1">
              <h3 className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Parcels
              </h3>
              <ul>
                {parcels.map((d) => (
                  <li
                    key={d.id ?? `${d.source}-${d.family}-${d.agreementNumber}-${d.tract ?? ""}`}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onSelect(d);
                      }}
                      title="Show on map"
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="font-medium">
                        {d.agreementNumber}
                        {d.tract ? `-${d.tract}` : ""}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        {familyLabel(d.family)}
                        {d.holderDesrep ? ` · ${d.holderDesrep}` : ""}
                      </span>
                    </button>
                    <Link
                      href={`/holdings/${encodeURIComponent(d.agreementNumber)}`}
                      className="shrink-0 text-xs text-zinc-500 underline-offset-2 hover:underline"
                    >
                      Open →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
