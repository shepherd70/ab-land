/**
 * Holding detail — all tracts of one agreement, with a map of their polygons.
 *
 * @module app/holdings/[agreementId]/page
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §1
 */
import Link from "next/link";
import type { FeatureCollection, Geometry } from "geojson";
import type { Disposition } from "@/lib/types";
import { openReadOnly } from "@/lib/db/client";
import { getByAgreementNumber } from "@/lib/db/queries";
import { HoldingDetail } from "@/components/HoldingDetail";
import { MapView } from "@/components/MapView";

export const dynamic = "force-dynamic";

export default async function HoldingPage({
  params,
}: {
  params: Promise<{ agreementId: string }>;
}) {
  const { agreementId } = await params;
  const id = decodeURIComponent(agreementId);

  let holdings: Disposition[] = [];
  let dbError = false;
  try {
    const db = openReadOnly();
    try {
      holdings = getByAgreementNumber(db, id);
    } finally {
      db.close();
    }
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <main className="mx-auto max-w-3xl flex-1 p-6">
        <p className="text-sm">
          Database not ready. Run <code>npm run db:init &amp;&amp; npm run ingest</code>.
        </p>
      </main>
    );
  }

  if (holdings.length === 0) {
    return (
      <main className="mx-auto max-w-3xl flex-1 p-6">
        <p className="text-sm">
          No agreement <strong>{id}</strong> found.
        </p>
        <Link href="/" className="text-sm underline">
          ← Back to search
        </Link>
      </main>
    );
  }

  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: holdings
      .filter((h) => h.geometryGeoJSON)
      .map((h) => ({
        type: "Feature",
        properties: { agreementNumber: h.agreementNumber, tract: h.tract ?? null },
        geometry: JSON.parse(h.geometryGeoJSON as string) as Geometry,
      })),
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Link href="/" className="text-sm text-zinc-500 underline-offset-2 hover:underline">
        ← Search
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Agreement {id}</h1>
      <div className="mt-4">
        <HoldingDetail d={holdings[0]} />
      </div>
      {fc.features.length > 0 && (
        <div className="mt-6">
          <MapView data={fc} />
        </div>
      )}
    </main>
  );
}
