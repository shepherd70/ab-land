/**
 * Minimal MapLibre GL view. Renders disposition polygons over a free basemap.
 * maplibre-gl is dynamically imported in an effect to avoid SSR (needs window).
 *
 * @module components/MapView
 * Data source: none (renders provided GeoJSON)
 * @see CLAUDE.md §4
 */
"use client";

import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

export function MapView({ data, className }: { data: FeatureCollection; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let map: import("maplibre-gl").Map | undefined;

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;
      map = new maplibregl.Map({
        container: el,
        // Free demo basemap; swap for a preferred style/tiles as needed.
        style: "https://demotiles.maplibre.org/style.json",
        center: [-114.5, 54.5],
        zoom: 4,
      });
      map.on("load", () => {
        if (!map) return;
        map.addSource("dispositions", { type: "geojson", data });
        map.addLayer({
          id: "disp-fill",
          type: "fill",
          source: "dispositions",
          paint: { "fill-color": "#2563eb", "fill-opacity": 0.3 },
        });
        map.addLayer({
          id: "disp-line",
          type: "line",
          source: "dispositions",
          paint: { "line-color": "#1d4ed8", "line-width": 1 },
        });
      });
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [data]);

  return (
    <div
      ref={ref}
      className={className ?? "h-96 w-full rounded-md border border-zinc-200 dark:border-zinc-800"}
    />
  );
}
