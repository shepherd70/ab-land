/**
 * GET /api/companies/:name/features — a company's parcels as a GeoJSON
 * FeatureCollection for the profile map. Ships full polygons when the holder's
 * stored geometry fits the byte budget, otherwise centroid points; the mode is
 * decided from a lean stats query so oversized geometry is never fetched.
 * Response: { mode, parcels, featureCollection }.
 *
 * @module app/api/companies/[name]/features/route
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §3, §11
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CompanyFeaturesParams } from "@/lib/schemas";
import { openReadOnly } from "@/lib/db/client";
import { companyGeometryStats, listByCompany } from "@/lib/db/queries";
import {
  dispositionsToCentroidFeatureCollection,
  dispositionsToFeatureCollection,
} from "@/lib/map/geojson";
import { companyFeatureProps, pickCompanyMapMode } from "@/lib/map/company_features";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const company = decodeURIComponent(name);

  const parsed = CompanyFeaturesParams.safeParse({
    budget: req.nextUrl.searchParams.get("budget") ?? undefined,
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
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  try {
    const { parcels, geometryBytes } = companyGeometryStats(db, company);
    const mode = pickCompanyMapMode(geometryBytes, parsed.data.budget);
    const rows = listByCompany(db, company, mode === "polygons");
    const featureCollection =
      mode === "polygons"
        ? dispositionsToFeatureCollection(rows, companyFeatureProps)
        : dispositionsToCentroidFeatureCollection(rows, companyFeatureProps);
    return NextResponse.json({ mode, parcels, featureCollection });
  } finally {
    db.close();
  }
}
