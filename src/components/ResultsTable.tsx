/**
 * Tabular search results. Links to holding detail and company profile.
 * One row per parcel/tract — a multi-tract agreement appears once per tract.
 * Application rows (A-prefixed type codes) carry an explicit badge — they are
 * requests for tenure, not granted agreements.
 *
 * @module components/ResultsTable
 * Data source: none (renders provided rows)
 * @see CLAUDE.md §1
 */
import Link from "next/link";
import type { Disposition } from "@/lib/types";
import { formatAgreementType, formatExpiry, isApplicationType } from "@/lib/tenure";

export function ResultsTable({ rows }: { rows: Disposition[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
          <th className="py-2 pr-4 font-medium">Agreement</th>
          <th className="py-2 pr-4 font-medium">Type</th>
          <th className="py-2 pr-4 font-medium">Holder</th>
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 pr-4 font-medium">Expiry</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr
            key={d.id ?? `${d.source}-${d.family}-${d.agreementNumber}-${d.tract ?? ""}`}
            className="border-b border-zinc-100 dark:border-zinc-900"
          >
            <td className="py-2 pr-4">
              <Link
                href={`/holdings/${encodeURIComponent(d.agreementNumber)}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {d.agreementNumber}
                {d.tract ? `-${d.tract}` : ""}
              </Link>
              {isApplicationType(d.agreementType) && (
                <span
                  className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  title="Application for tenure — not a granted agreement"
                >
                  Application
                </span>
              )}
            </td>
            <td className="py-2 pr-4" title={d.agreementType ?? undefined}>
              {formatAgreementType(d.agreementType)}
            </td>
            <td className="py-2 pr-4">
              {d.holderDesrep ? (
                <Link
                  href={`/companies/${encodeURIComponent(d.holderDesrep)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {d.holderDesrep}
                </Link>
              ) : (
                "—"
              )}
            </td>
            <td className="py-2 pr-4">{d.status ?? "—"}</td>
            <td className="py-2 pr-4">{formatExpiry(d.currentExpiryDate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
