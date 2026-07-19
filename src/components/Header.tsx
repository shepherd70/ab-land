/**
 * App header — brand link back to the map-first home.
 *
 * @module components/Header
 * Data source: none (static navigation)
 * @see CLAUDE.md §1
 */
import Link from "next/link";

export function Header() {
  return (
    <header className="flex items-baseline gap-3 border-b border-zinc-200 px-6 py-3 text-sm dark:border-zinc-800">
      <Link href="/" className="font-semibold tracking-tight underline-offset-2 hover:underline">
        ab-land
      </Link>
      <span className="text-xs text-zinc-500">Alberta Crown mineral tenure</span>
    </header>
  );
}
