/**
 * Shared parcel-popup markup for the map views (province explorer + company
 * map). All DB-sourced strings are escaped before injection into popup HTML.
 *
 * @module lib/map/popup
 * Data source: none (re-shapes already-validated DB rows for display)
 * @see CLAUDE.md §5, §11
 */
import { formatAgreementType, formatExpiry } from "../tenure";
import { familyLabel } from "./families";

/** Escape a string for safe injection into popup HTML (untrusted DB data). */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Popup markup for a clicked parcel feature. All DB strings are escaped. */
export function popupHtml(props: Record<string, unknown>): string {
  const agreement = String(props.agreementNumber ?? "");
  const href = `/holdings/${encodeURIComponent(agreement)}`;
  const rows: string[] = [];
  if (props.agreementType)
    rows.push(`<div>Type: ${escapeHtml(formatAgreementType(props.agreementType as string))}</div>`);
  if (props.status) rows.push(`<div>Status: ${escapeHtml(props.status)}</div>`);
  rows.push(`<div>Expiry: ${escapeHtml(formatExpiry(props.currentExpiryDate as string | null))}</div>`);
  if (props.areaHa != null) rows.push(`<div>${escapeHtml(props.areaHa)} ha</div>`);
  return `
    <div class="text-xs leading-5">
      <div class="font-semibold">${escapeHtml(familyLabel(String(props.family ?? "")))}</div>
      <div class="text-zinc-500">Agreement ${escapeHtml(agreement)}${
        props.tract ? `-${escapeHtml(props.tract)}` : ""
      }</div>
      ${rows.join("")}
      <a href="${href}" class="mt-1 inline-block font-medium underline">View holding →</a>
    </div>`;
}
