/**
 * GET /api/search — search dispositions by company / agreement number / ATS.
 *
 * @module app/api/search/route
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §3
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SearchParams } from "@/lib/schemas";
import { openReadOnly } from "@/lib/db/client";
import { searchDispositions } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const parsed = SearchParams.safeParse({
    q: sp.get("q") ?? "",
    kind: sp.get("kind") ?? undefined,
    family: sp.get("family") ?? undefined,
    limit: sp.get("limit") ?? undefined,
    offset: sp.get("offset") ?? undefined,
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
      { error: "db_unavailable", message: "Run `npm run db:init && npm run ingest` first." },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json({ results: searchDispositions(db, parsed.data) });
  } finally {
    db.close();
  }
}
