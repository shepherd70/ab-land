/**
 * Province-wide interactive tenure explorer. The clustered overview is a
 * GeoJSON source pointed at the /api/map/centroids URL, so MapLibre's worker
 * fetches, parses, and clusters the ~77k points off the main thread; on
 * zoom-in it fetches only the polygons in the current viewport (debounced)
 * from /api/map/features. Parcels are colored by mineral family and clickable
 * for a detail popup that drills through to the holding page. With the
 * `searchable` prop, a floating search overlay (MapSearch) zooms to and
 * highlights a picked agreement — geometry via /api/holdings/[id].
 *
 * @module components/MapExplorer
 * Data source: /api/map/centroids + /api/map/features + /api/holdings/[id]
 *   (read local SQLite); basemap © OpenStreetMap (see lib/map/basemap)
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
import type { Feature, FeatureCollection, Geometry } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapSearch } from "@/components/MapSearch";
import { getBasemapStyle } from "@/lib/map/basemap";
import {
  FAMILY_STYLES,
  MINERAL_FAMILIES,
  familyColorMatchExpression,
  familyLabel,
} from "@/lib/map/families";
import { formatAgreementType, formatExpiry } from "@/lib/tenure";
import type { Disposition, MineralFamily } from "@/lib/types";

/** Province-wide default view. */
const ALBERTA_CENTER: [number, number] = [-114.5, 54.5];
const ALBERTA_ZOOM = 4;
/** Below this zoom we show clusters only; at/above it we load viewport polygons. */
const MIN_POLY_ZOOM = 10;
const MOVE_DEBOUNCE_MS = 250;
const ATTRIBUTION = "Tenure data © Government of Alberta (OGL–Alberta)";

const CENTROIDS_SRC = "centroids";
const POLYS_SRC = "viewport-polys";
const SELECTED_SRC = "selected-agreement";
/** Search-selection highlight — deliberately outside the family palette. */
const SELECTED_COLOR = "#eab308";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Escape a string for safe injection into popup HTML (untrusted DB data). */
function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * URL for the centroids GeoJSON source — MapLibre's worker fetches and parses
 * it, so the payload never blocks the main thread. An empty `families` param
 * means "no filter" server-side, so callers must special-case an empty
 * selection with {@link EMPTY_FC} instead of calling this.
 */
