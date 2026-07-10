/**
 * GET /api/map/centroids — every parcel centroid as a lean array, for the
 * clustered province-wide map overview.
 *
 * @module app/api/map/centroids/route
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §3
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MapCentroidsParams } from "@/lib/schemas";
import { openReadOnly } from "@/lib/db/client";
import { centroidsAll } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = MapCentroidsParams.safeParse({
    families: sp.get("families") ?? undefined,
    company: sp.get("company") ?? undefined,
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
    const { families, company } = parsed.data;
    return NextResponse.json({ centroids: centroidsAll(db, { families, company }) });
  } finally {
    db.close();
  }
}
