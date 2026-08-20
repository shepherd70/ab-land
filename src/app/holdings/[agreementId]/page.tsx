/**
 * Holding detail — all tracts of one agreement, with a map of their polygons.
 * Legacy agreement numbers repeat across families and agreement types, so a
 * canonical link includes source/family/type query parameters. Bare legacy
 * links remain useful and render each distinct identity as its own section.
 *
 * @module app/holdings/[agreementId]/page
 * Data source: local SQLite (read-only)
 * @see CLAUDE.md §1, §5
 */
import Link from "next/link";
import type { FeatureCollection, Geometry } from "geojson";
import type { Disposition } from "@/lib/types";
import { openReadOnly } from "@/lib/db/client";
import { getByAgreementNumber } from "@/lib/db/queries";
import { familyLabel } from "@/lib/map/families";
import { formatAgreementType } from "@/lib/tenure";
import { HoldingDetail } from "@/components/HoldingDetail";
import { MapView } from "@/components/MapView";

export const dynamic = "force-dynamic";

export default async function HoldingPage({
  params,
  searchParams,
}: {
  params: Promise<{ agreementId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { agreementId } = await params;
  const query = await searchParams;
  const id = decodeURIComponent(agreementId);

  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  let holdings: Disposition[] = [];
  let dbError = false;
  try {
    const db = openReadOnly();
    try {
      holdings = getByAgreementNumber(db, id, {
        source: first(query.source),
        family: first(query.family),
        agreementType: first(query.type),
      });
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
          ← Back to map
        </Link>
      </main>
    );
  }

  // One section per complete agreement identity — normally exactly one.
  const groups = new Map<string, Disposition[]>();
  for (const h of holdings) {
    const key = `${h.source}/${h.family}/${h.agreementType ?? ""}`;
    const g = groups.get(key);
    if (g) g.push(h);
    else groups.set(key, [h]);
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
        ← Map
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Agreement {id}</h1>
      {groups.size > 1 && (
        <p className="mt-1 text-sm text-zinc-500">
          {groups.size} distinct agreements share this legacy number; each is shown separately.
        </p>
      )}
      {[...groups.entries()].map(([key, tracts]) => (
        <div key={key} className="mt-4">
          {groups.size > 1 && (
            <h2 className="mb-2 text-sm font-semibold text-zinc-500">
              {familyLabel(tracts[0].family)} · {formatAgreementType(tracts[0].agreementType)}
            </h2>
          )}
          <HoldingDetail tracts={tracts} />
        </div>
      ))}
      {fc.features.length > 0 && (
        <div className="mt-6">
          <MapView data={fc} />
        </div>
      )}
    </main>
  );
}