function centroidsDataUrl(families: ReadonlySet<MineralFamily>, company?: string): string {
  const params = new URLSearchParams();
  if (families.size > 0 && families.size < MINERAL_FAMILIES.length)
    params.set("families", [...families].join(","));
  if (company) params.set("company", company);
  const qs = params.toString();
  return qs ? `/api/map/centroids?${qs}` : "/api/map/centroids";
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

export function MapExplorer({
  className,
  company,
  initialBounds,
  searchable = false,
}: {
  className?: string;
  /** Show the floating search overlay (map-first home). Fixed per mount. */
  searchable?: boolean;
  /**
   * Restrict the map to one company's holdings (alias-expanded heuristic match,
   * same as the company profile). Fixed per mount — the map is created once and
   * both data fetches capture the value; pass a stable string.
   */
  company?: string;
  /**
   * Frame the map on these [west, south, east, north] bounds at construction
   * instead of the province default (used with `company` to open on the
   * holdings without a province-view flash). Fixed per mount, like `company`.
   */
  initialBounds?: [number, number, number, number];
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  // Fixed per mount (see prop docs) — refs keep the map-creation effect and
  // loadViewport non-reactive.
  const companyRef = useRef(company);
  const initialBoundsRef = useRef(initialBounds);
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
      polys.setData(EMPTY_FC);
      setHint("Zoom in to see parcels");
      return;
    }
    setHint(null);

    const { families, status } = filtersRef.current;
    // An empty families param would mean "no filter" server-side; an empty
    // selection must clear the layer instead.
    if (families.size === 0) {
      polys.setData(EMPTY_FC);
      return;
    }

    const b = map.getBounds();
    const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
    const params = new URLSearchParams({ bbox });
    if (families.size < MINERAL_FAMILIES.length) params.set("families", [...families].join(","));
    if (status) params.set("status", status);
    if (companyRef.current) params.set("company", companyRef.current);

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
        // Constructor bounds override center/zoom, so the right basemap tiles
        // load first and there is no province-view flash.
        ...(initialBoundsRef.current
          ? { bounds: initialBoundsRef.current, fitBoundsOptions: { padding: 40, maxZoom: 10 } }
          : {}),
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));

      const colorExpr = familyColorMatchExpression() as unknown as ExpressionSpecification;

      // Worker-side failures fetching the centroids URL surface as source
      // error events; a later successful content load clears the banner.
      map.on("error", (e) => {
        if ((e as { sourceId?: string }).sourceId === CENTROIDS_SRC)
          setError("Failed to load map data.");
      });
      map.on("sourcedata", (e) => {
        if (e.sourceId === CENTROIDS_SRC && e.sourceDataType === "content") setError(null);
      });

      map.on("load", () => {
        if (!map || cancelled) return;

        // Overview centroids: the whole province, or one company's holdings.
        // The source is a URL, so the fetch/parse/cluster pipeline runs in
        // MapLibre's worker and the payload never touches the main thread.
        map.addSource(CENTROIDS_SRC, {
          type: "geojson",
          data: centroidsDataUrl(filtersRef.current.families, companyRef.current),
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

        // Search selection: the picked agreement's tracts, drawn on top of
        // everything so it stays visible at any zoom (unlike viewport polygons,
        // which only load at MIN_POLY_ZOOM+).
        map.addSource(SELECTED_SRC, { type: "geojson", data: EMPTY_FC });
        map.addLayer({
          id: "selected-fill",
          type: "fill",
          source: SELECTED_SRC,
          paint: { "fill-color": SELECTED_COLOR, "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: "selected-line",
          type: "line",
          source: SELECTED_SRC,
          paint: { "line-color": SELECTED_COLOR, "line-width": 2.5 },
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
        // The highlighted agreement is clickable even below MIN_POLY_ZOOM;
        // where it overlaps a viewport polygon the handler above already fires,
        // so bail rather than opening a second popup.
        map.on("click", "selected-fill", (e) => {
          if (!map) return;
          if (map.queryRenderedFeatures(e.point, { layers: ["viewport-fill"] }).length > 0) return;
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
        for (const layer of ["clusters", "unclustered-point", "selected-fill"]) {
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
    // New URL → the worker refetches and re-clusters; overlapping loads
    // coalesce, last one wins. Empty selection = empty data (see
    // centroidsDataUrl).
    (map.getSource(CENTROIDS_SRC) as GeoJSONSource | undefined)?.setData(
      active.size === 0 ? EMPTY_FC : centroidsDataUrl(active, companyRef.current),
    );
    loadViewport();
     
  }, [active]);

  // Zoom to and highlight a search-picked agreement. Fetches every tract's
  // geometry (the search row itself carries none) and frames their union.
  async function selectAgreement(d: Disposition): Promise<void> {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    try {
      const res = await fetch(`/api/holdings/${encodeURIComponent(d.agreementNumber)}`);
      const body = (await res.json()) as { holdings?: Disposition[] };
      if (!res.ok) throw new Error("holdings fetch failed");
      const rows = (body.holdings ?? []).filter(
        (h) => h.geometryGeoJSON && h.family === d.family && h.source === d.source,
      );
      const features: Feature[] = rows.map((h) => ({
        type: "Feature",
        geometry: JSON.parse(h.geometryGeoJSON as string) as Geometry,
        properties: {
          family: h.family,
          agreementNumber: h.agreementNumber,
          tract: h.tract ?? "",
          agreementType: h.agreementType ?? "",
          status: h.status ?? "",
          currentExpiryDate: h.currentExpiryDate ?? null,
          areaHa: h.areaHa ?? null,
        },
      }));
      (map.getSource(SELECTED_SRC) as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features,
      });

      // Union of the tract bboxes; the picked row's own bbox is the fallback.
      let b: [number, number, number, number] | undefined;
      for (const h of [...rows, d]) {
        if (!h.bbox) continue;
        b = b
          ? [
              Math.min(b[0], h.bbox[0]),
              Math.min(b[1], h.bbox[1]),
              Math.max(b[2], h.bbox[2]),
              Math.max(b[3], h.bbox[3]),
            ]
          : [...h.bbox];
      }
      if (b) {
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 13 });
      } else if (features.length === 0) {
        setError("No mapped geometry for that agreement.");
        return;
      }
      setError(null);
    } catch {
      setError("Failed to load the selected agreement.");
    }
  }

  function clearSelection(): void {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource(SELECTED_SRC) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
  }

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
        {searchable && (
          <div className="absolute left-3 top-3 z-10">
            <MapSearch
              onSelect={(d) => {
                void selectAgreement(d);
              }}
              onClear={clearSelection}
            />
          </div>
        )}
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
