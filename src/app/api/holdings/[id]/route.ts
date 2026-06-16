/**
 * GET /api/holdings/:id — all tracts of one agreement number (with geometry).
 *
 * @module app/api/holdings/[id]/route
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §3
 */
import { NextResponse } from "next/server";
import { openReadOnly } from "@/lib/db/client";
import { getByAgreementNumber } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let db: ReturnType<typeof openReadOnly>;
  try {
    db = openReadOnly();
  } catch {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  try {
    return NextResponse.json({ holdings: getByAgreementNumber(db, decodeURIComponent(id)) });
  } finally {
    db.close();
  }
}
