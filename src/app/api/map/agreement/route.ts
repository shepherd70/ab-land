/**
 * GET /api/map/agreement — one agreement's tracts as a GeoJSON FeatureCollection
 * (the map's selection highlight), or with `meta=bounds` the bbox + mapped-tract
 * count used to frame it. Served as a URL so MapLibre's worker fetches and
 * parses the polygons instead of the main thread.
 *
 * @module app/api/map/agreement/route
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §3
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MapAgreementParams } from "@/lib/schemas";
import { openReadOnly } from "@/lib/db/client";
import { agreementBounds, agreementFeatures } from "@/lib/db/queries";
import { dispositionsToFeatureCollection } from "@/lib/map/geojson";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = MapAgreementParams.safeParse({
    number: sp.get("number") ?? "",
    family: sp.get("family") ?? "",
    source: sp.get("source") ?? "",
    meta: sp.get("meta") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let db: ReturnType<typeof openReadOnly>;
  try {
    db = openReadOnly();
  } catch {
    return NextResponse.json(
      { error: "db_unavailable", message: "Run `npm run db:init` to build the map index." },
      { status: 503 },
    );
  }

  try {
    const { meta, ...key } = parsed.data;
    if (meta === "bounds") {
      return NextResponse.json(agreementBounds(db, key));
    }
    const fc = dispositionsToFeatureCollection(agreementFeatures(db, key), (d) => ({
      agreementNumber: d.agreementNumber,
      tract: d.tract ?? null,
      family: d.family,
      status: d.status ?? null,
      currentExpiryDate: d.currentExpiryDate ?? null,
      areaHa: d.areaHa ?? null,
      agreementType: d.agreementType ?? null,
    }));
    return NextResponse.json(fc);
  } finally {
    db.close();
  }
}
