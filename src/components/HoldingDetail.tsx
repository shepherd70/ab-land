/**
 * Attribute panel for one agreement — all of its tracts. An agreement can span
 * multiple tracts (natural key source+number+tract); shared fields render once
 * and per-tract fields (tract, zone, area, expiry) move into a table when the
 * agreement has more than one.
 *
 * @module components/HoldingDetail
 * Data source: none (renders provided Dispositions)
 * @see CLAUDE.md §1, §5
 */
import type { Disposition } from "@/lib/types";
import {
  formatAgreementType,
  formatExpiry,
  isApplicationType,
  targetSubstanceLabel,
} from "@/lib/tenure";

function Row({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 dark:border-zinc-900">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium">{value ?? "—"}</dd>
    </div>
  );
}

export function HoldingDetail({ tracts }: { tracts: Disposition[] }) {
  const d = tracts[0];
  if (!d) return null;
  const multi = tracts.length > 1;
  // Compare displayed values, not raw dates: an agreement whose tracts mix the
  // 8888/9999 continued sentinels does not "vary" — every tract renders the
  // same "Continued / no expiry".
  const expiryVaries = multi && new Set(tracts.map((t) => formatExpiry(t.currentExpiryDate))).size > 1;
  const substance = tracts.find((t) => t.targetSubstance)?.targetSubstance;

  return (
    <div>
      {isApplicationType(d.agreementType) && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <strong>Application</strong> — this record is an application for tenure, not a granted
          agreement.
        </p>
      )}
      <dl className="text-sm">
        <Row label="Agreement" value={d.agreementNumber} />
        <Row label="Type" value={formatAgreementType(d.agreementType, { withCode: true })} />
        <Row label="Status" value={d.status} />
        <Row label="Holder (designated rep)" value={d.holderDesrep} />
        <Row label="Participants" value={d.participants?.join(", ")} />
        <Row label="Term date" value={d.termDate} />
        <Row
          label="Current expiry"
          value={expiryVaries ? "Varies by tract (see below)" : formatExpiry(d.currentExpiryDate)}
        />
        {substance != null && <Row label={targetSubstanceLabel(d.family)} value={substance} />}
        {!multi && (
          <>
            <Row label="Tract" value={d.tract || undefined} />
            <Row label="Zone" value={d.zoneDesc} />
            <Row label="Area (ha)" value={d.areaHa != null ? d.areaHa.toFixed(1) : undefined} />
          </>
        )}
      </dl>
      {multi && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold">Tracts ({tracts.length})</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="py-2 pr-4 font-medium">Tract</th>
                <th className="py-2 pr-4 font-medium">Zone</th>
                <th className="py-2 pr-4 font-medium">Area (ha)</th>
                <th className="py-2 pr-4 font-medium">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {tracts.map((t) => (
                <tr
                  key={t.id ?? t.tract ?? ""}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-2 pr-4 font-medium">{t.tract || "—"}</td>
                  <td className="py-2 pr-4">{t.zoneDesc ?? "—"}</td>
                  <td className="py-2 pr-4">{t.areaHa != null ? t.areaHa.toFixed(1) : "—"}</td>
                  <td className="py-2 pr-4">{formatExpiry(t.currentExpiryDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
