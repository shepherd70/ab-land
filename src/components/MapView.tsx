/**
 * Minimal MapLibre GL view. Renders disposition polygons over a free, attributed
 * basemap (see lib/map/basemap). maplibre-gl is dynamically imported in an effect
 * to avoid SSR (it needs `window`).
 *
 * @module components/MapView
 * Data source: none (renders provided GeoJSON; basemap © OpenStreetMap)
 * @see CLAUDE.md §4, §11
 */
"use client";

import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { boundsOfFeatureCollection, getBasemapStyle } from "@/lib/map/basemap";

/** Default view when there is no data to frame. */
const ALBERTA_CENTER: [number, number] = [-114.5, 54.5];
const ALBERTA_ZOOM = 4;

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
        style: getBasemapStyle(),
        center: ALBERTA_CENTER,
        zoom: ALBERTA_ZOOM,
        attributionControl: false, // added explicitly below to credit the tenure data
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: "Tenure data © Government of Alberta (OGL–Alberta)",
        }),
      );

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

        // Frame the data when present; otherwise keep the province-wide view.
        const bounds = boundsOfFeatureCollection(data);
        if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 0 });
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
