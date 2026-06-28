/**
 * App header with primary navigation (Search / Map).
 *
 * @module components/Header
 * Data source: none (static navigation)
 * @see CLAUDE.md §1
 */
import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-center gap-4 border-b border-zinc-200 px-6 py-3 text-sm dark:border-zinc-800">
      <span className="font-semibold tracking-tight">ab-land</span>
      <nav className="flex gap-4 text-zinc-600 dark:text-zinc-400">
        <Link href="/" className="underline-offset-2 hover:underline">
          Search
        </Link>
        <Link href="/map" className="underline-offset-2 hover:underline">
          Map
        </Link>
      </nav>
    </header>
  );
}
