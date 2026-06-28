/**
 * Attribute panel for a single disposition.
 *
 * @module components/HoldingDetail
 * Data source: none (renders a provided Disposition)
 * @see CLAUDE.md §1
 */
import type { Disposition } from "@/lib/types";

function Row({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 dark:border-zinc-900">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium">{value ?? "—"}</dd>
    </div>
  );
}

export function HoldingDetail({ d }: { d: Disposition }) {
  return (
    <dl className="text-sm">
      <Row label="Agreement" value={d.agreementNumber} />
      <Row label="Tract" value={d.tract} />
      <Row label="Type" value={d.agreementType} />
      <Row label="Status" value={d.status} />
      <Row label="Holder (designated rep)" value={d.holderDesrep} />
      <Row label="Participants" value={d.participants?.join(", ")} />
      <Row label="Term date" value={d.termDate} />
      <Row label="Current expiry" value={d.currentExpiryDate} />
      <Row label="Zone" value={d.zoneDesc} />
      <Row label="Substance / category" value={d.targetSubstance} />
      <Row label="Area (ha)" value={d.areaHa != null ? d.areaHa.toFixed(1) : undefined} />
    </dl>
  );
}
