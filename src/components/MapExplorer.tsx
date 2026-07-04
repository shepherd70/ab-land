/**
 * Province-wide interactive tenure explorer. Ships ~77k parcel centroids and
 * clusters them client-side for the overview; on zoom-in it fetches only the
 * polygons in the current viewport (debounced) from /api/map/features. Parcels
 * are colored by mineral family and clickable for a detail popup that drills
 * through to the holding page.
 *
 * @module components/MapExplorer
 * Data source: /api/map/centroids + /api/map/features (read local SQLite);
 *   basemap © OpenStreetMap (see lib/map/basemap)
 * @see CLAUDE.md §1, §4, §11
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MlMap,
  MapGeoJSONFeature,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { getBasemapStyle } from "@/lib/map/basemap";
import {
  FAMILY_STYLES,
  MINERAL_FAMILIES,
  familyColorMatchExpression,
  familyLabel,
} from "@/lib/map/families";
import { formatAgreementType, formatExpiry } from "@/lib/tenure";
import type { MapCentroid, MineralFamily } from "@/lib/types";

/** Province-wide default view. */
const ALBERTA_CENTER: [number, number] = [-114.5, 54.5];
const ALBERTA_ZOOM = 4;
/** Below this zoom we show clusters only; at/above it we load viewport polygons. */
const MIN_POLY_ZOOM = 10;
const MOVE_DEBOUNCE_MS = 250;
const ATTRIBUTION = "Tenure data © Government of Alberta (OGL–Alberta)";

const CENTROIDS_SRC = "centroids";
const POLYS_SRC = "viewport-polys";

/** Escape a string for safe injection into popup HTML (untrusted DB data). */
function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Build the clustered point FeatureCollection, filtered to the active families. */
function buildCentroidFC(centroids: MapCentroid[], active: ReadonlySet<MineralFamily>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: centroids
      .filter((c) => active.has(c.family))
      .map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        properties: {
          id: c.id,
          family: c.family,
          agreementNumber: c.agreementNumber,
          status: c.status ?? null,
        },
      })),
  };
}

/** Popup markup for a clicked viewport polygon. All DB strings are escaped. */
function popupHtml(props: Record<string, unknown>): string {
  const agreement = String(props.agreementNumber ?? "");
  const href = `/holdings/${encodeURIComponent(agreement)}`;
  const rows: string[] = [];
  if (props.agreementType)
    rows.push(`<div>Type: ${escapeHtml(formatAgreementType(props.agreementType as string))}</div>`);
  if (props.status) rows.push(`<div>Status: ${escapeHtml(props.status)}</div>`);
  rows.push(`<div>Expiry: ${escapeHtml(formatExpiry(props.currentExpiryDate as string | null))}</div>`);
  if (props.areaHa != null) rows.push(`<div>${escapeHtml(props.areaHa)} ha</div>`);
  return `
    <div class="text-xs leading-5">
      <div class="font-semibold">${escapeHtml(familyLabel(String(props.family ?? "")))}</div>
      <div class="text-zinc-500">Agreement ${escapeHtml(agreement)}${
        props.tract ? `-${escapeHtml(props.tract)}` : ""
      }</div>
      ${rows.join("")}
      <a href="${href}" class="mt-1 inline-block font-medium underline">View holding →</a>
    </div>`;
}

