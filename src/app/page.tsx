/**
 * Map-first home — the province-wide zoomable explorer with search overlaid.
 * Browse, zoom into parcels, click through to holdings; search lives on the
 * map (MapSearch) instead of a separate page.
 *
 * @module app/page
 * Data source: none (renders the client map explorer)
 * @see CLAUDE.md §1
 */
import { MapExplorer } from "@/components/MapExplorer";

export const dynamic = "force-dynamic";

export default function Home() {
  // The map needs a *definite* height to fill. The app shell now provides one
  // the whole way down — `html.h-full` → `body.h-dvh` → the scroll wrapper
  // (`flex-1 min-h-0`) → this `main` (`flex-1 min-h-0`) — so a percentage
  // `h-full` resolves instead of collapsing to the sidebar's content height.
  // `min-h-0` is what opts this page out of growing past the viewport; the
  // other pages omit it so their content scrolls the wrapper instead.
  return (
    <main className="min-h-0 flex-1">
      <MapExplorer searchable className="h-full w-full" />
    </main>
  );
}
