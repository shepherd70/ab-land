/**
 * GET /api/map/features — dispositions whose polygons overlap a map viewport,
 * as a GeoJSON FeatureCollection with lean per-parcel properties.
 *
 * @module app/api/map/features/route
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §3
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MapFeaturesParams } from "@/lib/schemas";
import { openReadOnly } from "@/lib/db/client";
import { featuresInViewport } from "@/lib/db/queries";
import { dispositionsToFeatureCollection } from "@/lib/map/geojson";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = MapFeaturesParams.safeParse({
    bbox: sp.get("bbox") ?? "",
    families: sp.get("families") ?? undefined,
    status: sp.get("status") ?? undefined,
    company: sp.get("company") ?? undefined,
    limit: sp.get("limit") ?? undefined,
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
    const { bbox, families, status, company, limit } = parsed.data;
    const rows = featuresInViewport(db, bbox, { families, status, company, limit });
    const fc = dispositionsToFeatureCollection(rows, (d) => ({
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
