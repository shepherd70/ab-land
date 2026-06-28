/**
 * Map explorer page — a full-height, province-wide interactive tenure map.
 *
 * @module app/map/page
 * Data source: none (renders the client map explorer)
 * @see CLAUDE.md §1
 */
import { MapExplorer } from "@/components/MapExplorer";

export const dynamic = "force-dynamic";

export default function MapPage() {
  // The map needs a *definite* height to fill. The app-shell body is `min-h-full`
  // (a minimum, not a definite height), so a percentage `h-full` here collapses to
  // the sidebar's content height. Pin the explorer to the viewport minus the
  // header+footer chrome (~3.5rem) with dvh, which resolves without a definite parent.
  return (
    <main className="min-h-0 flex-1">
      <MapExplorer className="h-[calc(100dvh_-_3.5rem)] w-full" />
    </main>
  );
}
