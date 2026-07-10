/**
 * Company-profile map: one holder's parcels fetched from
 * /api/companies/:name/features. Normal portfolios render as family-colored
 * polygons; oversized ones (see lib/map/company_features) arrive as centroid
 * points and render as circles, with a notice. Parcels are clickable through
 * to the holding page via the shared popup.
 *
 * @module components/CompanyMap
 * Data source: /api/companies/[name]/features (reads local SQLite);
 *   basemap © OpenStreetMap (see lib/map/basemap)
 * @see CLAUDE.md §1, §4, §11
 */
"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { boundsOfFeatureCollection, getBasemapStyle } from "@/lib/map/basemap";
import { FAMILY_STYLES, familyColorMatchExpression } from "@/lib/map/families";
import type { CompanyMapMode } from "@/lib/map/company_features";
import { popupHtml } from "@/lib/map/popup";
import type { MineralFamily } from "@/lib/types";

/** Default view when there is no data to frame. */
const ALBERTA_CENTER: [number, number] = [-114.5, 54.5];
const ALBERTA_ZOOM = 4;
const ATTRIBUTION = "Tenure data © Government of Alberta (OGL–Alberta)";
const SRC = "company-parcels";

/** Shape of the /api/companies/:name/features response. */
interface CompanyFeaturesResponse {
  mode: CompanyMapMode;
  parcels: number;
  featureCollection: FeatureCollection;
  message?: string;
}

export function CompanyMap({
  company,
  className,
}: {
  company: string;
  className?: string;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<string | null>("Loading parcels…");
  const [error, setError] = useState<string | null>(null);
  const [present, setPresent] = useState<MineralFamily[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let map: MlMap | undefined;
    const ctrl = new AbortController();

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
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));

      map.on("load", async () => {
        if (!map || cancelled) return;

        let body: CompanyFeaturesResponse | undefined;
        try {
          const res = await fetch(`/api/companies/${encodeURIComponent(company)}/features`, {
            signal: ctrl.signal,
          });
          const json = (await res.json()) as CompanyFeaturesResponse;
          if (!res.ok) {
            setError(json.message ?? "Failed to load parcels.");
            setNotice(null);
            return;
          }
          body = json;
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError("Failed to load parcels.");
          setNotice(null);
          return;
        }
        if (cancelled || !map) return;

        const fc = body.featureCollection;
        setError(null);
        setNotice(
          fc.features.length === 0
            ? "No mappable parcels."
            : body.mode === "centroids"
              ? `Large portfolio (${body.parcels.toLocaleString()} parcels) — showing parcel centres, not outlines.`
              : null,
        );
        setPresent(
          [...new Set(fc.features.map((f) => f.properties?.family as MineralFamily))].filter(
            (f) => f in FAMILY_STYLES,
          ),
        );

        const colorExpr = familyColorMatchExpression() as unknown as ExpressionSpecification;
        map.addSource(SRC, { type: "geojson", data: fc });
        map.addLayer({
          id: "company-fill",
          type: "fill",
          source: SRC,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": colorExpr, "fill-opacity": 0.3 },
        });
        map.addLayer({
          id: "company-line",
          type: "line",
          source: SRC,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "line-color": colorExpr, "line-width": 1 },
        });
        map.addLayer({
          id: "company-points",
          type: "circle",
          source: SRC,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-color": colorExpr,
            "circle-radius": 4,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });

        const bounds = boundsOfFeatureCollection(fc);
        if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 12, duration: 0 });

        for (const layer of ["company-fill", "company-points"]) {
          map.on("click", layer, (e) => {
            if (!map) return;
            const feat = e.features?.[0];
            if (!feat) return;
            new maplibregl.Popup({ closeButton: true })
              .setLngLat(e.lngLat)
              .setHTML(popupHtml(feat.properties as Record<string, unknown>))
              .addTo(map);
          });
          map.on("mouseenter", layer, () => {
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            if (map) map.getCanvas().style.cursor = "";
          });
        }
      });
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      map?.remove();
    };
  }, [company]);

  return (
    <div>
      <div className={`relative ${className ?? "h-96 w-full"}`}>
        <div
          ref={containerRef}
          className="h-full w-full overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
        />
        {notice && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-zinc-900/80 px-3 py-1 text-xs text-white">
            {notice}
          </div>
        )}
        {error && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-red-600/90 px-3 py-1 text-xs text-white">
            {error}
          </div>
        )}
      </div>
      {present.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {present.map((family) => (
            <li key={family} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: FAMILY_STYLES[family].color }}
                aria-hidden
              />
              {FAMILY_STYLES[family].label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