export function MapExplorer({ className }: { className?: string }): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const centroidsRef = useRef<MapCentroid[]>([]);
  const loadedRef = useRef(false);
  const filtersRef = useRef<{ families: Set<MineralFamily>; status: string }>({
    families: new Set(MINERAL_FAMILIES),
    status: "",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [active, setActive] = useState<Set<MineralFamily>>(() => new Set(MINERAL_FAMILIES));
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch the polygons for the current viewport (or clear them when zoomed out).
  function loadViewport(): void {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const polys = map.getSource(POLYS_SRC) as GeoJSONSource | undefined;
    if (!polys) return;

    if (map.getZoom() < MIN_POLY_ZOOM) {
      polys.setData({ type: "FeatureCollection", features: [] });
      setHint("Zoom in to see parcels");
      return;
    }
    setHint(null);

    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
    const { families, status } = filtersRef.current;
    const params = new URLSearchParams({ bbox });
    if (families.size < MINERAL_FAMILIES.length) params.set("families", [...families].join(","));
    if (status) params.set("status", status);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    void fetch(`/api/map/features?${params.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = (await res.json()) as FeatureCollection & { message?: string };
        if (!res.ok) {
          setError(body.message ?? "Failed to load parcels.");
          return;
        }
        setError(null);
        (map.getSource(POLYS_SRC) as GeoJSONSource | undefined)?.setData(body);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Failed to load parcels.");
      });
  }

  // Create the map once. Never recreate it for filter changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let map: MlMap | undefined;

    void (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;
      map = new maplibregl.Map({
        container: el,
        style: getBasemapStyle(),
        center: ALBERTA_CENTER,
        zoom: ALBERTA_ZOOM,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));

      const colorExpr = familyColorMatchExpression() as unknown as ExpressionSpecification;

      map.on("load", async () => {
        if (!map || cancelled) return;

        // Province overview: all centroids, clustered client-side.
        let centroids: MapCentroid[] = [];
        try {
          const res = await fetch("/api/map/centroids");
          const body = (await res.json()) as { centroids?: MapCentroid[]; message?: string };
          if (!res.ok) {
            setError(body.message ?? "Failed to load map data.");
          } else {
            centroids = body.centroids ?? [];
          }
        } catch {
          setError("Failed to load map data.");
        }
        if (cancelled) return;
        centroidsRef.current = centroids;

        map.addSource(CENTROIDS_SRC, {
          type: "geojson",
          data: buildCentroidFC(centroids, filtersRef.current.families),
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 13,
        });
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: CENTROIDS_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#2563eb",
            "circle-opacity": 0.75,
            "circle-radius": ["step", ["get", "point_count"], 14, 100, 18, 1000, 24, 10000, 32],
          },
        });
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: CENTROIDS_SRC,
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
          paint: { "text-color": "#ffffff" },
        });
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: CENTROIDS_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": colorExpr,
            "circle-radius": 4,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Viewport detail: polygons, colored by family, with a hover highlight.
        map.addSource(POLYS_SRC, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          generateId: true,
        });
        map.addLayer({
          id: "viewport-fill",
          type: "fill",
          source: POLYS_SRC,
          paint: {
            "fill-color": colorExpr,
            "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.6, 0.3],
          },
        });
        map.addLayer({
          id: "viewport-line",
          type: "line",
          source: POLYS_SRC,
          paint: { "line-color": colorExpr, "line-width": 1 },
        });

        loadedRef.current = true;
        loadViewport();

        // Cluster click → expand. Polygon click → popup. Hover highlight.
        map.on("click", "clusters", async (e) => {
          if (!map) return;
          const feat = e.features?.[0];
          const clusterId = feat?.properties?.cluster_id as number | undefined;
          if (clusterId == null) return;
          const src = map.getSource(CENTROIDS_SRC) as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          const geom = feat?.geometry;
          if (geom?.type === "Point") {
            map.easeTo({ center: geom.coordinates as [number, number], zoom });
          }
        });
        map.on("click", "viewport-fill", (e) => {
          if (!map) return;
          const feat = e.features?.[0];
          if (!feat) return;
          new maplibregl.Popup({ closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML(popupHtml(feat.properties as Record<string, unknown>))
            .addTo(map);
        });

        let hoveredId: number | string | undefined;
        map.on("mousemove", "viewport-fill", (e) => {
          if (!map) return;
          map.getCanvas().style.cursor = "pointer";
          const feat = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (feat?.id == null) return;
          if (hoveredId != null) {
            map.setFeatureState({ source: POLYS_SRC, id: hoveredId }, { hover: false });
          }
          hoveredId = feat.id;
          map.setFeatureState({ source: POLYS_SRC, id: hoveredId }, { hover: true });
        });
        map.on("mouseleave", "viewport-fill", () => {
          if (!map) return;
          map.getCanvas().style.cursor = "";
          if (hoveredId != null) {
            map.setFeatureState({ source: POLYS_SRC, id: hoveredId }, { hover: false });
          }
          hoveredId = undefined;
        });
        for (const layer of ["clusters", "unclustered-point"]) {
          map.on("mouseenter", layer, () => {
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            if (map) map.getCanvas().style.cursor = "";
          });
        }
      });

      // Debounced viewport refresh on pan/zoom.
      map.on("moveend", () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(loadViewport, MOVE_DEBOUNCE_MS);
      });
    })();

    const onResize = (): void => {
      mapRef.current?.resize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      map?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
     
  }, []);

  // Push family-filter changes to both the cluster source and the viewport.
  useEffect(() => {
    filtersRef.current = { families: active, status: filtersRef.current.status };
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource(CENTROIDS_SRC) as GeoJSONSource | undefined)?.setData(
      buildCentroidFC(centroidsRef.current, active),
    );
    loadViewport();
     
  }, [active]);

  function toggleFamily(family: MineralFamily): void {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  return (
    <div className={`flex ${className ?? "h-full w-full"}`}>
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Mineral families</h2>
        <p className="mt-1 text-xs text-zinc-500">Toggle to filter the map.</p>
        <ul className="mt-3 space-y-1.5">
          {MINERAL_FAMILIES.map((family) => (
            <li key={family}>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={active.has(family)}
                  onChange={() => toggleFamily(family)}
                />
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: FAMILY_STYLES[family].color }}
                  aria-hidden
                />
                <span>{FAMILY_STYLES[family].label}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] leading-4 text-zinc-400">
          Crown agreement tenure, not land title. Heuristic — not an authoritative parcel match.
        </p>
      </aside>
      <div className="relative min-w-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        {hint && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-zinc-900/80 px-3 py-1 text-xs text-white">
            {hint}
          </div>
        )}
        {error && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-red-600/90 px-3 py-1 text-xs text-white">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
