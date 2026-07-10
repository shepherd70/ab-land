/**
 * GET /api/companies/:name — all holdings for a (heuristically matched) holder.
 *
 * @module app/api/companies/[name]/route
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §3, §11
 */
import { NextResponse } from "next/server";
import { openReadOnly } from "@/lib/db/client";
import { listByCompany } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  let db: ReturnType<typeof openReadOnly>;
  try {
    db = openReadOnly();
  } catch {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  try {
    return NextResponse.json({
      holdings: listByCompany(db, decodeURIComponent(name), { withGeometry: true }),
    });
  } finally {
    db.close();
  }
}
