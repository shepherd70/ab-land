/**
 * Prev/next pager for a server-rendered, paged list. Emits plain links
 * (`?page=N`) so paging works without client JS and each page is addressable.
 *
 * @module components/Pagination
 * Data source: none (navigation only)
 * @see CLAUDE.md §6
 */
import Link from "next/link";

/** Link to a page, or a disabled span at the ends of the range. */
function PagerLink({
  basePath,
  page,
  disabled,
  children,
}: {
  basePath: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className = "rounded-md border px-2.5 py-1 text-xs";
  if (disabled) {
    return (
      <span
        aria-disabled
        className={`${className} border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={`${basePath}?page=${page}`}
      className={`${className} border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900`}
    >
      {children}
    </Link>
  );
}

export function Pagination({
  page,
  pageCount,
  basePath,
}: {
  /** 1-based, already clamped to [1, pageCount]. */
  page: number;
  pageCount: number;
  /** Path without a query string, e.g. `/companies/Acme%20Energy`. */
  basePath: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center gap-2">
      <PagerLink basePath={basePath} page={page - 1} disabled={page <= 1}>
        ← Prev
      </PagerLink>
      <span className="text-xs text-zinc-500">
        Page {page.toLocaleString()} of {pageCount.toLocaleString()}
      </span>
      <PagerLink basePath={basePath} page={page + 1} disabled={page >= pageCount}>
        Next →
      </PagerLink>
    </nav>
  );
}
