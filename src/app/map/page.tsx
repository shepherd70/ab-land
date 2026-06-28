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
  // min-h-0 is load-bearing: without it this flex item's default min-height:auto
  // lets the map canvas push past the column and break the pinned footer.
  return (
    <main className="min-h-0 flex-1">
      <MapExplorer className="h-full w-full" />
    </main>
  );
}
